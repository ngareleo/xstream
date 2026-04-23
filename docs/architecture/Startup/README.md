# Startup

Server boot sequence and graceful shutdown. Affects what the client sees on page load (e.g. whether the scan is running) and how interrupted transcode jobs are recovered.

| File | Hook |
|---|---|
| [`00-Boot-And-Shutdown.md`](00-Boot-And-Shutdown.md) | Six-step boot, SIGTERM handler, `restoreInterruptedJobs` on-disk recovery. |
