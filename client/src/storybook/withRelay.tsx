/** Mock Relay environment decorator for Storybook; see docs/client/Components/README.md for usage. */
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

  // Mock network resolves synchronously; result available on first render.
  const result = useLazyLoadQuery(query, variables) as Record<string, unknown>;

  const entries: [string, unknown][] = getReferenceEntries
    ? getReferenceEntries(result)
    : getReferenceEntry
      ? [getReferenceEntry(result)]
      : [];

  // Mutate context.args so Storybook's hookified wrapper picks up fragment refs.
  Object.assign(context.args, Object.fromEntries(entries));

  return <Story />;
}

interface RelayProviderProps {
  Story: React.ComponentType<Record<string, unknown>>;
  context: StoryContext;
  relay: RelayParameters;
}

/** Owns mock environment lifetime; useRef ensures it's created once per instance. */
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
