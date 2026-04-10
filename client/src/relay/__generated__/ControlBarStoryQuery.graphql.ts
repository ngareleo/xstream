/**
 * @generated SignedSource<<bc87abc3633ff0f073505248cb5b05e9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ControlBarStoryQuery$variables = {
  videoId: string;
};
export type ControlBarStoryQuery$data = {
  readonly video: {
    readonly " $fragmentSpreads": FragmentRefs<"ControlBar_video">;
  } | null | undefined;
};
export type ControlBarStoryQuery = {
  response: ControlBarStoryQuery$data;
  variables: ControlBarStoryQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "videoId"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "videoId"
  }
],
v2 = {
  "enumValues": null,
  "nullable": false,
  "plural": false,
  "type": "Int"
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "ControlBarStoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Video",
        "kind": "LinkedField",
        "name": "video",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "ControlBar_video"
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
    "name": "ControlBarStoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "Video",
        "kind": "LinkedField",
        "name": "video",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "title",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "durationSeconds",
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
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "e54d4ade601ea1f916f14b832a63f377",
    "id": null,
    "metadata": {
      "relayTestingSelectionTypeInfo": {
        "video": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "Video"
        },
        "video.durationSeconds": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "Float"
        },
        "video.id": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "ID"
        },
        "video.title": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "String"
        },
        "video.videoStream": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "VideoStreamInfo"
        },
        "video.videoStream.height": (v2/*: any*/),
        "video.videoStream.width": (v2/*: any*/)
      }
    },
    "name": "ControlBarStoryQuery",
    "operationKind": "query",
    "text": "query ControlBarStoryQuery(\n  $videoId: ID!\n) {\n  video(id: $videoId) {\n    ...ControlBar_video\n    id\n  }\n}\n\nfragment ControlBar_video on Video {\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n"
  }
};
})();

(node as any).hash = "29c96fc34fac15157e64c4e7c19040aa";

export default node;
