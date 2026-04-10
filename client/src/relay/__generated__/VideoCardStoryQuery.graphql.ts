/**
 * @generated SignedSource<<9f0216671f8c09a7010ce98a89eaaaec>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type VideoCardStoryQuery$variables = {
  videoId: string;
};
export type VideoCardStoryQuery$data = {
  readonly video: {
    readonly " $fragmentSpreads": FragmentRefs<"VideoCard_video">;
  } | null | undefined;
};
export type VideoCardStoryQuery = {
  response: VideoCardStoryQuery$data;
  variables: VideoCardStoryQuery$variables;
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
    "name": "VideoCardStoryQuery",
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
            "name": "VideoCard_video"
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
    "name": "VideoCardStoryQuery",
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
    "cacheID": "eeffaed40798bd8b540f62cd67bc2db5",
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
    "name": "VideoCardStoryQuery",
    "operationKind": "query",
    "text": "query VideoCardStoryQuery(\n  $videoId: ID!\n) {\n  video(id: $videoId) {\n    ...VideoCard_video\n    id\n  }\n}\n\nfragment VideoCard_video on Video {\n  id\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n"
  }
};
})();

(node as any).hash = "fec3342266fc41b91c85188deda826c4";

export default node;
