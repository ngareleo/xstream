//! In-memory `DashMap`-backed lookup for live transcode jobs.

use dashmap::DashMap;
use std::sync::Arc;

use crate::services::active_job::ActiveJob;

#[derive(Clone, Default)]
pub struct JobStore {
    by_id: Arc<DashMap<String, ActiveJob>>,
}

impl JobStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, job: ActiveJob) {
        let id = job.with_inner(|i| i.id.clone());
        self.by_id.insert(id, job);
    }

    pub fn get(&self, id: &str) -> Option<ActiveJob> {
        self.by_id.get(id).map(|r| r.clone())
    }

    pub fn remove(&self, id: &str) -> Option<ActiveJob> {
        self.by_id.remove(id).map(|(_, v)| v)
    }

    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::scalars::JobStatus;
    use crate::graphql::scalars::Resolution;
    use crate::services::active_job::ActiveJobInner;

    fn job(id: &str) -> ActiveJob {
        ActiveJob::new(ActiveJobInner {
            id: id.to_string(),
            video_id: "vvvv".to_string(),
            resolution: Resolution::R1080p,
            status: JobStatus::Pending,
            segment_dir: format!("/tmp/{id}"),
            total_segments: None,
            completed_segments: 0,
            start_time_seconds: None,
            end_time_seconds: None,
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
            error: None,
            segments: Vec::new(),
            init_segment_path: None,
            connections: 0,
            error_code: None,
        })
    }

    #[test]
    fn insert_then_get_round_trips() {
        let store = JobStore::new();
        store.insert(job("j1"));
        assert!(store.get("j1").is_some());
    }

    #[test]
    fn get_returns_none_for_unknown_id() {
        let store = JobStore::new();
        assert!(store.get("missing").is_none());
    }

    #[test]
    fn remove_returns_inserted_handle() {
        let store = JobStore::new();
        store.insert(job("j1"));
        assert!(store.remove("j1").is_some());
        assert!(store.get("j1").is_none());
    }
}
