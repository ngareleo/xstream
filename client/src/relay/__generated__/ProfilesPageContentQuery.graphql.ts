/**
 * @generated SignedSource<<258e3b96f9db15012f73908ef5806c90>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProfilesPageContentQuery$variables = Record<PropertyKey, never>;
export type ProfilesPageContentQuery$data = {
  readonly libraries: ReadonlyArray<{
    readonly id: string;
    readonly videos: {
      readonly edges: ReadonlyArray<{
        readonly node: {
          readonly id: string;
          readonly " $fragmentSpreads": FragmentRefs<"VideoDetailsPanel_video">;
        };
      }>;
    };
    readonly " $fragmentSpreads": FragmentRefs<"MediaList_library" | "ProfilesSidebar_library">;
  }>;
};
export type ProfilesPageContentQuery = {
  response: ProfilesPageContentQuery$data;
  variables: ProfilesPageContentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = [
  {
    "kind": "Literal",
    "name": "first",
    "value": 50
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "ProfilesPageContentQuery",
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
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "ProfilesSidebar_library"
          },
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "MediaList_library"
          },
          {
            "alias": null,
            "args": (v1/*: any*/),
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
                        "args": null,
                        "kind": "FragmentSpread",
                        "name": "VideoDetailsPanel_video"
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
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "ProfilesPageContentQuery",
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
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "name",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "mediaType",
            "storageKey": null
          },
          {
            "alias": null,
            "args": (v1/*: any*/),
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
    "cacheID": "9ebfb462c09e379ec60aaf13bc0bc089",
    "id": null,
    "metadata": {},
    "name": "ProfilesPageContentQuery",
    "operationKind": "query",
    "text": "query ProfilesPageContentQuery {\n  libraries {\n    id\n    ...ProfilesSidebar_library\n    ...MediaList_library\n    videos(first: 50) {\n      edges {\n        node {\n          id\n          ...VideoDetailsPanel_video\n        }\n      }\n    }\n  }\n}\n\nfragment MediaGridItem_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n  }\n}\n\nfragment MediaListItem_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n  }\n}\n\nfragment MediaList_library on Library {\n  id\n  name\n  videos(first: 50) {\n    totalCount\n    edges {\n      node {\n        id\n        ...MediaListItem_video\n        ...MediaGridItem_video\n      }\n    }\n  }\n}\n\nfragment ProfilesSidebar_library on Library {\n  id\n  name\n  mediaType\n  videos(first: 50) {\n    totalCount\n  }\n}\n\nfragment VideoDetailsPanel_video on Video {\n  id\n  title\n  durationSeconds\n  fileSizeBytes\n  videoStream {\n    height\n    codec\n  }\n}\n"
  }
};
})();

(node as any).hash = "d0bf880e65b65e5c5a81bf643510790b";

export default node;
