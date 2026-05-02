# Storybook Testing

Storybook stories are the primary mechanism for catching visual regressions and component bugs outside of e2e tests. The vitest `storybookTest` plugin enforces three invariants to ensure stories are live, testable specifications.

## Rule 1: Every story must assert on real content

A story without a `play` function is a visual artifact with no assertions — it can render an error boundary, a Suspense fallback, or even a blank canvas and the test runner won't catch it.

**Pattern:**

```typescript
export const StoryName: StoryObj<typeof MyComponent> = {
  render: (args) => <MyComponent {...args} />,
  play: async ({ canvas }) => {
    // Assert on real, story-specific content.
    // Example: a unique title, button label, or semantic role.
    await expect(canvas.getByText("Expected Title")).toBeDefined();
  },
};
```

**Scope:**

- The assertion must target story-specific content (not generic fallback text like "Loading").
- Use canvas queries (`canvas.getByText`, `canvas.findByText` with async/await for Suspense) or role-based queries (`canvas.getByRole`).
- When the story exercises a Suspense boundary or lazy chunk, use `await canvas.findByText(...)` **inside the play function** to ensure the test waits for resolution within the `act()` window. If the async chunk resolves after `play` exits, you'll see an "act() not configured" warning — that's a signal to add `await` to the assertion.

## Rule 2: console.error during render fails the test

The vitest setup (`client/.storybook/vitest.setup.ts`) installs a `console.error` trap that:

1. Captures any `console.error(...)` calls during story render.
2. Throws in the `afterEach` hook if any were recorded.

This catches:

- Unhandled promise rejections logged by React 18 as `"The above error occurred in..."`.
- Fragment contract violations (`"Cannot read properties of undefined"` when a resolver doesn't return expected data).
- React Hook warnings (`"useState called conditionally"` from a linting rule violation in the story itself).

**Opt-out:**

If a story legitimately expects a `console.error` (testing an error state, for example), use:

```typescript
export const ErrorCase: StoryObj<typeof MyComponent> = {
  parameters: { expectConsoleErrors: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Error message")).toBeDefined();
  },
};
```

## Rule 3: Relay resolvers must be path-aware when mocking nested edges

When a story mocks Relay data with nested edge arrays, the resolver for each edge must produce a **distinct id**. If all edges get the same id, the Relay store deduplicates them to a single node, causing subsequent `v.id !== data.id` filters to eliminate all but the first.

**Antipattern:**

```typescript
// ❌ Every edge gets id "video-1"; the store deduplicates.
const mockResolver = () => ({
  id: "video-1",
  title: "Suggestion 1",
  // ...
});
```

**Pattern:**

```typescript
// ✅ Counter increments per edge; each gets a distinct id.
let edgeCounter = 0;
const mockResolver = (context) => {
  const isEdge = context.path.includes("edges");
  if (isEdge) {
    edgeCounter++;
  }
  return {
    id: isEdge ? `video-${edgeCounter}` : "root-video",
    title: isEdge ? `Suggestion ${edgeCounter}` : "Main Video",
    // ...
  };
};
```

**How to detect this bug:**

- Story renders, but nested items (suggestions, search results, list items) all show the same title or data.
- The Relay store has only one node where there should be many.
- Filtering logic like `videos.filter(v => v.id !== rootId)` removes everything instead of just the root.

**Where this pattern is used:**

- `PlayerEndScreen.WithSuggestions` — each suggestion edge has a distinct id/title.
- `PlayerSidebar.WithMetadata` — nested metadata resolvers use path awareness to differ root from nested fields.

## Trace context and act() warnings

Stories exercising lazy-loaded chunks or Suspense boundaries must complete the async work **inside the play function** for it to be wrapped in React 18's `act()`. Otherwise you'll see:

```
Warning: An update to MyComponent inside a test was not wrapped in act(...).
```

This is not a test bug; it's a timing issue. The fix is to `await` the async boundary in the play function:

```typescript
play: async ({ canvas }) => {
  // ✓ Wait for the chunk to resolve inside act()
  await canvas.findByText("Lazy-loaded content");
},
```

If you see this warning and the story has a play function with `await`, double-check that all async operations in the component (lazy imports, Suspense fallbacks, `useEffect` fetches) complete before the play function returns.

## Summary

| Requirement | Enforced by | Failure signal |
|---|---|---|
| Every story has a real-content assertion | vitest `storybookTest` plugin (all test files must call `play` with assertions) | Test exit code non-zero |
| console.error during render fails | `afterEach` hook in `vitest.setup.ts` capturing `console.error` | `Error: expected result but got <error> from console` |
| Relay resolvers avoid dedup collisions | Manual review + code pattern guidance | Stories render duplicate/missing data; Relay store audit shows 1 node instead of N |
| Async chunks resolve in act() | React 18 act() warning detection | `Warning: An update to MyComponent... was not wrapped in act()` |
