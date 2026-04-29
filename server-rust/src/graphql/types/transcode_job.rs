//! `TranscodeJob` + the `StartTranscodeResult` typed-error union.

use async_graphql::{Context, Object, SimpleObject, Union, ID};

use super::video::Video;
use crate::db::{get_video_by_id, Db, TranscodeJobRow};
use crate::graphql::scalars::{JobStatus, PlaybackErrorCode, Resolution};
use crate::relay::to_global_id;
use crate::services::active_job::ActiveJob;

#[derive(Clone)]
pub struct TranscodeJob {
    pub id: ID,
    pub resolution: Resolution,
    pub status: JobStatus,
    pub total_segments: Option<i32>,
    pub completed_segments: i32,
    pub start_time_seconds: Option<f64>,
    pub end_time_seconds: Option<f64>,
    pub created_at: String,
    pub error: Option<String>,
    pub error_code: Option<PlaybackErrorCode>,
    pub raw_video_id: String,
}

impl TranscodeJob {
    pub fn from_row(row: &TranscodeJobRow) -> Self {
        Self {
            id: ID(to_global_id("TranscodeJob", &row.id)),
            resolution: Resolution::from_internal(&row.resolution).unwrap_or_else(|| {
                tracing::warn!(
                    job_id = %row.id,
                    raw = %row.resolution,
                    "transcode_jobs.resolution held an unknown value — defaulting to 1080p"
                );
                Resolution::R1080p
            }),
            status: JobStatus::from_internal(&row.status).unwrap_or_else(|| {
                tracing::warn!(
                    job_id = %row.id,
                    raw = %row.status,
                    "transcode_jobs.status held an unknown value — defaulting to PENDING"
                );
                JobStatus::Pending
            }),
            total_segments: row.total_segments.map(|n| n as i32),
            completed_segments: row.completed_segments as i32,
            start_time_seconds: row.start_time_seconds,
            end_time_seconds: row.end_time_seconds,
            created_at: row.created_at.clone(),
            error: row.error.clone(),
            error_code: None,
            raw_video_id: row.video_id.clone(),
        }
    }

    /// Build directly from an `ActiveJob` — used by the `start_transcode`
    /// resolver which already has the in-memory handle.
    pub fn from_active(job: &ActiveJob) -> Self {
        job.with_inner(|i| Self {
            id: ID(to_global_id("TranscodeJob", &i.id)),
            resolution: i.resolution,
            status: i.status,
            total_segments: i.total_segments.map(|n| n as i32),
            completed_segments: i.completed_segments as i32,
            start_time_seconds: i.start_time_seconds,
            end_time_seconds: i.end_time_seconds,
            created_at: i.created_at.clone(),
            error: i.error.clone(),
            error_code: i.error_code,
            raw_video_id: i.video_id.clone(),
        })
    }
}

#[Object]
impl TranscodeJob {
    pub async fn id(&self) -> &ID {
        &self.id
    }
    async fn resolution(&self) -> Resolution {
        self.resolution
    }
    async fn status(&self) -> JobStatus {
        self.status
    }
    async fn total_segments(&self) -> Option<i32> {
        self.total_segments
    }
    async fn completed_segments(&self) -> i32 {
        self.completed_segments
    }
    async fn start_time_seconds(&self) -> Option<f64> {
        self.start_time_seconds
    }
    async fn end_time_seconds(&self) -> Option<f64> {
        self.end_time_seconds
    }
    async fn created_at(&self) -> &str {
        &self.created_at
    }
    async fn error(&self) -> Option<&String> {
        self.error.as_ref()
    }
    /// Typed code for mid-job failures (set when status == ERROR). Null otherwise.
    async fn error_code(&self) -> Option<PlaybackErrorCode> {
        self.error_code
    }
    async fn video(&self, ctx: &Context<'_>) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let row = get_video_by_id(db, &self.raw_video_id)?.ok_or_else(|| {
            async_graphql::Error::new(format!(
                "TranscodeJob {:?} references missing video {}",
                self.id, self.raw_video_id
            ))
        })?;
        Ok(Video::from_row(&row))
    }
}

/// Typed failure for a chunk-start request. Returned by union from startTranscode
/// and surfaced via TranscodeJob.errorCode for failures that happen mid-job
/// (probe / encode) after the mutation already resolved successfully.
#[derive(SimpleObject, Clone)]
pub struct PlaybackError {
    pub code: PlaybackErrorCode,
    pub message: String,
    /// Whether the orchestration layer should retry the same call.
    pub retryable: bool,
    /// Server's hint for how long to wait before retrying. Null when retryable is false.
    pub retry_after_ms: Option<i32>,
}

#[derive(Union, Clone)]
pub enum StartTranscodeResult {
    TranscodeJob(TranscodeJob),
    PlaybackError(PlaybackError),
}
