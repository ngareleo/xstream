/**
 * @generated SignedSource<<2543cf5b32b801d0c55f4a04d9edf24d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type MediaType = "MOVIES" | "TV_SHOWS" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type LibraryRail_library$data = {
  readonly id: string;
  readonly mediaType: MediaType;
  readonly name: string;
  readonly " $fragmentType": "LibraryRail_library";
};
export type LibraryRail_library$key = {
  readonly " $data"?: LibraryRail_library$data;
  readonly " $fragmentSpreads": FragmentRefs<"LibraryRail_library">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "LibraryRail_library",
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
    }
  ],
  "type": "Library",
  "abstractKey": null
};

(node as any).hash = "aac7a5cf3c8393eae7b739779b18d8fd";

export default node;
