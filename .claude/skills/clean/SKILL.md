---
name: clean
description: Stop all processes and wipe encoded segment output and test databases
disable-model-invocation: true
allowed-tools: Bash(bun *)
---

Wipe segment cache and test databases (preserves the main DB):

```bash
bun run clean
```

Also wipe `tmp/xstream.db` to force a full library rescan on next start:

```bash
bun run clean:db
```

Use `clean:db` when the DB schema changed (e.g. a missing `content_fingerprint` column), or when you want to rescan all media from scratch. The `tmp/segments/` directory can grow to many GB — `clean` is safe to run at any time.
