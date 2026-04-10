/**
 * @generated SignedSource<<257d84616c88ff637a736d37b24997aa>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type VideoDetailsPanelStoryQuery$variables = {
  videoId: string;
};
export type VideoDetailsPanelStoryQuery$data = {
  readonly video: {
    readonly " $fragmentSpreads": FragmentRefs<"VideoDetailsPanel_video">;
  } | null | undefined;
};
export type VideoDetailsPanelStoryQuery = {
  response: VideoDetailsPanelStoryQuery$data;
  variables: VideoDetailsPanelStoryQuery$variables;
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
},
v3 = {
  "enumValues": null,
  "nullable": false,
  "plural": false,
  "type": "String"
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "VideoDetailsPanelStoryQuery",
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
            "name": "VideoDetailsPanel_video"
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
    "name": "VideoDetailsPanelStoryQuery",
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
                "name": "codec",
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
    "cacheID": "d3576148c10af5b8f55743cac53af8f7",
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
        "video.title": (v3/*: any*/),
        "video.videoStream": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "VideoStreamInfo"
        },
        "video.videoStream.codec": (v3/*: any*/),
        "video.videoStream.height": (v2/*: any*/)
      }
    },
    "name": "VideoDetailsPanelStoryQuery",
    "operationKind": "query",
    "text": "query VideoDetailsPanelStoryQuery(\n  $videoId: ID!\n) {\n  video(id: $videoId) {\n    ...VideoDetailsPanel_video\n    id\n  }\n}\n\nfragment VideoDetailsPanel_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n    codec\n  }\n}\n"
  }
};
})();

(node as any).hash = "405541459cbf2c8a24f2df7971f3c09c";

export default node;
