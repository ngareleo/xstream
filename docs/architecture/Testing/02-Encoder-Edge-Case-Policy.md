# Encoder edge-case test policy

**Every encoder edge case we discover gets a fixture and assertion in `server-rust/src/services/tests/chunker_encode_integration.rs`.** The pattern of "discover failure in trace → fix → ship → forget → regress" stops here. The test costs nothing on hosts without `XSTREAM_TEST_MEDIA_DIR` set (it self-skips), so the bar for adding cases is low.

## When fixing an encoder bug

The PR must include — in the same change — one of:

- **A new fixture** in `server-rust/src/test/fixtures/mod.rs` if the bug is source-property-specific (HDR vs SDR, codec, container, stream layout). Document the source's distinguishing properties in the spec's comment so the next person knows why this fixture exists.
- **A new chunk-start time** in an existing fixture's `chunkStartTimes` if the bug surfaces only at non-zero offsets (PTS drift, seek-into-middle, chunk-handover seams).
- **A new `it()` assertion** in the test file if the bug is a new invariant (e.g. "no green bars in HDR output", "no `transcode_fallback_to_software` event for 4K", "PTS within ±1 s of `chunkStartSeconds`").

The PR description must call out which assertion bites the original regression — and the test must be shown failing on the pre-fix code and passing on the fix. "I tested manually" doesn't add coverage; only the assertion in the test file does.

## Carve-outs (rare; justify in the PR)

- **Source-broken cases.** A failure that traces to the source file rather than the encoder (the OBAA fixture's broken duration metadata is the canonical example) goes in the test file's "Out of scope" comment, not as an assertion.
- **Hardware-specific cases the user can't reproduce.** If the bug only triggers on a GPU we don't have, document it in the relevant Hardware-Acceleration doc + add a watch-item comment in the test file so the next maintainer knows it's an open gap.

## Why "in the same PR"

Splitting the fix and the test into separate PRs invites the test PR to be deferred indefinitely. The encode test is the single source of truth for "what the encoder must keep doing right" — letting fixes land without their assertion is how the project drifted into needing this policy in the first place.
