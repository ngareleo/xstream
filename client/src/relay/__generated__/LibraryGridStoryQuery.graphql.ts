/**
 * @generated SignedSource<<3d2b9570e5db958f3c288ada3e18645c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryGridStoryQuery$variables = {
  libraryId: string;
};
export type LibraryGridStoryQuery$data = {
  readonly node: {
    readonly " $fragmentSpreads": FragmentRefs<"LibraryGrid_library">;
  } | null | undefined;
};
export type LibraryGridStoryQuery = {
  response: LibraryGridStoryQuery$data;
  variables: LibraryGridStoryQuery$variables;
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
    "name": "LibraryGridStoryQuery",
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
                "name": "LibraryGrid_library"
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
    "name": "LibraryGridStoryQuery",
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
          {
            "kind": "InlineFragment",
            "selections": [
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
          },
          (v2/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "3f85cab59704a30859e6c8ce698a791b",
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
        "node.videos.edges.node.id": (v4/*: any*/),
        "node.videos.edges.node.title": (v3/*: any*/),
        "node.videos.edges.node.videoStream": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "VideoStreamInfo"
        },
        "node.videos.edges.node.videoStream.height": (v5/*: any*/),
        "node.videos.edges.node.videoStream.width": (v5/*: any*/)
      }
    },
    "name": "LibraryGridStoryQuery",
    "operationKind": "query",
    "text": "query LibraryGridStoryQuery(\n  $libraryId: ID!\n) {\n  node(id: $libraryId) {\n    __typename\n    ... on Library {\n      ...LibraryGrid_library\n    }\n    id\n  }\n}\n\nfragment LibraryGrid_library on Library {\n  videos(first: 50) {\n    edges {\n      node {\n        id\n        ...VideoCard_video\n      }\n    }\n  }\n}\n\nfragment VideoCard_video on Video {\n  id\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n"
  }
};
})();

(node as any).hash = "9fae4188c92b7d8c12e32dbf0dae70b1";

export default node;
