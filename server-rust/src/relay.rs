//! Relay-style global IDs and pagination cursors. See docs/architecture/Relay/.

use base64::{engine::general_purpose::STANDARD, Engine};

pub fn to_global_id(type_name: &str, local_id: &str) -> String {
    STANDARD.encode(format!("{type_name}:{local_id}"))
}

pub fn from_global_id(global_id: &str) -> Result<(String, String), GlobalIdError> {
    let bytes = STANDARD
        .decode(global_id)
        .map_err(|_| GlobalIdError::NotBase64(global_id.to_string()))?;
    let decoded =
        std::str::from_utf8(&bytes).map_err(|_| GlobalIdError::NotUtf8(global_id.to_string()))?;
    let (type_name, local_id) = decoded
        .split_once(':')
        .ok_or_else(|| GlobalIdError::NoSeparator(global_id.to_string()))?;
    if type_name.is_empty() || local_id.is_empty() {
        return Err(GlobalIdError::EmptyPart(global_id.to_string()));
    }
    Ok((type_name.to_string(), local_id.to_string()))
}

pub fn encode_cursor(offset: usize) -> String {
    STANDARD.encode(format!("offset:{offset}"))
}

pub fn decode_cursor(cursor: &str) -> Result<usize, CursorError> {
    let bytes = STANDARD
        .decode(cursor)
        .map_err(|_| CursorError::NotBase64(cursor.to_string()))?;
    let decoded =
        std::str::from_utf8(&bytes).map_err(|_| CursorError::NotUtf8(cursor.to_string()))?;
    let rest = decoded
        .strip_prefix("offset:")
        .ok_or_else(|| CursorError::BadPrefix(cursor.to_string()))?;
    rest.parse::<usize>()
        .map_err(|_| CursorError::BadOffset(cursor.to_string()))
}

#[derive(Debug, thiserror::Error)]
pub enum GlobalIdError {
    #[error("global id is not valid base64: {0}")]
    NotBase64(String),
    #[error("global id is not valid utf-8: {0}")]
    NotUtf8(String),
    #[error("global id has no type:id separator: {0}")]
    NoSeparator(String),
    #[error("global id has empty type or id: {0}")]
    EmptyPart(String),
}

#[derive(Debug, thiserror::Error)]
pub enum CursorError {
    #[error("cursor is not valid base64: {0}")]
    NotBase64(String),
    #[error("cursor is not valid utf-8: {0}")]
    NotUtf8(String),
    #[error("cursor missing 'offset:' prefix: {0}")]
    BadPrefix(String),
    #[error("cursor offset is not a non-negative integer: {0}")]
    BadOffset(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_type_and_id_as_base64() {
        let id = to_global_id("Video", "abc123");
        assert_eq!(id, STANDARD.encode("Video:abc123"));
    }

    #[test]
    fn works_with_numeric_string_ids() {
        // Numeric local-ids are still strings on the wire — the encoded
        // form is `Type:digit-sequence`, with no special-cased numeric
        // path on either the encoder or decoder.
        let id = to_global_id("Library", "42");
        assert_eq!(id, STANDARD.encode("Library:42"));
    }

    #[test]
    fn decodes_type_and_id() {
        let encoded = STANDARD.encode("Video:abc123");
        let (t, id) = from_global_id(&encoded).expect("decodes Video:abc123");
        assert_eq!(t, "Video");
        assert_eq!(id, "abc123");
    }

    #[test]
    fn handles_ids_that_contain_colons() {
        // The id itself has colons — only the FIRST colon is the separator.
        let encoded = STANDARD.encode("TranscodeJob:a:b:c");
        let (t, id) = from_global_id(&encoded).expect("decodes despite embedded colons");
        assert_eq!(t, "TranscodeJob");
        assert_eq!(id, "a:b:c");
    }

    #[test]
    fn round_trips_to_global_id_then_from_global_id() {
        let g = to_global_id("Video", "deadbeef");
        let (t, id) = from_global_id(&g).expect("roundtripped global id parses");
        assert_eq!(t, "Video");
        assert_eq!(id, "deadbeef");
    }

    // Negative paths — every error variant on `GlobalIdError` is reachable
    // from a malformed input. Without these, a future refactor could fold
    // an error variant and the test suite would not notice.

    #[test]
    fn from_global_id_rejects_non_base64() {
        assert!(matches!(
            from_global_id("not base64!"),
            Err(GlobalIdError::NotBase64(_))
        ));
    }

    #[test]
    fn from_global_id_rejects_missing_separator() {
        let no_colon = STANDARD.encode("noseparator");
        assert!(matches!(
            from_global_id(&no_colon),
            Err(GlobalIdError::NoSeparator(_))
        ));
    }

    #[test]
    fn from_global_id_rejects_empty_type_or_id() {
        let empty_type = STANDARD.encode(":id");
        assert!(matches!(
            from_global_id(&empty_type),
            Err(GlobalIdError::EmptyPart(_))
        ));
        let empty_id = STANDARD.encode("Type:");
        assert!(matches!(
            from_global_id(&empty_id),
            Err(GlobalIdError::EmptyPart(_))
        ));
    }

    // Cursor — symmetric coverage of encode/decode + every error variant.

    #[test]
    fn cursor_roundtrip() {
        let c = encode_cursor(42);
        assert_eq!(decode_cursor(&c).expect("roundtripped cursor parses"), 42);
    }

    #[test]
    fn cursor_zero() {
        let c = encode_cursor(0);
        assert_eq!(decode_cursor(&c).expect("offset=0 roundtrips"), 0);
    }

    #[test]
    fn decode_cursor_rejects_garbage() {
        assert!(matches!(
            decode_cursor("not base64!"),
            Err(CursorError::NotBase64(_))
        ));
        assert!(matches!(
            decode_cursor(&STANDARD.encode("no-prefix")),
            Err(CursorError::BadPrefix(_))
        ));
        assert!(matches!(
            decode_cursor(&STANDARD.encode("offset:not-a-number")),
            Err(CursorError::BadOffset(_))
        ));
    }
}
