---
name: write-component
description: Create or modify a React component in client/src/ following project conventions — Relay fragments, Griffel styles, Nova eventing, and Storybook stories. Use when adding a new UI component or updating an existing one.
allowed-tools: Bash(bun *)
---

# Write React Component

Use this skill when creating or modifying a React component in `client/src/`.

## Rules — enforce all of these

### File naming

- Component file: `PascalCase.tsx` (e.g. `VideoCard.tsx`)
- Component folder: `kebab-case/` (e.g. `video-card/`)
- Satellite files in the same folder mirror the component's PascalCase prefix: `VideoCard.styles.ts`, `VideoCard.strings.ts`, `VideoCard.events.ts`, `VideoCard.stories.tsx`
- Hooks, utils, services, configs, tests are camelCase: `useChunkedPlayback.ts`, `formatters.ts`, `chunkPipeline.ts`

Full convention: `CLAUDE.md` → "File Naming Convention".

### File structure
A component file contains **only**:
1. The component function
2. Its Relay fragment / mutation `graphql` tags
3. Its prop interface

Nothing else belongs in a component file.

### Data fetching with Relay
- **`useLazyLoadQuery` is banned in components** — queries only appear in `src/pages/`
- Every component that reads GraphQL data must declare a **fragment** and call `useFragment`
- The fragment key (`$key` type) is the **only** data prop the component receives from its parent
- Fragment naming: `<ComponentName>_<propName>` — e.g. `VideoCard_video` for a prop named `video`
- Spread the fragment in the parent's query or parent fragment; never pass raw data as props

```tsx
// ✅ correct
const MY_FRAGMENT = graphql`
  fragment MyComponent_item on Item { id title }
`;
interface Props { item: MyComponent_item$key; }
export function MyComponent({ item }: Props) {
  const data = useFragment(MY_FRAGMENT, item);
  ...
}

// ❌ wrong — raw data prop, no fragment
export function MyComponent({ id, title }: { id: string; title: string }) { ... }
```

### Types
- **Never redefine types locally** that already exist in the GraphQL schema
- Import display types from `client/src/types.ts`
- Import GQL enum types from `relay/__generated__/` artifacts (re-exported via `client/src/types.ts`)

### Utilities
- Pure formatting / computation functions (`formatDuration`, `resolutionLabel`, etc.) go in `client/src/utils/` — never inline in a component file

### Hooks
- Stateful side-effect logic (timers, event listeners, refs, async pipelines, MSE orchestration) goes in `client/src/hooks/` — never inline in a component file
- Existing hooks:
  - `useVideoPlayback(videoRef, videoId, onJobCreated?)` → `{ status, error, startPlayback }`
  - `useVideoSync(videoRef)` → `{ currentTime, isPlaying }`
  - `useJobSubscription(jobId, onProgress)` — subscribes to `transcodeJobUpdated`; pass `null` to unsubscribe

### Nova eventing — for components that raise events

If the component raises events (user interactions that propagate up to an ancestor), use `@nova/react` instead of callback props:

1. Create a colocated `<ComponentName>.events.ts` file with:
   - `ORIGINATOR` constant (`"ComponentName"`)
   - `EventTypes` const object with event name strings
   - Factory functions: `createXxxEvent(payload): NovaEvent<PayloadType>`
   - Type guards: `isXxxEvent(wrapper: EventWrapper): boolean`
2. In the component, call `useNovaEventing().bubble()` with the factory function — never build event objects inline
3. In the parent that handles events, use `NovaEventingInterceptor` with a `useCallback` interceptor that always `return wrapper` (forward) unless forwarding causes a specific unwanted side effect
4. Stories for components using `useNovaEventing()` must add `withNovaEventing` from `~/storybook/withNovaEventing.js` to `meta.decorators` — do not inline a manual provider in the story file.

Do not use callback props (`onPlay`, `onChange`) for events that should propagate — use `bubble()`.

## Common pitfalls — see `docs/client/Debugging-Playbooks/00-Common-Issues.md`

