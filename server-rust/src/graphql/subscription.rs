//! Root Subscription — Step 1 stubs. The transcode-job and library-scan
//! event sources land in Step 2 along with the chunker and library scanner.
//! For now the streams emit an initial state and then close, which is enough
//! for the Relay client to wire up the subscription path without crashing.

use async_graphql::{Context, Subscription, ID};
use futures_util::stream::{self, BoxStream, StreamExt};

use crate::graphql::types::{LibraryScanProgress, LibraryScanUpdate, TranscodeJob};

pub struct Subscription;

impl Default for Subscription {
    fn default() -> Self {
        Self
    }
}

#[Subscription]
impl Subscription {
    async fn transcode_job_updated(
        &self,
        _ctx: &Context<'_>,
        _job_id: ID,
    ) -> BoxStream<'static, TranscodeJob> {
        // No event source in Step 1 — emit nothing and stay open.
        stream::pending::<TranscodeJob>().boxed()
    }

    async fn library_scan_updated(
        &self,
        _ctx: &Context<'_>,
    ) -> BoxStream<'static, LibraryScanUpdate> {
        // Emit an initial "not scanning" state immediately and then stay open.
        stream::iter(vec![LibraryScanUpdate { scanning: false }])
            .chain(stream::pending())
            .boxed()
    }

    async fn library_scan_progress(
        &self,
        _ctx: &Context<'_>,
    ) -> BoxStream<'static, LibraryScanProgress> {
        stream::iter(vec![LibraryScanProgress {
            scanning: false,
            library_id: None,
            done: None,
            total: None,
        }])
        .chain(stream::pending())
        .boxed()
    }
}
