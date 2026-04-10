# Write React Component

Use this skill when creating or modifying a React component in `client/src/`.

## Rules — enforce all of these

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
  - `useVideoPlayback(videoRef, videoId, startTranscode)` → `{ status, error, startPlayback }`
  - `useVideoSync(videoRef)` → `{ currentTime, isPlaying }`

## Checklist before finishing

- [ ] Component file contains only: component function, graphql tags, prop interface
- [ ] Data is fetched via `useFragment`, not `useLazyLoadQuery`
- [ ] Fragment named `<ComponentName>_<propName>`
- [ ] Fragment spread in parent query/fragment
- [ ] No locally-redefined types — imported from `src/types.ts` or relay artifacts
- [ ] Formatting helpers in `src/utils/`, not in the component
- [ ] Side-effect logic in `src/hooks/`, not in the component
- [ ] Run `bun relay` from `client/` if any graphql tag was added or changed

## Stories — every component must have a story

Stories live alongside the component in `<ComponentName>.stories.tsx`.

Use `@imchhh/storybook-addon-relay` for all Relay fragment components:

```tsx
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyComponent } from "./MyComponent.js";
import type { MyComponentStoryQuery } from "../relay/__generated__/MyComponentStoryQuery.graphql.js";

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
