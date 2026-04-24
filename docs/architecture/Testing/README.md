# Testing

Project-wide test infrastructure and policies. Per-workspace test runners + how to extend them are in [`../../code-style/Server-Conventions/00-Patterns.md`](../../code-style/Server-Conventions/00-Patterns.md) and [`../../code-style/Client-Conventions/00-Patterns.md`](../../code-style/Client-Conventions/00-Patterns.md).

| File | Hook |
|---|---|
| [`00-Side-Effects-Policy.md`](00-Side-Effects-Policy.md) | The "tests must leave the host as they found it" invariant + how the per-PID temp-dir + orphan reaper enforce it. |
| [`01-Encode-Pipeline-Tests.md`](01-Encode-Pipeline-Tests.md) | Real-media encode tests against `XSTREAM_TEST_MEDIA_DIR`, the `encodeHarness` + `traceCapture` modules, and the 4K-no-software-fallback assertion contract. |
| [`02-Encoder-Edge-Case-Policy.md`](02-Encoder-Edge-Case-Policy.md) | Every encoder edge case we discover gets a fixture + assertion in the same PR — the bar for adding cases and the carve-outs. |
