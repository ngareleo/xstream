---
name: stop
description: Kill the server, client dev server, and any running ffmpeg jobs
disable-model-invocation: true
allowed-tools: Bash(bun *)
---

Stop all running processes:

```bash
bun run stop
```

Safe to run at any time — exits 0 even if nothing was running. Sends `SIGTERM` to the Rsbuild dev server, Bun server, and any ffmpeg transcode jobs (in that order).
