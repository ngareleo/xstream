//! Relay-style global IDs and pagination cursors.
//!
//! Mirrors `server/src/graphql/relay.ts` and `server/src/graphql/presenters.ts`
//! cursor helpers. Both encodings are base64 — keep byte-identical with the
//! Bun side or the client's Relay store will treat the same node as a
//! different record after the cutover and reset its in-memory state.

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
    fn global_id_roundtrip() {
        let g = to_global_id("Library", "abc123");
        let (t, id) = from_global_id(&g).unwrap();
        assert_eq!(t, "Library");
        assert_eq!(id, "abc123");
    }

    #[test]
    fn cursor_roundtrip() {
        let c = encode_cursor(42);
        assert_eq!(decode_cursor(&c).unwrap(), 42);
    }

    #[test]
    fn cursor_zero() {
        let c = encode_cursor(0);
        assert_eq!(decode_cursor(&c).unwrap(), 0);
    }
}
