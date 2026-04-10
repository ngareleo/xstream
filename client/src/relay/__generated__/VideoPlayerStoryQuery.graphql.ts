/**
 * @generated SignedSource<<1da88c644840f486b90754fd41c35e6e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type VideoPlayerStoryQuery$variables = {
  videoId: string;
};
export type VideoPlayerStoryQuery$data = {
  readonly video: {
    readonly " $fragmentSpreads": FragmentRefs<"VideoPlayer_video">;
  } | null | undefined;
};
export type VideoPlayerStoryQuery = {
  response: VideoPlayerStoryQuery$data;
  variables: VideoPlayerStoryQuery$variables;
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
    "name": "VideoPlayerStoryQuery",
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
            "name": "VideoPlayer_video"
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
    "name": "VideoPlayerStoryQuery",
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
            "name": "title",
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
    "cacheID": "394dc121eed393b80bb10ecad9a6bdac",
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
    "name": "VideoPlayerStoryQuery",
    "operationKind": "query",
    "text": "query VideoPlayerStoryQuery(\n  $videoId: ID!\n) {\n  video(id: $videoId) {\n    ...VideoPlayer_video\n    id\n  }\n}\n\nfragment ControlBar_video on Video {\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n\nfragment VideoPlayer_video on Video {\n  id\n  videoStream {\n    height\n    width\n  }\n  ...ControlBar_video\n}\n"
  }
};
})();

(node as any).hash = "534e2a0f9db1a064dae8bae01cb27d6a";

export default node;
