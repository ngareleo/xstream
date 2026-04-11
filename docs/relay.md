# Relay Best Practices

This document captures the Relay patterns enforced in this project. All client components must follow these conventions. See the [official Relay tutorial](https://relay.dev/docs/tutorial/graphql/) for deeper background.

---

## Core Mental Model

Relay lets each component declare exactly the data it needs via a **fragment**, then automatically stitches all fragments into a single query per page. This means:

- No prop-drilling of data between components
- No over-fetching (each component requests only what it renders)
- No under-fetching (Relay guarantees all declared fields are present)
- Consistent UI when data updates (Relay's normalized store propagates changes everywhere)

---

## Rules

### 1. Queries only at the page level

`useLazyLoadQuery` (or `usePreloadedQuery`) must only appear in page components inside `src/pages/`. These are the roots that issue network requests.

```tsx
// ✅ correct — in src/pages/LibraryPage.tsx
const data = useLazyLoadQuery<LibraryPageQuery>(LIBRARIES_QUERY, {});
```

```tsx
// ❌ wrong — in src/components/VideoCard.tsx
const data = useLazyLoadQuery<VideoCardQuery>(SOME_QUERY, { id }); // don't do this
```

### 2. Components declare data with fragments

Every component that reads GraphQL data must declare a fragment on the exact type it needs and call `useFragment` to access it. The fragment key (`$key` type) is the only prop the component receives from its parent.

```tsx
// src/components/VideoCard.tsx
const VIDEO_FRAGMENT = graphql`
  fragment VideoCard_video on Video {
    id
    title
    durationSeconds
    videoStream { height }
  }
`;

interface Props {
  video: VideoCard_video$key; // ← fragment key, NOT the raw data
}

export function VideoCard({ video }: Props) {
  const data = useFragment(VIDEO_FRAGMENT, video);
  // use data.title, data.durationSeconds, etc.
}
```

### 3. Fragment naming convention

Fragments must be named `<ComponentName>_<propName>`:

```graphql
fragment VideoCard_video on Video { ... }   # ✅
fragment VideoCardFragment on Video { ... } # ❌
```

The relay-compiler enforces this if you configure `fragmentNameSuffix`.

### 4. Spread fragments in queries (or parent fragments)

The page-level query spreads child fragments instead of selecting fields directly:

```tsx
// src/pages/LibraryPage.tsx
const LIBRARIES_QUERY = graphql`
  query LibraryPageQuery {
    libraries {
      id
      name
      ...LibraryGrid_library   # ← spread the fragment, don't duplicate fields
    }
  }
`;
```

### 5. Never use raw data from query results in child components

The parent passes the fragment reference, not the extracted data:

```tsx
// ✅ correct
{data.libraries.map(lib => <LibraryGrid key={lib.id} library={lib} />)}

// ❌ wrong — bypasses data masking and couples components
{data.libraries.map(lib => <LibraryGrid key={lib.id} name={lib.name} videos={lib.videos} />)}
```

### 6. The GraphQL schema is the single source of truth for types

Never redefine types (like `Resolution`) locally in components. Import them from the relay-generated artifacts or from `src/types.ts`, which itself derives from the generated types.

```tsx
// ✅ correct — centralised in src/types.ts, derived from relay output
import type { Resolution } from "../types.js";

// ❌ wrong — duplicated locally
type Resolution = "240p" | "360p" | "480p" | "720p" | "1080p" | "4k";
```

### 7. Keep utility functions out of component files

Pure formatting/computation functions (`formatDuration`, `resolutionLabel`, etc.) belong in `src/utils/`. Component files should contain only the component, its fragment, and its prop types.

---

## Re-running the compiler

After any change to a `.graphql` tag in the client source, or any change to `server/schema.graphql`, regenerate Relay artifacts:

```bash
cd client && bun relay
```

The artifacts in `src/relay/__generated__/` are **gitignored** — they are generated at dev startup (`bun dev`) and at the start of every CI run. Never edit them manually and never commit them. The `bun relay` script creates the directory if it doesn't exist before invoking relay-compiler.

---

## Adding a new component with its own data

1. Define the fragment in the component file with `graphql`
2. Add the fragment type import from `__generated__/`
3. Accept the `$key` type as a prop
4. Call `useFragment` inside the component
5. Spread the fragment in the parent's query or parent fragment
6. Run `bun relay`
