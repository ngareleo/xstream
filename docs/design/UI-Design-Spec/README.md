# UI Design Spec

The xstream client has gone through a visual rebrand. Both eras are kept
side-by-side: the prerelease "Moran" identity is preserved as a frozen
reference, and the new "Xstream" identity is the active design target.

| File | Era | Hook |
|---|---|---|
| [`00-Prerelease-Tokens-And-Layout.md`](00-Prerelease-Tokens-And-Layout.md) | **Frozen** — Moran (red + Bebas Neue) | Behavior + token reference for the original prototype, still authoritative for any UX rules that haven't been re-stated in the Release spec. Lab: `design/Prerelease/` (port 5000). |
| [`01-Release-Tokens-And-Layout.md`](01-Release-Tokens-And-Layout.md) | **Active** — Xstream (green + Anton/Inter/JetBrains Mono) | Token map, type scale, spacing, behavioral parity with Prerelease, page port status, logo selection state. Lab: `design/Release/` (port 5001). |

Boot both labs at once with `bun run design` from the repo root.

## When to read which

- **Implementing a new page in production** → start with the **Release** spec
  for tokens + layout, then read the matching section of the **Prerelease**
  spec for the full behavior contract (it has more prose on subtle flows
  like pane history, scan state, deep-linking).
- **Looking up a token value** → Release spec only; Prerelease tokens are
  legacy.
- **Looking up a UX invariant (e.g. "what does back do on the Player")**
  → either spec — the contract ports verbatim.
