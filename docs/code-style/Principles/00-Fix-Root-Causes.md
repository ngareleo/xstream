# Fix Root Causes, Not Symptoms

When a bug's cause is unknown, the plan starts with **find the cause** — usually by adding the diagnostic instrumentation that's currently missing. Do not propose a behavioural workaround in the same plan. If a workaround already exists in production, the plan to address the underlying bug must include removing it, not leaving it indefinitely.

> "If we don't know, we investigate" is the default.

## Reject these symptom-masks

Each wins time-to-recovery at the cost of permanent debt:

- **Bump the constant past the failing threshold.** The threshold was set for a reason; raising it hides the regression that pushed the system past it.
- **Force the fallback path that's worse.** Switching from the broken happy path to a slower or lossy fallback is not a fix — it's a quiet downgrade that operators will inherit.
- **Add a special-case branch that sidesteps the broken code.** Every special-case is a future maintainer wondering whether the branch still applies. If the underlying code is broken, fix it.

## What "find the cause" looks like in practice

1. **Instrument first.** If the existing telemetry can't tell you what happened, the plan's first step is adding the trace event, span attribute, or log line that would. Land the instrumentation before the fix.
2. **Reproduce.** A bug you can't reproduce locally or in a deterministic test case is a bug whose cause is still unknown. A workaround at this stage is a guess.
3. **Name the broken invariant.** Once you understand the cause, frame the fix as restoring the invariant — not patching the symptom. The PR description should name the invariant explicitly.

## Why this rule lives at the top of the policy stack

Symptom-masks compound. Every bumped constant, every forced fallback, every special-case branch is a layer of debt that the next bug has to navigate around. After three or four of them, the codebase encodes a problem its current authors can no longer describe.

The non-negotiables that pair with this rule:

- [`01-Safety-Timeouts.md`](01-Safety-Timeouts.md) — narrower domain of the same shape: don't bump timers as a fix.
- [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) §14 — Never swallow errors. The unhappy path is part of the design; if you can't see it, instrument it.
- [`../Anti-Patterns/00-What-Not-To-Do.md`](../Anti-Patterns/00-What-Not-To-Do.md) — full "don't" list.
