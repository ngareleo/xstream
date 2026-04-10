/**
 * @generated SignedSource<<7a087842cc5c907a55b8b2990af1bfdd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryPageContentQuery$variables = Record<PropertyKey, never>;
export type LibraryPageContentQuery$data = {
  readonly libraries: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly " $fragmentSpreads": FragmentRefs<"LibraryGrid_library" | "LibraryRail_library">;
  }>;
};
export type LibraryPageContentQuery = {
  response: LibraryPageContentQuery$data;
  variables: LibraryPageContentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryPageContentQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Library",
        "kind": "LinkedField",
        "name": "libraries",
        "plural": true,
        "selections": [
          (v0/*: any*/),
          (v1/*: any*/),
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "LibraryRail_library"
          },
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "LibraryGrid_library"
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
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "LibraryPageContentQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Library",
        "kind": "LinkedField",
        "name": "libraries",
        "plural": true,
        "selections": [
          (v0/*: any*/),
          (v1/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "mediaType",
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
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "d92d6aae15cc263cf90586df5762887f",
    "id": null,
    "metadata": {},
    "name": "LibraryPageContentQuery",
    "operationKind": "query",
    "text": "query LibraryPageContentQuery {\n  libraries {\n    id\n    name\n    ...LibraryRail_library\n    ...LibraryGrid_library\n  }\n}\n\nfragment LibraryGrid_library on Library {\n  videos(first: 50) {\n    edges {\n      node {\n        id\n        ...VideoCard_video\n      }\n    }\n  }\n}\n\nfragment LibraryRail_library on Library {\n  id\n  name\n  mediaType\n}\n\nfragment VideoCard_video on Video {\n  id\n  title\n  durationSeconds\n  videoStream {\n    height\n    width\n  }\n}\n"
  }
};
})();

(node as any).hash = "07512de126195d13b10f46ab65ace3bf";

export default node;
