/**
 * @generated SignedSource<<53ef0cbe9dd39a428fa77f5c374178e2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type PlayerPageQuery$variables = {
  id: string;
};
export type PlayerPageQuery$data = {
  readonly video: {
    readonly title: string;
    readonly " $fragmentSpreads": FragmentRefs<"PlayerSidebar_video" | "VideoPlayer_video">;
  } | null | undefined;
};
export type PlayerPageQuery = {
  response: PlayerPageQuery$data;
  variables: PlayerPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "id"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "title",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "PlayerPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Video",
        "kind": "LinkedField",
        "name": "video",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "VideoPlayer_video"
          },
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "PlayerSidebar_video"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "PlayerPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Video",
        "kind": "LinkedField",
        "name": "video",
        "plural": false,
        "selections": [
          (v2/*: any*/),
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
            "concreteType": "VideoStreamInfo",
            "kind": "LinkedField",
            "name": "videoStream",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "height",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "width",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "durationSeconds",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "714b875cb7abda6e0ae555e1d6562f3d",
    "id": null,
    "metadata": {},
    "name": "PlayerPageQuery",
    "operationKind": "query",
    "text": "query PlayerPageQuery(\n  $id: ID!\n) {\n  video(id: $id) {\n    title\n    ...VideoPlayer_video\n    ...PlayerSidebar_video\n    id\n  }\n}\n\nfragment ControlBar_video on Video {\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n\nfragment PlayerSidebar_video on Video {\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n\nfragment VideoPlayer_video on Video {\n  id\n  videoStream {\n    height\n    width\n  }\n  ...ControlBar_video\n}\n"
  }
};
})();

(node as any).hash = "bf2b09c484e44a8406a170aff357b601";

export default node;
