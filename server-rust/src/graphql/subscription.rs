//! Root Subscription — transcode_job_updated, library_scan_* events wired to ScanState.

use async_graphql::{Context, Subscription, ID};
use futures_util::stream::{self, BoxStream, StreamExt};
use tokio_stream::wrappers::BroadcastStream;

use crate::config::AppContext;
use crate::graphql::types::{LibraryScanProgress, LibraryScanUpdate, TranscodeJob};
use crate::services::scan_state::ScanSnapshot;

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
        // No event source yet — emit nothing and stay open.
        stream::pending::<TranscodeJob>().boxed()
    }

    async fn library_scan_updated(
        &self,
        ctx: &Context<'_>,
    ) -> BoxStream<'static, LibraryScanUpdate> {
        let scan_state = ctx.data_unchecked::<AppContext>().scan_state.clone();
        let initial = LibraryScanUpdate::from(&scan_state.current());
        let live = BroadcastStream::new(scan_state.subscribe()).filter_map(|res| async move {
            res.ok()
                .map(|snap: ScanSnapshot| LibraryScanUpdate::from(&snap))
        });
        stream::iter(vec![initial]).chain(live).boxed()
    }

    async fn library_scan_progress(
        &self,
        ctx: &Context<'_>,
    ) -> BoxStream<'static, LibraryScanProgress> {
        let scan_state = ctx.data_unchecked::<AppContext>().scan_state.clone();
        let initial = LibraryScanProgress::from(&scan_state.current());
        let live = BroadcastStream::new(scan_state.subscribe()).filter_map(|res| async move {
            res.ok()
                .map(|snap: ScanSnapshot| LibraryScanProgress::from(&snap))
        });
        stream::iter(vec![initial]).chain(live).boxed()
    }
}
