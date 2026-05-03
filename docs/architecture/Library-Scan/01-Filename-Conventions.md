# Filename + folder conventions

xstream doesn't constrain users on file containers, codecs, or sources — it accepts any video extension you configure on a library. But the scanner relies on **filenames and folder layout** to decide what is a movie, what is a TV show, what is a season, what is an episode, and what is an "extra" living alongside a main file. Files that don't fit a recognised pattern still get indexed as `videos` rows but won't be promoted to the logical layer (`films` / episodes), which means they won't appear in the homepage's curated rows.

This document is the contract between the user's filesystem and the scanner. Editing the recognisers in `server-rust/src/services/library_scanner.rs` or `tv_discovery.rs` should keep this doc in sync.

## Movies

### File-level convention

Recommended forms — both work:

```
Title (Year).ext
Title.Year.Quality.Source-Group.ext
```

The parser tolerates `.`, `_`, ` ` (space), and `-` as word separators interchangeably. The **year** is the primary anchor: a 4-digit `19xx` or `20xx` sequence bordered by separators on both sides. Once the year is found, everything before it is the title and everything after is discarded as Scene tokens.

If no year is present the parser falls back to stripping a trailing `.NNNN[p]` resolution token (e.g. `.1080p`, `_2160p`) and treats the remaining stem as the title.

### Folder-level convention

Two layouts are supported — both for the same library:

| Layout | Shape | What becomes the movie |
|---|---|---|
| **Flat** | `Library/Title (Year).ext` | The file itself |
| **Folder** | `Library/Folder Name/main.ext` plus optional `extras…` | The largest video file in the folder; all others become `role='extra'` (trailers, deleted scenes, behind-the-scenes) hung off the same `Film` |

In folder layout, the folder name is used as the title-parsing input **if it contains a year**; otherwise the main file's name is used.

Tie-break for "main" when several files match: the file whose stem matches the folder name wins; if none match, the largest by size wins.

Nesting deeper than one level is not supported for movies. `Library/Genre/2009/3 Idiots/3-idiots.mkv` won't be picked up as a folder-scoped movie. Restructure or rename.

## TV

```
Library Root/
  Series Name/
    Season 1/
      Series.Name.S01E01.<anything>.ext
      Series.Name.S01E02.<anything>.ext
    Season 2/
      ...
```

- **Series name** = the folder under the library root. Sent to OMDb verbatim — no token stripping. Pick a folder name that matches what you'd type into IMDb.
- **Season folders** must contain a parseable digit. Recognised: `Season 1`, `Season 01`, `S1`, `S01`, plain `1`. Rejected: `Specials`, `Season 0`, anything without digits.
- **Episode files** must match `SxxExx` (any case) or `NxNN` (lowercase `x`). `SxxExx` wins when both patterns appear in the same name. The directory's season number takes precedence over the filename's season number on disagreement (a warning is logged).
- **Episode titles** come from OMDb. Filenames almost never carry them and the scanner does not parse them.

## Tokens the parser strips

When parsing a movie filename for OMDb lookup, the following tokens are removed before the title is sent. Match is case-insensitive.

| Category | Tokens |
|---|---|
| Resolution | `1080p`, `720p`, `2160p`, `4K`, `480p`, `360p`, `240p` |
| Source | `BluRay`, `Bluray`, `BDRip`, `BRRip`, `WEB-DL`, `WEBDL`, `WEBRip`, `HDRip`, `DVDRip`, `HDTV` |
| Video codec | `x264`, `x265`, `HEVC`, `H264`, `H265`, `AVC` |
| Audio codec | `AAC`, `AC3`, `EAC3`, `DTS`, `Atmos`, `TrueHD`, `DTS-HD` |
| Channels | `5.1`, `7.1`, `2.0` |
| HDR | `HDR`, `HDR10`, `DV`, `DolbyVision`, `10bit`, `12bit` |
| Group suffix | `-NAME` at end of stem (e.g. `-NAHOM`, `-RARBG`) |

## Examples — parsed correctly

```
3 Idiots (2009) (1080p BDRip x265 10bit EAC3 5.1).mkv
  → ("3 Idiots", 2009)

Bugonia.2025.4K.HDR.DV.2160p.WEBDL Ita Eng x265-NAHOM.mkv
  → ("Bugonia", 2025)

Mad Max- Fury Road (2015).mkv
  → ("Mad Max- Fury Road", 2015)

Severance/Season 2/Severance.S02E03.1080p.WEB-DL.mkv
  → series "Severance", season 2, episode 3
```

## Examples — won't match cleanly

```
MovieFile.mkv
  → ("MovieFile", None) — no year; OMDb may match by title alone

random.video.20240511.demo.mkv
  → year-shaped digits with separators will be misread as 2024 — caveat

Specials/01 - Christmas Special.mkv
  → "Specials" rejected as a season folder; episode dropped
```

## What you see when something doesn't match

- **Unmatched movies**: the file gets a `videos` row but no `Film`, so the homepage Movies row excludes it. It remains visible to admin/debug queries on `videos`.
- **Unparseable TV folder/file**: the file gets a `videos` row but no `episodes` row; warnings appear in the scanner log indicating which file or folder name was rejected.

The fix in both cases is to rename. The convention is intentionally narrow so the scanner stays predictable.
