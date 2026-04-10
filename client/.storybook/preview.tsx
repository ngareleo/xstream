import type { Preview } from "storybook-react-rsbuild";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import React, { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";

import { withRelay } from "../src/storybook/withRelay.js";

const preview: Preview = {
  decorators: [
    withRelay,
    (Story, context) => {
      const initialEntries: string[] = context.parameters.router?.initialEntries ?? ["/"];
      return (
        <MemoryRouter initialEntries={initialEntries}>
          <ChakraProvider value={defaultSystem}>
            <Suspense fallback={<div style={{ padding: 16, color: "#aaa" }}>Loading…</div>}>
              <Story />
            </Suspense>
          </ChakraProvider>
        </MemoryRouter>
      );
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#1a1a1a" },
        { name: "light", value: "#ffffff" },
      ],
    },
  },
};

export default preview;
