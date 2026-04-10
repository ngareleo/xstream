/**
 * @generated SignedSource<<5be6f407b4ddfaf3eee352c78a2c7cdf>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type LibraryGrid_library$data = {
  readonly videos: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly id: string;
        readonly " $fragmentSpreads": FragmentRefs<"VideoCard_video">;
      };
    }>;
  };
  readonly " $fragmentType": "LibraryGrid_library";
};
export type LibraryGrid_library$key = {
  readonly " $data"?: LibraryGrid_library$data;
  readonly " $fragmentSpreads": FragmentRefs<"LibraryGrid_library">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "LibraryGrid_library",
  selections: [
    {
      alias: null,
      args: [
        {
          kind: "Literal",
          name: "first",
          value: 50,
        },
      ],
      concreteType: "VideoConnection",
      kind: "LinkedField",
      name: "videos",
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          concreteType: "VideoEdge",
          kind: "LinkedField",
          name: "edges",
          plural: true,
          selections: [
            {
              alias: null,
              args: null,
              concreteType: "Video",
              kind: "LinkedField",
              name: "node",
              plural: false,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "id",
                  storageKey: null,
                },
                {
                  args: null,
                  kind: "FragmentSpread",
                  name: "VideoCard_video",
                },
              ],
              storageKey: null,
            },
          ],
          storageKey: null,
        },
      ],
      storageKey: "videos(first:50)",
    },
  ],
  type: "Library",
  abstractKey: null,
};

(node as any).hash = "88a0b561fffda2a8836314abbd9792df";

export default node;
