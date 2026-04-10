/**
 * @generated SignedSource<<3af64e3e5e1ff54f8f84ebdfbd36208c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type MediaGridItemStoryQuery$variables = {
  videoId: string;
};
export type MediaGridItemStoryQuery$data = {
  readonly video: {
    readonly " $fragmentSpreads": FragmentRefs<"MediaGridItem_video">;
  } | null | undefined;
};
export type MediaGridItemStoryQuery = {
  response: MediaGridItemStoryQuery$data;
  variables: MediaGridItemStoryQuery$variables;
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
    "name": "MediaGridItemStoryQuery",
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
            "name": "MediaGridItem_video"
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
    "name": "MediaGridItemStoryQuery",
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
            "name": "id",
            "storageKey": null
          },
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
            "kind": "ScalarField",
            "name": "fileSizeBytes",
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
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "aa0d79b028f94c0c7e3886a66005581f",
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
        "video.fileSizeBytes": (v2/*: any*/),
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
    "name": "MediaGridItemStoryQuery",
    "operationKind": "query",
    "text": "query MediaGridItemStoryQuery(\n  $videoId: ID!\n) {\n  video(id: $videoId) {\n    ...MediaGridItem_video\n    id\n  }\n}\n\nfragment MediaGridItem_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n    width\n  }\n}\n"
  }
};
})();

(node as any).hash = "951a7c600e205174809625d98003be3d";

export default node;
