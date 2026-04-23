# Server

Topics scoped to the Bun server. Cross-cutting client/server concepts live under [`../architecture/`](../architecture/README.md).

| Folder | Hook |
|---|---|
| [`Config/`](Config/README.md) | `AppConfig`, `mediaFiles.json` loader, resolution ladder. |
| [`GraphQL-Schema/`](GraphQL-Schema/README.md) | SDL surface: types, fields, enums, subscriptions. |
| [`DB-Schema/`](DB-Schema/README.md) | SQLite tables, indices, migrations. |
| [`Hardware-Acceleration/`](Hardware-Acceleration/README.md) | VAAPI filter chains, HDR pad artifact, fluent-ffmpeg quirks. |
