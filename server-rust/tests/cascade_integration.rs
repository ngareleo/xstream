//! Cascade-delete contract — verifies ON DELETE CASCADE wiring matches the logical-entity semantics. See docs/server/DB-Schema/.

use std::path::Path;

use rusqlite::params;
use xstream_server::db::{
    add_watchlist_item, assign_video_to_film, create_library, delete_library, upsert_film,
    upsert_video_metadata, Db, FilmRow, VideoMetadataRow,
};

fn fresh_db() -> Db {
    Db::open(Path::new(":memory:")).expect("open in-memory db")
}

struct ChainIds {
    library_id: String,
    video_id: String,
    job_id: String,
    history_id: String,
    film_id: String,
}

fn seed_full_chain(db: &Db, suffix: &str) -> ChainIds {
    let library_path = format!("/tmp/cascade-{suffix}");
    let library = create_library(
        db,
        &format!("Cascade Lib {suffix}"),
        &library_path,
        "movies",
        &[],
    )
    .expect("create_library");
    let library_id = library.id.clone();
    let video_id = format!("cascade-video-{suffix}");
    let job_id = format!("cascade-job-{suffix}");
    let history_id = format!("cascade-history-{suffix}");
    let now = "2026-01-01T00:00:00.000Z";

    db.with(|c| {
        // Video
        c.execute(
            "INSERT INTO videos
             (id, library_id, path, filename, title, duration_seconds,
              file_size_bytes, bitrate, scanned_at, content_fingerprint)
             VALUES (?1, ?2, ?3, 'file.mkv', 'Cascade Test', 100.0, 1000, 1000,
                     ?4, ?5)",
            params![
                video_id,
                library_id,
                format!("{library_path}/file.mkv"),
                now,
                format!("cascade-fp-{suffix}"),
            ],
        )?;
        // Two video_streams (video + audio)
        c.execute(
            "INSERT INTO video_streams
             (video_id, stream_type, codec, width, height, fps, channels, sample_rate)
             VALUES (?1, 'video', 'h264', 1920, 1080, 24.0, NULL, NULL),
                    (?1, 'audio', 'aac',  NULL, NULL, NULL, 2,    48000)",
            params![video_id],
        )?;
        // Transcode job + 3 segments
        c.execute(
            "INSERT INTO transcode_jobs
             (id, video_id, resolution, status, segment_dir, total_segments,
              completed_segments, start_time_seconds, end_time_seconds,
              created_at, updated_at, error)
             VALUES (?1, ?2, '1080p', 'complete', ?3, 3, 3, 0.0, 30.0, ?4, ?4, NULL)",
            params![
                job_id,
                video_id,
                format!("/tmp/cascade-segments/{job_id}"),
                now
            ],
        )?;
        for i in 0..3 {
            c.execute(
                "INSERT INTO segments
                 (job_id, segment_index, path, duration_seconds, size_bytes)
                 VALUES (?1, ?2, ?3, 10.0, 100)",
                params![
                    job_id,
                    i,
                    format!("/tmp/cascade-segments/{job_id}/segment_{i:04}.m4s"),
                ],
            )?;
        }
        // Playback history row — NOT linked by FK; survives video deletion.
        c.execute(
            "INSERT INTO playback_history
             (id, trace_id, video_id, video_title, resolution, started_at)
             VALUES (?1, ?2, ?3, 'Cascade Test', '1080p', ?4)",
            params![history_id, format!("trace-cascade-{suffix}"), video_id, now],
        )?;
        Ok(())
    })
    .expect("seed video + streams + job + segments + history");

    upsert_video_metadata(
        db,
        &VideoMetadataRow {
            video_id: video_id.clone(),
            imdb_id: format!("tt-cascade-{suffix}"),
            title: "Cascade Test".to_string(),
            year: Some(2020),
            genre: None,
            director: None,
            cast_list: None,
            rating: None,
            plot: None,
            poster_url: None,
            poster_local_path: None,
            matched_at: now.to_string(),
        },
    )
    .expect("upsert metadata");
    // Film + watchlist linkage. The watchlist references films now,
    // not videos — so seed a Film, link the video to it, then add the
    // film to the watchlist.
    let film_id = format!("cascade-film-{suffix}");
    upsert_film(
        db,
        &FilmRow {
            id: film_id.clone(),
            imdb_id: Some(format!("tt-cascade-film-{suffix}")),
            parsed_title_key: Some(format!("cascade-{suffix}|2020")),
            title: "Cascade Test".to_string(),
            year: Some(2020),
            created_at: now.to_string(),
        },
    )
    .expect("upsert film");
    assign_video_to_film(db, &video_id, &film_id, "main").expect("assign video to film");
    add_watchlist_item(db, &film_id).expect("add watchlist item");

    ChainIds {
        library_id,
        video_id,
        job_id,
        history_id,
        film_id,
    }
}

