# Testing — Code Style Rules

Cross-cutting testing rules that apply across stacks and migrations. The runtime spec for what tests should look like in any individual workspace lives in `docs/architecture/Testing/`; this folder is the higher-level "how do we *think* about tests" policy.

| File | Hook |
|---|---|
| [`00-Tests-Travel-With-The-Port.md`](00-Tests-Travel-With-The-Port.md) | When porting a subsystem to a new stack, every test that documents an expectation about the port's surface must be reproduced in the new stack. Implementation can rewrite; assertions are the contract. |
