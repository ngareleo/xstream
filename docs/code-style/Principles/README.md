# Engineering Principles

The four meta-rules that govern how xstream code is written, regardless of language. Every code-touching agent should read these before starting non-trivial work — they take precedence over per-language conventions.

| File | Hook |
|---|---|
| [`00-Fix-Root-Causes.md`](00-Fix-Root-Causes.md) | When a bug's cause is unknown, the plan starts with *find the cause*, not a behavioural workaround. Reject symptom-masks: bumping the failing constant, forcing the worse fallback, special-casing around the broken code. |
| [`01-Safety-Timeouts.md`](01-Safety-Timeouts.md) | Safety timeouts encode intent. If a legit case looks like an abandonment, the timer is correct and the structural shape is wrong — fix the structure, don't bump the timer. |
| [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) §14 | Never swallow errors. No `expect`/`unwrap`/silent-discard in production Rust; every fallible op returns `Result`; mutex poisoning is a typed error; resolver errors land in Seq with the request TraceId. |
| [`../Testing/00-Tests-Travel-With-The-Port.md`](../Testing/00-Tests-Travel-With-The-Port.md) | When porting a subsystem, the implementation can be a rewrite; the assertions are the contract. Negative paths carry over too. |

These rules pair with [`../Anti-Patterns/00-What-Not-To-Do.md`](../Anti-Patterns/00-What-Not-To-Do.md). When a plan or PR seems to violate any of them, surface that fact before shipping.