fn count_where(db: &Db, table: &str, id_col: &str, id_val: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {table} WHERE {id_col} = ?1");
    db.with(|c| {
        c.query_row(&sql, params![id_val], |r| r.get::<_, i64>(0))
            .map_err(Into::into)
    })
    .expect("count query")
}

#[test]
fn library_delete_cascades_through_video_to_streams_jobs_segments_metadata() {
    let db = fresh_db();
    let ids = seed_full_chain(&db, "library");

    // Confirm the chain is fully seeded before deletion.
    assert_eq!(count_where(&db, "videos", "id", &ids.video_id), 1);
    assert_eq!(
        count_where(&db, "video_streams", "video_id", &ids.video_id),
        2
    );
    assert_eq!(count_where(&db, "transcode_jobs", "id", &ids.job_id), 1);
    assert_eq!(count_where(&db, "segments", "job_id", &ids.job_id), 3);
    assert_eq!(
        count_where(&db, "video_metadata", "video_id", &ids.video_id),
        1
    );
    assert_eq!(count_where(&db, "films", "id", &ids.film_id), 1);
    assert_eq!(
        count_where(&db, "watchlist_items", "film_id", &ids.film_id),
        1
    );
    assert_eq!(
        count_where(&db, "playback_history", "id", &ids.history_id),
        1
    );

    let removed = delete_library(&db, &ids.library_id).expect("delete library");
    assert!(removed);

    assert_eq!(count_where(&db, "libraries", "id", &ids.library_id), 0);
    assert_eq!(count_where(&db, "videos", "id", &ids.video_id), 0);
    assert_eq!(
        count_where(&db, "video_streams", "video_id", &ids.video_id),
        0
    );
    assert_eq!(count_where(&db, "transcode_jobs", "id", &ids.job_id), 0);
    assert_eq!(count_where(&db, "segments", "job_id", &ids.job_id), 0);
    assert_eq!(
        count_where(&db, "video_metadata", "video_id", &ids.video_id),
        0
    );

    // Films and watchlist_items survive a library deletion — films are
    // not owned by libraries (a Film can have copies in multiple
    // libraries; deleting one library shouldn't drop the Film).
    assert_eq!(count_where(&db, "films", "id", &ids.film_id), 1);
    assert_eq!(
        count_where(&db, "watchlist_items", "film_id", &ids.film_id),
        1
    );

    // playback_history is intentionally NOT linked by FK — must survive.
    assert_eq!(
        count_where(&db, "playback_history", "id", &ids.history_id),
        1
    );
}

#[test]
fn video_delete_cascades_to_streams_jobs_segments_metadata_but_keeps_library_and_film() {
    let db = fresh_db();
    let ids = seed_full_chain(&db, "video");

    db.with(|c| {
        c.execute("DELETE FROM videos WHERE id = ?1", params![ids.video_id])?;
        Ok(())
    })
    .expect("delete video");

    assert_eq!(count_where(&db, "libraries", "id", &ids.library_id), 1);
    assert_eq!(count_where(&db, "videos", "id", &ids.video_id), 0);
    assert_eq!(
        count_where(&db, "video_streams", "video_id", &ids.video_id),
        0
    );
    assert_eq!(count_where(&db, "transcode_jobs", "id", &ids.job_id), 0);
    assert_eq!(count_where(&db, "segments", "job_id", &ids.job_id), 0);
    assert_eq!(
        count_where(&db, "video_metadata", "video_id", &ids.video_id),
        0
    );

    // Film and watchlist_items survive — deleting a single video file
    // doesn't unwatchlist the logical Film (other copies may still
    // exist).
    assert_eq!(count_where(&db, "films", "id", &ids.film_id), 1);
    assert_eq!(
        count_where(&db, "watchlist_items", "film_id", &ids.film_id),
        1
    );

    // playback_history rows survive video deletion.
    assert_eq!(
        count_where(&db, "playback_history", "id", &ids.history_id),
        1
    );
}

#[test]
fn transcode_job_delete_cascades_to_segments_only() {
    let db = fresh_db();
    let ids = seed_full_chain(&db, "job");

    db.with(|c| {
        c.execute(
            "DELETE FROM transcode_jobs WHERE id = ?1",
            params![ids.job_id],
        )?;
        Ok(())
    })
    .expect("delete job");

    assert_eq!(count_where(&db, "transcode_jobs", "id", &ids.job_id), 0);
    assert_eq!(count_where(&db, "segments", "job_id", &ids.job_id), 0);

    // Video + everything else hanging off it survives — only the job +
    // its segments go.
    assert_eq!(count_where(&db, "videos", "id", &ids.video_id), 1);
    assert_eq!(
        count_where(&db, "video_streams", "video_id", &ids.video_id),
        2
    );
    assert_eq!(
        count_where(&db, "video_metadata", "video_id", &ids.video_id),
        1
    );
    assert_eq!(
        count_where(&db, "watchlist_items", "film_id", &ids.film_id),
        1
    );
}
