# Server

Topics scoped to the Rust server. Cross-cutting client/server concepts live under [`../architecture/`](../architecture/README.md).

| Folder | Hook |
|---|---|
| [`Config/`](Config/README.md) | `AppConfig`, library configuration, resolution ladder. |
| [`GraphQL-Schema/`](GraphQL-Schema/README.md) | SDL surface: types, fields, enums, subscriptions. |
| [`DB-Schema/`](DB-Schema/README.md) | SQLite tables, indices, migrations. |
| [`Hardware-Acceleration/`](Hardware-Acceleration/README.md) | VAAPI filter chains, HDR pad artifact, ffmpeg invocation patterns. |
| [`FFmpeg-Caveats/`](FFmpeg-Caveats/README.md) | ffmpeg / fMP4 / MSE incompatibilities (negative-DTS, B-frame reorder, edit-list rejection). |
