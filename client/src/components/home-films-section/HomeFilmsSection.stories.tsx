import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { HomeFilmsSection_films$key } from "~/relay/__generated__/HomeFilmsSection_films.graphql";
import type { HomeFilmsSectionStoryQuery } from "~/relay/__generated__/HomeFilmsSectionStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { HomeFilmsSection } from "./HomeFilmsSection.js";

const STORY_QUERY = graphql`
  query HomeFilmsSectionStoryQuery @relay_test_operation {
    movies: films(first: 200) {
      ...HomeFilmsSection_films
    }
  }
`;

interface WrapperProps {
  films: HomeFilmsSection_films$key;
}

const HomeFilmsSectionWrapper = ({ films }: WrapperProps): JSX.Element => (
  <div style={{ width: "100vw", height: "100vh", overflow: "auto" }}>
    <HomeFilmsSection films={films} />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/HomeFilmsSection",
  component: HomeFilmsSectionWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: {},
      getReferenceEntry: (result: HomeFilmsSectionStoryQuery["response"]) => [
        "films",
        result.movies,
      ],
      mockResolvers: {
        FilmConnection: () => ({
          edges: [
            { node: { id: "Film:1" } },
            { node: { id: "Film:2" } },
            { node: { id: "Film:3" } },
          ],
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Default: Story = {};

export const Empty: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: {},
      getReferenceEntry: (result: HomeFilmsSectionStoryQuery["response"]) => [
        "films",
        result.movies,
      ],
      mockResolvers: {
        FilmConnection: () => ({ edges: [] }),
      },
    },
  },
};
