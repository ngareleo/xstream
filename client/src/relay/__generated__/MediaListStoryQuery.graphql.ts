/**
 * @generated SignedSource<<11a6267fc3d469ea7a9303838f5e56c2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type MediaListStoryQuery$variables = {
  libraryId: string;
};
export type MediaListStoryQuery$data = {
  readonly node: {
    readonly " $fragmentSpreads": FragmentRefs<"MediaList_library">;
  } | null | undefined;
};
export type MediaListStoryQuery = {
  response: MediaListStoryQuery$data;
  variables: MediaListStoryQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "libraryId"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "libraryId"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v3 = {
  "enumValues": null,
  "nullable": false,
  "plural": false,
  "type": "String"
},
v4 = {
  "enumValues": null,
  "nullable": false,
  "plural": false,
  "type": "ID"
},
v5 = {
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
    "name": "MediaListStoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "kind": "InlineFragment",
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "MediaList_library"
              }
            ],
            "type": "Library",
            "abstractKey": null
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
    "name": "MediaListStoryQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "node",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          (v2/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
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
                          (v2/*: any*/),
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
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": "videos(first:50)"
              }
            ],
            "type": "Library",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "0b6843b712f8b266aafb229cf17d5498",
    "id": null,
    "metadata": {
      "relayTestingSelectionTypeInfo": {
        "node": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "Node"
        },
        "node.__typename": (v3/*: any*/),
        "node.id": (v4/*: any*/),
        "node.name": (v3/*: any*/),
        "node.videos": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "VideoConnection"
        },
        "node.videos.edges": {
          "enumValues": null,
          "nullable": false,
          "plural": true,
          "type": "VideoEdge"
        },
        "node.videos.edges.node": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "Video"
        },
        "node.videos.edges.node.durationSeconds": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "Float"
        },
        "node.videos.edges.node.fileSizeBytes": (v5/*: any*/),
        "node.videos.edges.node.id": (v4/*: any*/),
        "node.videos.edges.node.title": (v3/*: any*/),
        "node.videos.edges.node.videoStream": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "VideoStreamInfo"
        },
        "node.videos.edges.node.videoStream.height": (v5/*: any*/),
        "node.videos.edges.node.videoStream.width": (v5/*: any*/),
        "node.videos.totalCount": (v5/*: any*/)
      }
    },
    "name": "MediaListStoryQuery",
    "operationKind": "query",
    "text": "query MediaListStoryQuery(\n  $libraryId: ID!\n) {\n  node(id: $libraryId) {\n    __typename\n    ... on Library {\n      ...MediaList_library\n    }\n    id\n  }\n}\n\nfragment MediaGridItem_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n    width\n  }\n}\n\nfragment MediaListItem_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n    width\n  }\n}\n\nfragment MediaList_library on Library {\n  id\n  name\n  videos(first: 50) {\n    totalCount\n    edges {\n      node {\n        id\n        ...MediaListItem_video\n        ...MediaGridItem_video\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "7cf5fed221f05b8589434497bdcf3ae1";

export default node;