- Effect cleanup with nested timeouts
- Relay "preloaded query was disposed" warning
- React state persisting across router navigation
- Griffel shorthand/longhand mismatch inside pseudo-selectors
- `useCallback` used before declared

If you hit one of these symptoms while writing a component, read the matching playbook before workarounding.

## Checklist before finishing

- [ ] Component file contains only: component function, graphql tags, prop interface
- [ ] Data is fetched via `useFragment`, not `useLazyLoadQuery`
- [ ] Fragment named `<ComponentName>_<propName>`
- [ ] Fragment spread in parent query/fragment
- [ ] No locally-redefined types — imported from `src/types.ts` or relay artifacts
- [ ] Formatting helpers in `src/utils/`, not in the component
- [ ] Side-effect logic in `src/hooks/`, not in the component
- [ ] Run `bun relay` from `client/` if any graphql tag was added or changed
- [ ] If the component raises events: colocated `.events.ts` file exists with factory functions + type guards
- [ ] If the component raises events: uses `bubble()` not callback props
- [ ] If the component raises events: stories wrap with no-op `NovaEventingProvider`

## Stories — every component must have a story

Stories live alongside the component in `<ComponentName>.stories.tsx`.

Use `@imchhh/storybook-addon-relay` for all Relay fragment components:

```tsx
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { MyComponentStoryQuery } from "~/relay/__generated__/MyComponentStoryQuery.graphql.js";
import { MyComponent } from "./MyComponent.js";

const STORY_QUERY = graphql`
  query MyComponentStoryQuery($id: ID!) @relay_test_operation {
    node(id: $id) {
      ... on MyType {
        ...MyComponent_item
      }
    }
  }
`;

const meta: Meta<typeof MyComponent> = {
  title: "Components/MyComponent",
  component: MyComponent,
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { id: "MyType:mock" },
      getReferenceEntry: (result: MyComponentStoryQuery["response"]) => ["item", result.node],
      mockResolvers: { MyType: () => ({ /* fields the fragment reads */ }) },
    },
  },
};
export default meta;
```

**Story rules:**
- Mark story queries with `@relay_test_operation` — the addon requires it
- `getReferenceEntry` must return `[propName, fragmentKey]` matching the component's prop name
- Each visual variant is a named `StoryObj` export with its own `parameters.relay` override
- Stories test **visual states only** — no application logic inside story files
- Add `play` functions to verify interactive states (hover, error overlay, empty state):

```tsx
import { userEvent, within, expect } from "@storybook/test";

export const Hovered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole("article"));
    await expect(canvas.getByText("Play")).toBeVisible();
  },
};
```

Run `bun relay` from `client/` after adding or changing any `graphql` tag in a stories file.

## After writing

If any `graphql` tag was added or changed:
```bash
cd client && bun relay
```

Then type-check:
```bash
cd client && bun run tsc --noEmit
```

## Verify in the browser — required

After implementing any UI change, open the browser and visually confirm the feature works:

1. Check both servers are running (`lsof -i :3001 -i :5173 | grep LISTEN`); start them if not.
2. Navigate to the affected page/component at `http://localhost:5173`.
3. Take a screenshot and save it to `.claude/screenshots/` with a descriptive name.
4. Exercise the golden path (the main feature you just built).
5. Check the browser console — no unexpected errors.
6. If the change affects the video player or streaming pipeline, run `/e2e-test` to confirm playback still works end to end.

**Never report a UI task as complete without having opened the browser and taken at least one screenshot.**


## After writing — notify architect

If this task edited code or docs, spawn the `architect` subagent before marking it complete:

- **Files changed** — paths touched by `Write`/`Edit` during the task.
- **Description** — one sentence on what changed.
- **Why** — fix / feature / refactor, with issue or memory link if applicable.

Architect decides whether `docs/`, `docs/SUMMARY.md`, or the architect index needs updating, and does so directly. For trivial changes (typo, lint-only) say so explicitly — architect logs and skips. See `CLAUDE.md → Update protocol`.
