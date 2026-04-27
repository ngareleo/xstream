# Verification Workflow — Trace-First

When any agent (or a human developer) verifies a code change, the check must be rooted in Seq traces — not in what the browser UI looks like. Visual inspection catches symptoms; traces catch invariant breaks.

## The three-step sequence

### 1. Decide the verification strategy before touching the browser

Before opening a player or clicking play, answer:

- **What span or log line proves this change worked?** Be specific: which `@MessageTemplate`, which attribute, which ordering of events in the trace tree?
- **What would the trace look like if it failed?** A missing event, a wrong attribute value, a span that ended too early.

Example: verifying the post-seek startup gate uses buffered-ahead rather than absolute `bufferedEnd`:

> "After a seek to 600 s, the `playback.start` log should fire no earlier than when `bufferedAhead >= STARTUP_BUFFER_S[res]`. In Seq, query `@MessageTemplate = 'Buffer health' and @TraceId = '...'` and confirm the `buffered_s` reading at the moment `video.play()` is called is positive and meaningful — not ~2 s because a single segment bumped absolute `bufferedEnd` past 600 + 5 s."

Without this up-front decision, browser verification becomes "does it look OK?" — which is insufficient.

### 2. Add the necessary observability before verifying

If existing instrumentation does not produce a clear signal for step 1, **add the log or span event before running the verify pass**. A change without an observability hook is incomplete: future debugging will hit the same wall you just worked around.

Rules for new instrumentation (consistent with [`01-Logging-Policy.md`](01-Logging-Policy.md)):

- Use `log.info(...)` (not `span.addEvent(...)`) for any mid-session diagnostic you need to see in Seq during a live playback session. See the **span.addEvent gotcha** below.
- Message body must be self-describing: `log.info("Buffer flushed — seek to 600s", { seekTime: 600 })` — not `log.info("Buffer flushed", { seekTime: 600 })`.
- The new log must carry attributes the Seq filter can narrow on (`job_id`, `video_id`, `@TraceId`).

### 3. Verify by querying Seq — not by watching the spinner

Once the change is running and a playback session has been exercised, query Seq to confirm the expected signal:

```sh
# Typical agent path — use the seq skill
# Filter to the trace that just played; look for the specific log line
@TraceId = '<session-trace-id>' and @MessageTemplate = 'Buffer health'
```

Read the actual event attributes. Compare against what step 1 said you should see. Only then mark the change verified.

The `seq` skill bundles auth and filter mechanics — prefer it over driving the Seq browser UI unless the user explicitly asks to see the live interface. See [`02-Searching-Seq.md`](02-Searching-Seq.md) for filter syntax.

## Why visual checks are insufficient

From session 2026-04-26: a post-seek stuck-buffer regression was invisible to the eye. The `SourceBuffer` was receiving 9 GB of appended data but never accumulating a playable buffered range. The video element stopped firing all events. Visual inspection showed a perpetually spinning buffer indicator — indistinguishable from ordinary network latency. The trace told the truth: `buffer_bytes` climbing while `buffered_ranges_json` remained `[]`.

Visual checks catch symptoms (spinner showing, playback not advancing). Traces catch invariant breaks (bytes arriving but not producing a playable range, the wrong span ending first, a log line missing from the sequence).

## The span.addEvent gotcha on long-lived spans

`span.addEvent("name", attributes)` on the `playback.session` span **does not appear in Seq until the span ends**. The OTel SDK batches span events with the span and exports them together when `span.end()` is called. For a long-lived span that covers an entire player-page visit, that means the events are invisible in Seq for the whole session.

**Consequence:** if you add a `sessionSpan.addEvent("playback.status_changed", ...)` call and expect to see it in Seq mid-session to verify a seek-spinner fix, it will not appear until the user navigates away from the player page.

**The fix is always the same:** use `log.info(...)` for signals you need to see during a live session. A companion `span.addEvent` can be kept for the audit trail that lives on the closed span — both are useful for different purposes. See the `Skipping \`playing\` event — seek in flight` entry in [`client/00-Spans.md`](client/00-Spans.md) for a worked example.

This gotcha applies to any long-lived span (`playback.session`, `chunk.stream` to a lesser extent). Short-lived spans like `transcode.request` close promptly and their events appear without delay.
