import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { withNovaEventing } from "~/storybook/withNovaEventing.js";
import { withRelay } from "~/storybook/withRelay.js";

import { NewProfilePane } from "./NewProfilePane.js";

/**
 * NewProfilePane is a self-contained form that fires a createLibrary mutation
 * on submit. withRelay provides a mock Relay environment for the mutation;
 * withNovaEventing silently discards the Closed/LibraryCreated events bubbled
 * on cancel/create.
 *
 * The `@relay_test_operation` query is a no-op sentinel — the pane uses only
 * useMutation (no fragment), but the withRelay decorator needs a query to
 * bootstrap the mock environment.
 */
const STORY_QUERY = graphql`
  query NewProfilePaneStoryQuery @relay_test_operation {
    libraries {
      id
    }
  }
`;

const meta: Meta = {
  title: "Components/NewProfilePane",
  component: NewProfilePane,
  decorators: [withNovaEventing, withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: {},
      mockResolvers: {
        Mutation: () => ({
          createLibrary: { id: "lib-new", name: "New Library" },
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 360, background: "#0f0f0f" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("New Library")).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("e.g. Movies 4K")).toBeInTheDocument();
    await expect(canvas.getByText("Create Library")).toBeInTheDocument();
  },
};
