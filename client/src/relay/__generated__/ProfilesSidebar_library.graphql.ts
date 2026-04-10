/**
 * @generated SignedSource<<83b8e3afb5d4389cbb700199a1b4882a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type MediaType = "MOVIES" | "TV_SHOWS" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type ProfilesSidebar_library$data = {
  readonly id: string;
  readonly mediaType: MediaType;
  readonly name: string;
  readonly videos: {
    readonly totalCount: number;
  };
  readonly " $fragmentType": "ProfilesSidebar_library";
};
export type ProfilesSidebar_library$key = {
  readonly " $data"?: ProfilesSidebar_library$data;
  readonly " $fragmentSpreads": FragmentRefs<"ProfilesSidebar_library">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "ProfilesSidebar_library",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "name",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaType",
      "storageKey": null
    },
    {
      "alias": null,
      "args": [
        {
          "kind": "Literal",
          "name": "first",
          "value": 50
        }
      ],
      "concreteType": "VideoConnection",
      "kind": "LinkedField",
      "name": "videos",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "totalCount",
          "storageKey": null
        }
      ],
      "storageKey": "videos(first:50)"
    }
  ],
  "type": "Library",
  "abstractKey": null
};

(node as any).hash = "6d5af50317e64d8d969a5698860320d0";

export default node;
