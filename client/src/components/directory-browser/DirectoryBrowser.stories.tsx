import { useRef, useState } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { createMockEnvironment, MockPayloadGenerator } from "relay-test-utils";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { DirectoryBrowser } from "./DirectoryBrowser.js";

interface WrapperProps {
  initialPath: string;
}

/**
 * DirectoryBrowser issues an imperative `fetchQuery` for `listDirectory` on
 * mount, so the story needs a Relay environment that responds with mock
 * directory entries. We can't lean on the shared `withRelay` decorator here
 * because `withRelay` is fragment-driven (mounts the component via
 * useLazyLoadQuery + getReferenceEntry); DirectoryBrowser doesn't expose its
 * data via a fragment prop. Instead we provide a mock environment directly
 * and intercept the operation with a payload generator.
 */
const DirectoryBrowserWrapper = ({ initialPath }: WrapperProps): JSX.Element => {
  const envRef = useRef<ReturnType<typeof createMockEnvironment> | null>(null);
  if (envRef.current === null) {
    const env = createMockEnvironment();
    env.mock.queueOperationResolver((operation) =>
      MockPayloadGenerator.generate(operation, {
        // Return a small synthetic listing; the story is presentational.
        DirectoryEntry: () => ({
          name: "example",
          path: "/example",
        }),
      })
    );
    envRef.current = env;
  }

  const [picked, setPicked] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  return (
    <RelayEnvironmentProvider environment={envRef.current}>
      <div style={{ width: 360, padding: 24, background: "#050706" }}>
        <DirectoryBrowser
          initialPath={initialPath}
          onSelect={(p) => setPicked(p)}
          onCancel={() => setCancelled(true)}
        />
        <p
          style={{
            marginTop: 16,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#9aa6a0",
          }}
        >
          {picked ? `picked: ${picked}` : cancelled ? "cancelled" : "—"}
        </p>
      </div>
    </RelayEnvironmentProvider>
  );
};

const meta: Meta<WrapperProps> = {
  title: "Components/DirectoryBrowser",
  component: DirectoryBrowserWrapper,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Root: Story = {
  args: { initialPath: "/" },
};
