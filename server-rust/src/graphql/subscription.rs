//! Root Subscription — transcode_job_updated, library_scan_* events wired to ScanState.

use async_graphql::{Context, Subscription, ID};
use futures_util::stream::{self, BoxStream, StreamExt};
use tokio_stream::wrappers::BroadcastStream;

use crate::config::AppContext;
use crate::graphql::types::{
    LibraryScanProgress, LibraryScanUpdate, ProfileAvailability, TranscodeJob,
};
use crate::services::availability_state::AvailabilityEvent;
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

    /// Live library reachability. Seeds one frame per library from the
    /// current DB status on connect (so the Profiles page reconciles its
    /// pills immediately), then forwards each flip the periodic probe loop
    /// detects. The Profiles query keeps returning cached status with no
    /// blocking probe; this channel is the out-of-band freshening path.
    async fn profile_availability_updated(
        &self,
        ctx: &Context<'_>,
    ) -> BoxStream<'static, ProfileAvailability> {
        let app = ctx.data_unchecked::<AppContext>();
        let state = app.availability_state.clone();
        let initial: Vec<ProfileAvailability> = crate::db::get_all_libraries(&app.db)
            .unwrap_or_default()
            .iter()
            .map(|row| {
                ProfileAvailability::from(&AvailabilityEvent {
                    library_id: row.id.clone(),
                    status: row.status.clone(),
                    last_seen_at: row.last_seen_at.clone(),
                })
            })
            .collect();
        let live = BroadcastStream::new(state.subscribe()).filter_map(|res| async move {
            res.ok()
                .map(|e: AvailabilityEvent| ProfileAvailability::from(&e))
        });
        stream::iter(initial).chain(live).boxed()
    }
}
