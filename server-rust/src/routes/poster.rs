//! `GET /poster/:basename` — stream a cached OMDb poster image from
//! `AppConfig::poster_dir`. Files are content-addressed by
//! `sha1(url)+ext` so the basename is enough to locate them; the route
//! sets `Cache-Control: max-age=31536000, immutable` since the content
//! at a given hash never changes.
//!
//! See `docs/architecture/Library-Scan/05-Poster-Caching.md`.

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

const SAFE_BASENAME_CHARS: &[char] = &['.'];

/// Reject path traversal attempts. Filenames are expected to look like
/// `<sha1>.<ext>` — alphanumeric characters and a single dot. Anything
/// with a slash, leading dot, or non-alphanumeric chars (besides the
/// dot) is rejected up front.
fn is_safe_basename(name: &str) -> bool {
    if name.is_empty() || name.starts_with('.') {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || SAFE_BASENAME_CHARS.contains(&c))
}

fn content_type_for(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    }
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
    fn safe_basename_accepts_hash_dot_ext() {
        assert!(is_safe_basename("abcdef0123456789.jpg"));
        assert!(is_safe_basename("aaaa.png"));
    }

    #[test]
    fn safe_basename_rejects_traversal_and_dotted_names() {
        assert!(!is_safe_basename(""));
        assert!(!is_safe_basename(".secret"));
        assert!(!is_safe_basename("../etc/passwd"));
        assert!(!is_safe_basename("a/b.jpg"));
        assert!(!is_safe_basename("a%20b.jpg"));
    }

    #[test]
    fn content_type_picks_correct_image_mime() {
        assert_eq!(content_type_for("a.jpg"), "image/jpeg");
        assert_eq!(content_type_for("a.JPG"), "image/jpeg");
        assert_eq!(content_type_for("a.png"), "image/png");
        assert_eq!(content_type_for("a.webp"), "image/webp");
        assert_eq!(content_type_for("a.gif"), "image/gif");
    }
}
