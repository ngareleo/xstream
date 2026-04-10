/**
 * Storybook decorator that wires up a mock Relay environment for stories that
 * declare a `parameters.relay` block.
 *
 * This is a plain-ESM re-implementation of @imchhh/storybook-addon-relay's
 * withRelay decorator, written to avoid the CJS→ESM bundling issues the
 * upstream package causes in Storybook 10 + Vite.
 *
 * Strategy: queue a mock resolver on the mock environment, then render a
 * wrapper component that calls useLazyLoadQuery. The mock network resolves
 * synchronously, so the component receives live fragment refs from the Relay
 * store and passes them to the story as props. This mirrors the original
 * addon's approach and avoids the timing issues that arise with commitPayload
 * + env.lookup outside of React.
 *
 * The mock environment is created inside a React component (RelayProvider)
 * using useRef, so it is created exactly once per component instance. This
 * prevents React 18 Concurrent Mode from seeing a new environment on each
 * render pass (which would reset the store and cause useFragment to return
 * null).
 *
 * Usage (story file):
 *   parameters: {
 *     relay: {
 *       query: STORY_QUERY,           // graphql tagged template with @relay_test_operation
 *       variables: { id: "mock" },
 *       getReferenceEntry: (result) => ["video", result.video],
 *       mockResolvers: { Video: () => ({ id: "mock", title: "Test" }) },
 *     },
 *   }
 */
import React, { useRef } from "react";
import type { GraphQLTaggedNode } from "react-relay";
import { RelayEnvironmentProvider, useLazyLoadQuery } from "react-relay";
import { createMockEnvironment, MockPayloadGenerator } from "relay-test-utils";
import type { Decorator, StoryContext } from "storybook-react-rsbuild";

interface RelayParameters {
  query: GraphQLTaggedNode;
  variables?: Record<string, unknown>;
  mockResolvers?: Record<string, unknown>;
  /** Map a single root field from the query result to a component prop. */
  getReferenceEntry?: (result: Record<string, unknown>) => [string, unknown];
  /** Map multiple root fields (for components that consume more than one fragment). */
  getReferenceEntries?: (result: Record<string, unknown>) => [string, unknown][];
}

interface RelayStoryProps {
  Story: React.ComponentType<Record<string, unknown>>;
  context: StoryContext;
  relay: RelayParameters;
}

function RelayStory({ Story, context, relay }: RelayStoryProps): React.ReactElement {
  const { query, variables = {}, getReferenceEntry, getReferenceEntries } = relay;

  // useLazyLoadQuery fires against the mock network, which was pre-loaded with
  // a resolver via env.mock.queueOperationResolver. The mock resolves
  // synchronously, so the result is available on first render (no Suspense).
  const result = useLazyLoadQuery(query, variables) as Record<string, unknown>;

  const entries: [string, unknown][] = getReferenceEntries
    ? getReferenceEntries(result)
    : getReferenceEntry
      ? [getReferenceEntry(result)]
      : [];

  // Mutate context.args directly so Storybook's internal `hookified` wrapper
  // (which calls the story function with context.args) picks up the relay
  // fragment refs. Spreading them as JSX props on <Story> is not enough —
  // hookified reads from context.args, not from the element's own props.
  Object.assign(context.args, Object.fromEntries(entries));

  return <Story />;
}

interface RelayProviderProps {
  Story: React.ComponentType<Record<string, unknown>>;
  context: StoryContext;
  relay: RelayParameters;
}

/**
 * Stable wrapper component that owns the mock environment lifetime.
 * useRef ensures the environment is created exactly once per component
 * instance, preventing React 18 Concurrent Mode from creating a fresh
 * empty store on every render pass.
 */
function RelayProvider({ Story, context, relay }: RelayProviderProps): React.ReactElement {
  const { query, variables = {}, mockResolvers = {} } = relay;

  const envRef = useRef<ReturnType<typeof createMockEnvironment> | null>(null);
  if (envRef.current === null) {
    const env = createMockEnvironment();
    env.mock.queueOperationResolver((operation) =>
      MockPayloadGenerator.generate(
        operation,
        mockResolvers as Parameters<typeof MockPayloadGenerator.generate>[1]
      )
    );
    env.mock.queuePendingOperation(query, variables);
    envRef.current = env;
  }

  return (
    <RelayEnvironmentProvider environment={envRef.current}>
      <RelayStory Story={Story} context={context} relay={relay} />
    </RelayEnvironmentProvider>
  );
}

export const withRelay: Decorator = (Story, context) => {
  const relay = context.parameters?.relay as RelayParameters | undefined;
  if (!relay) return <Story />;

  return (
    <RelayProvider
      Story={Story as React.ComponentType<Record<string, unknown>>}
      context={context}
      relay={relay}
    />
  );
};
