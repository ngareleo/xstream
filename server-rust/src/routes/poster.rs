//! `GET /poster/:basename` — stream cached OMDb poster images. See docs/architecture/Library-Scan/05-Poster-Caching.md.

use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension,
};
use tokio_util::io::ReaderStream;
use tracing::warn;

use crate::config::AppContext;

/// Reject anything that isn't a sized variant filename. The cache only
/// ever produces `<hex-sha1>.w<digits>.webp`, and that's the only shape
/// the route serves. Path traversal is structurally impossible — `.`
/// and `/` characters that aren't part of the size suffix don't fit
/// the regex.
fn is_safe_basename(name: &str) -> bool {
    crate::services::poster_cache::is_sized_variant_name(name)
}

fn content_type_for(_name: &str) -> &'static str {
    // Only sized .webp variants pass `is_safe_basename`, so MIME is
    // unconditional. Kept as a function for readability at the call
    // site and so a future format add (AVIF, JXL) is a one-line change.
    "image/webp"
}

pub async fn get_poster(
    Path(basename): Path<String>,
    Extension(ctx): Extension<AppContext>,
) -> Response {
    if !is_safe_basename(&basename) {
        return (StatusCode::BAD_REQUEST, "invalid poster name").into_response();
    }
    let target = ctx.config.poster_dir.join(&basename);
    let file = match tokio::fs::File::open(&target).await {
        Ok(f) => f,
        Err(err) => {
            // ENOENT is the common case before the worker has finished
            // downloading — log at debug and 404. Other errors get a
            // warn since they hint at fs / permissions trouble.
            if err.kind() == std::io::ErrorKind::NotFound {
                tracing::debug!(file = %target.display(), "poster not yet cached");
            } else {
                warn!(file = %target.display(), error = %err, "poster open failed");
            }
            return (StatusCode::NOT_FOUND, "poster not cached").into_response();
        }
    };
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type_for(&basename))
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(body)
        .unwrap_or_else(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not build response",
            )
                .into_response()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_basename_accepts_sized_webp_variants() {
        assert!(is_safe_basename("abcdef0123456789.w240.webp"));
        assert!(is_safe_basename("abcdef0123456789.w1600.webp"));
    }

    #[test]
    fn safe_basename_rejects_legacy_and_traversal() {
        assert!(!is_safe_basename(""));
        assert!(!is_safe_basename(".secret"));
        assert!(!is_safe_basename("../etc/passwd"));
        assert!(!is_safe_basename("a/b.webp"));
        assert!(!is_safe_basename("abcdef.jpg")); // legacy unsized
        assert!(!is_safe_basename("abcdef.webp")); // missing size segment
        assert!(!is_safe_basename("abcdef.w240.webp.part")); // staging file
    }

    #[test]
    fn content_type_is_image_webp() {
        assert_eq!(content_type_for("anything.w800.webp"), "image/webp");
    }
}
