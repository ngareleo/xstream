# Anti-Patterns

| File | Hook |
|---|---|
| [`00-What-Not-To-Do.md`](00-What-Not-To-Do.md) | The full "don't" list: no ORM, no ad-hoc SQL, no non-null assertions, no callback props for user actions, no nested `NovaEventingProvider`, no literal `className` strings, no duplicate resolvers, no magic numbers, no restating-code comments. |
| [`01-Commenting.md`](01-Commenting.md) | Default to no comment. TSDoc / rustdoc on public surface OK; inline `//` only for genuine "why" context. Banners, restating-code comments, commented-out code, and multi-paragraph prose belong elsewhere — relocate prose into `docs/`. |
