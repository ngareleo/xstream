/**
 * @generated SignedSource<<12aa906e2ee1e950b99fb6b18f98f269>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type MediaList_library$data = {
  readonly id: string;
  readonly name: string;
  readonly videos: {
    readonly edges: ReadonlyArray<{
      readonly node: {
        readonly id: string;
        readonly " $fragmentSpreads": FragmentRefs<"MediaGridItem_video" | "MediaListItem_video">;
      };
    }>;
    readonly totalCount: number;
  };
  readonly " $fragmentType": "MediaList_library";
};
export type MediaList_library$key = {
  readonly " $data"?: MediaList_library$data;
  readonly " $fragmentSpreads": FragmentRefs<"MediaList_library">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "MediaList_library",
  "selections": [
    (v0/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "name",
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
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "VideoEdge",
          "kind": "LinkedField",
          "name": "edges",
          "plural": true,
          "selections": [
            {
              "alias": null,
              "args": null,
              "concreteType": "Video",
              "kind": "LinkedField",
              "name": "node",
              "plural": false,
              "selections": [
                (v0/*: any*/),
                {
                  "args": null,
                  "kind": "FragmentSpread",
                  "name": "MediaListItem_video"
                },
                {
                  "args": null,
                  "kind": "FragmentSpread",
                  "name": "MediaGridItem_video"
                }
              ],
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": "videos(first:50)"
    }
  ],
  "type": "Library",
  "abstractKey": null
};
})();

(node as any).hash = "2478c4a76584b3033db6fb10cea80c0a";

export default node;
