---
name: seq-stop
description: Stop the Seq log management container
disable-model-invocation: true
allowed-tools: Bash(docker *) Bash(bun *)
---

Stop the Seq container:

```bash
bun run seq:stop
```

Safe to run when Seq is not running. The container and data volume are preserved — `bun run seq:start` will restart it instantly.
