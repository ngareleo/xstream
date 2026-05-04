//! Tail-reader for ffmpeg's single-file output; splits it into fMP4 segments. See docs/architecture/Streaming/07-Fmp4-Tail-Reader.md.

use std::path::{Path, PathBuf};

use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt, SeekFrom};
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

/// Polling cadence between file-size checks. ffmpeg flushes a moof+mdat
/// pair every `frag_duration` (typically 2 s); shorter polls catch
/// fragments quickly without busy-waiting.
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Minimum bytes the reader needs to parse a top-level box header
/// (size + type = 8 bytes; size==1 extends to 16-byte header).
const MIN_BOX_HEADER: usize = 8;

/// Run the tail-reader to completion, splitting ffmpeg's single-file output into segment files.
pub async fn run(
    source: PathBuf,
    output_dir: PathBuf,
    mut done: oneshot::Receiver<()>,
) -> Result<TailStats, TailError> {
    let mut state = State::new();

    // Wait for the source file to appear. ffmpeg may not have created it
    // yet; up to ~2 s of polling matches the same budget the existing
    // init-watcher uses.
    let mut file = open_when_ready(&source).await?;

    let mut buf = vec![0u8; 65536];
    let mut read_pos: u64 = 0;

    loop {
        // Drain whatever has been written since last read.
        loop {
            file.seek(SeekFrom::Start(read_pos))
                .await
                .map_err(TailError::Io)?;
            let n = file.read(&mut buf).await.map_err(TailError::Io)?;
            if n == 0 {
                break;
            }
            state.feed(&buf[..n]);
            read_pos += n as u64;
            // Process all complete top-level boxes the buffer now holds.
            state.flush(&output_dir).await?;
        }

        // Check whether ffmpeg has signalled completion. Once it has,
        // do one final read pass to drain anything written between our
        // last read and the signal, then exit.
        match done.try_recv() {
            Ok(()) | Err(oneshot::error::TryRecvError::Closed) => {
                file.seek(SeekFrom::Start(read_pos))
                    .await
                    .map_err(TailError::Io)?;
                let n = file.read(&mut buf).await.map_err(TailError::Io)?;
                if n > 0 {
                    state.feed(&buf[..n]);
                    state.flush(&output_dir).await?;
                }
                return Ok(state.stats);
            }
            Err(oneshot::error::TryRecvError::Empty) => {}
        }

        sleep(POLL_INTERVAL).await;
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TailError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse error: {0}")]
    Parse(String),
}

#[derive(Debug, Default, Clone)]
pub struct TailStats {
    pub init_bytes: u64,
    pub segments_written: u32,
    pub total_bytes: u64,
}

/// Parser state. Buffers incoming bytes, advances through complete
/// top-level boxes, splits them into init / segment files.
struct State {
    /// Bytes accumulated so far that have not yet been written out.
    /// Cleared once the corresponding boxes are committed to disk.
    buf: Vec<u8>,
    /// Offset within `buf` where the next unparsed box begins.
    cursor: usize,
    /// Whether the leading `ftyp+moov` (init) has been written.
    init_written: bool,
    /// Bytes accumulated for the *current* media segment. These hold
    /// one or more boxes belonging to the segment under construction —
    /// `[styp?][sidx*][moof][mdat]`. Flushed atomically when an `mdat`
    /// closes the segment.
    pending_segment: Vec<u8>,
    /// Index of the next `segment_NNNN.m4s` to write.
    next_segment: u32,
    stats: TailStats,
}

impl State {
    fn new() -> Self {
        Self {
            buf: Vec::with_capacity(1 << 20),
            cursor: 0,
            init_written: false,
            pending_segment: Vec::with_capacity(1 << 20),
            next_segment: 0,
            stats: TailStats::default(),
        }
    }

    fn feed(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Walk completed top-level boxes from `cursor` forward, peeling
    /// init bytes off the front and accumulating media-segment boxes
    /// into `pending_segment`. Writes whatever is ready.
    async fn flush(&mut self, output_dir: &Path) -> Result<(), TailError> {
        loop {
            let avail = self.buf.len().saturating_sub(self.cursor);
            if avail < MIN_BOX_HEADER {
                break;
            }

            let (size, type_bytes, header_len) = parse_box_header(&self.buf[self.cursor..])?;
            if avail < size {
                // Box body not fully arrived yet.
                break;
            }
            let box_end = self.cursor + size;
            let box_type: [u8; 4] = type_bytes;

            if !self.init_written {
                if &box_type == b"moof" {
                    // Init ends just before the first `moof`. Write
                    // everything in `buf[..self.cursor]`.
                    let init_bytes = &self.buf[..self.cursor];
                    write_atomic(&output_dir.join("init.mp4"), init_bytes).await?;
                    info!(bytes = init_bytes.len(), "fmp4_tail.init_written");
                    self.stats.init_bytes = init_bytes.len() as u64;
                    self.init_written = true;
                    // Drop the init bytes from the buffer so cursor /
                    // buf grow only with future media data.
                    self.buf.drain(..self.cursor);
                    self.cursor = 0;
                    continue;
                }
                // Pre-init box (ftyp, moov, free, …). Keep accumulating.
                self.cursor = box_end;
                continue;
            }

            // Post-init: collect boxes into the current segment until
            // we see an `mdat` that closes the fragment.
            self.pending_segment
                .extend_from_slice(&self.buf[self.cursor..box_end]);
            let _ = header_len; // header_len is informational here; size already covers it.
            self.cursor = box_end;

            if &box_type == b"mdat" {
                // A complete segment is now buffered: [styp?][sidx*][moof][mdat].
                let path = output_dir.join(format!("segment_{:04}.m4s", self.next_segment));
                write_atomic(&path, &self.pending_segment).await?;
                self.stats.segments_written += 1;
                self.stats.total_bytes += self.pending_segment.len() as u64;
                let segment_index = self.next_segment;
                let bytes_written = self.pending_segment.len();
                info!(
                    segment_index,
                    bytes = bytes_written,
                    "fmp4_tail.segment_written",
                );
                self.next_segment += 1;
                self.pending_segment.clear();

                // Compact the read buffer so we don't grow it
                // unboundedly across hundreds of segments.
                self.buf.drain(..self.cursor);
                self.cursor = 0;
            }
        }
        Ok(())
    }
}

/// Parse a single MP4 box header. Returns `(total_size_in_bytes,
/// type, header_length)`. Supports the ISO BMFF largesize encoding
/// (size==1 → 64-bit size in next 8 bytes).
fn parse_box_header(bytes: &[u8]) -> Result<(usize, [u8; 4], usize), TailError> {
    if bytes.len() < MIN_BOX_HEADER {
        return Err(TailError::Parse("box header truncated".into()));
    }
    let size32 = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    let typ: [u8; 4] = [bytes[4], bytes[5], bytes[6], bytes[7]];
    if size32 == 1 {
        if bytes.len() < 16 {
            return Err(TailError::Parse("largesize box truncated".into()));
        }
        let size64 = u64::from_be_bytes([
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
        ]);
        return Ok((size64 as usize, typ, 16));
    }
    if size32 == 0 {
        // Box extends to EOF. We refuse to handle this — fragmented
        // MP4 from ffmpeg never writes size==0 in practice.
        return Err(TailError::Parse(format!(
            "box with size=0 (extends-to-EOF) not supported, type={}",
            String::from_utf8_lossy(&typ)
        )));
    }
    Ok((size32 as usize, typ, 8))
}

/// Write `bytes` to `final_path` via a `<final_path>.tmp` + atomic
/// rename. The segment watcher upstream filters by exact filename, so
/// only the rename's CREATE event is observed.
async fn write_atomic(final_path: &Path, bytes: &[u8]) -> Result<(), TailError> {
    // Append `.tmp` to the full filename — so `init.mp4` → `init.mp4.tmp`.
    // Cheaper and more obvious than `with_extension` juggling, and the
    // segment watcher's exact-filename filter ignores anything ending in
    // `.tmp` either way.
    let mut tmp_os = final_path.as_os_str().to_owned();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);
    let mut f = File::create(&tmp_path).await.map_err(TailError::Io)?;
    f.write_all(bytes).await.map_err(TailError::Io)?;
    f.sync_data().await.map_err(TailError::Io)?;
    drop(f);
    tokio::fs::rename(&tmp_path, final_path)
        .await
        .map_err(TailError::Io)?;
    Ok(())
}

/// Open `path` once it appears, polling for up to ~5 s. Returns the
/// open file or an Io error if the timeout elapses.
async fn open_when_ready(path: &Path) -> Result<File, TailError> {
    for _ in 0..100 {
        match OpenOptions::new().read(true).open(path).await {
            Ok(f) => return Ok(f),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                sleep(POLL_INTERVAL).await;
            }
            Err(err) => return Err(TailError::Io(err)),
        }
    }
    warn!(path = %path.display(), "fmp4_tail: source file did not appear within budget");
    Err(TailError::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "fmp4 source not created within timeout",
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// Build a synthetic fragmented MP4 containing a tiny ftyp + moov +
    /// two `[moof + mdat]` segments. Box bodies are placeholder bytes;
    /// the parser only inspects header sizes/types.
    fn synth_fmp4() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&make_box(b"ftyp", &[0u8; 16])); // 24 bytes
        out.extend_from_slice(&make_box(b"moov", &[0u8; 200])); // 208 bytes
        out.extend_from_slice(&make_box(b"moof", &[0u8; 100])); // 108 bytes
        out.extend_from_slice(&make_box(b"mdat", &[0u8; 4096])); // 4104 bytes — segment 0
        out.extend_from_slice(&make_box(b"moof", &[0u8; 100]));
        out.extend_from_slice(&make_box(b"mdat", &[0u8; 8192])); // segment 1
        out
    }

    fn make_box(typ: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let size = (8 + body.len()) as u32;
        let mut v = Vec::with_capacity(size as usize);
        v.extend_from_slice(&size.to_be_bytes());
        v.extend_from_slice(typ);
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn parse_box_header_reads_32bit_size() {
        let b = make_box(b"moof", &[0u8; 100]);
        let (size, typ, header) = parse_box_header(&b).unwrap();
        assert_eq!(size, 108);
        assert_eq!(&typ, b"moof");
        assert_eq!(header, 8);
    }

    #[test]
    fn parse_box_header_supports_largesize() {
        let mut b = vec![
            0, 0, 0, 1, // size==1 sentinel
            b's', b't', b'y', b'p', // type
            0, 0, 0, 0, 0, 0, 0, 24, // 64-bit size
        ];
        b.extend_from_slice(&[0u8; 8]);
        let (size, typ, header) = parse_box_header(&b).unwrap();
        assert_eq!(size, 24);
        assert_eq!(&typ, b"styp");
        assert_eq!(header, 16);
    }

    #[test]
    fn parse_box_header_rejects_size_zero() {
        let b = vec![
            0, 0, 0, 0, // size==0 (extends to EOF)
            b'f', b'r', b'e', b'e',
        ];
        let err = parse_box_header(&b).unwrap_err();
        assert!(matches!(err, TailError::Parse(_)));
    }

    #[tokio::test]
    async fn split_writes_init_and_segments() {
        let dir = tempdir().unwrap();
        let source_path = dir.path().join("chunk.fmp4");
        let output_dir = dir.path().to_path_buf();

        // Pre-write the entire synthetic fmp4 — emulates ffmpeg
        // having finished by the time the reader gets there.
        tokio::fs::write(&source_path, synth_fmp4()).await.unwrap();

        let (tx, rx) = oneshot::channel();
        let _ = tx.send(()); // signal completion immediately

        let stats = run(source_path, output_dir.clone(), rx).await.unwrap();

        // init.mp4 should hold ftyp + moov bytes.
        let init = tokio::fs::read(output_dir.join("init.mp4")).await.unwrap();
        assert_eq!(init.len(), 24 + 208);
        assert_eq!(&init[4..8], b"ftyp");
        assert_eq!(&init[24 + 4..24 + 8], b"moov");

        // Two segments, each [moof + mdat].
        assert_eq!(stats.segments_written, 2);
        let seg0 = tokio::fs::read(output_dir.join("segment_0000.m4s"))
            .await
            .unwrap();
        let seg1 = tokio::fs::read(output_dir.join("segment_0001.m4s"))
            .await
            .unwrap();
        assert_eq!(seg0.len(), 108 + 4104);
        assert_eq!(seg1.len(), 108 + 8200);
        assert_eq!(&seg0[4..8], b"moof");
        assert_eq!(&seg0[108 + 4..108 + 8], b"mdat");
        assert_eq!(&seg1[4..8], b"moof");
        assert_eq!(&seg1[108 + 4..108 + 8], b"mdat");
    }

    #[tokio::test]
    async fn split_handles_partial_then_complete_writes() {
        // Simulate ffmpeg writing in two chunks: first the init + first
        // half of segment 0, then the rest. The tail-reader should
        // hold off until each box is complete.
        let dir = tempdir().unwrap();
        let source_path = dir.path().join("chunk.fmp4");
        let output_dir = dir.path().to_path_buf();
        let full = synth_fmp4();
        // Write a prefix that ends mid-mdat of segment 0. ftyp(24) +
        // moov(208) + moof(108) + half of mdat(4104).
        let prefix_len = 24 + 208 + 108 + 100;
        tokio::fs::write(&source_path, &full[..prefix_len])
            .await
            .unwrap();

        let (tx, rx) = oneshot::channel();
        let source = source_path.clone();
        let out = output_dir.clone();
        let handle = tokio::spawn(async move { run(source, out, rx).await });
        // Briefly let the reader poll, then write the remaining bytes
        // and signal done.
        sleep(Duration::from_millis(150)).await;
        // Append the rest atomically.
        let mut f = OpenOptions::new()
            .append(true)
            .open(&source_path)
            .await
            .unwrap();
        f.write_all(&full[prefix_len..]).await.unwrap();
        f.sync_data().await.unwrap();
        drop(f);
        sleep(Duration::from_millis(150)).await;
        let _ = tx.send(());
        let stats = handle.await.unwrap().unwrap();
        assert_eq!(stats.segments_written, 2);
        let init = tokio::fs::read(output_dir.join("init.mp4")).await.unwrap();
        assert_eq!(init.len(), 24 + 208);
    }
}
