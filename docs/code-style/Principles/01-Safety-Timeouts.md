# Don't Weaken Safety Timeouts as a Bug Fix

Safety timeouts encode intent. The number wasn't chosen at random; it expresses *"any case taking longer than this is, by definition, an abandonment we want to clean up."*

When a legit case starts looking like an abandonment to the timer, the timer is correct and the structural shape is wrong. **Fix the structure — don't bump the timer.**

## What this rule rules out

- **Raising the abandonment threshold so the slow case finishes inside it.** The case was slow for a reason. The reason will get worse, not better, and the next time it crosses the new threshold the next agent will raise it again.
- **Disabling the safety check on a case-by-case basis.** A `// TODO: unconditional skip for path X` is the same shape as bumping the timer — it just buries the regression.
- **"Make the timer configurable so we can tune it later."** Configurability is not a fix. The default ships with the same wrong number, and the people who hit the bug aren't running with custom config.

## What "fix the structure" looks like

The legit case looks like an abandonment because *something downstream is taking unexpectedly long*. The right response is to make the structure of the legit case stop tripping the detector:

1. **Identify why the case is slow.** Most "slow legit cases" are doing more work than the path was designed for — extra round-trips, blocking I/O on the hot path, missing fast-path detection.
2. **Restore the assumption the timer was protecting.** Often this means moving work off the hot path, batching, or short-circuiting an obvious case.
3. **If the case genuinely needs the time, separate it from the hot path entirely.** The timer guards the hot path; cases that can't fit there belong to a different code path with its own contract.

## Pairs with

- [`00-Fix-Root-Causes.md`](00-Fix-Root-Causes.md) — same shape, broader scope. This rule is the timer-shaped instance of "no symptom-masks".
- [`../Anti-Patterns/00-What-Not-To-Do.md`](../Anti-Patterns/00-What-Not-To-Do.md) — anti-pattern catalogue.
