/**
 * @generated SignedSource<<0d495ba129bc74e15ee3f7e12a30acbf>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProfilesSidebarStoryQuery$variables = {
  libraryId: string;
};
export type ProfilesSidebarStoryQuery$data = {
  readonly node: {
    readonly " $fragmentSpreads": FragmentRefs<"ProfilesSidebar_library">;
  } | null | undefined;
};
export type ProfilesSidebarStoryQuery = {
  response: ProfilesSidebarStoryQuery$data;
  variables: ProfilesSidebarStoryQuery$variables;
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
    "name": "ProfilesSidebarStoryQuery",
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
                "name": "ProfilesSidebar_library"
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
    "name": "ProfilesSidebarStoryQuery",
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
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          },
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
                    "kind": "ScalarField",
                    "name": "totalCount",
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
    "cacheID": "1117df3e319f108cfe09dd1ba79e8000",
    "id": null,
    "metadata": {
      "relayTestingSelectionTypeInfo": {
        "node": {
          "enumValues": null,
          "nullable": true,
          "plural": false,
          "type": "Node"
        },
        "node.__typename": (v2/*: any*/),
        "node.id": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "ID"
        },
        "node.mediaType": {
          "enumValues": [
            "MOVIES",
            "TV_SHOWS"
          ],
          "nullable": false,
          "plural": false,
          "type": "MediaType"
        },
        "node.name": (v2/*: any*/),
        "node.videos": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "VideoConnection"
        },
        "node.videos.totalCount": {
          "enumValues": null,
          "nullable": false,
          "plural": false,
          "type": "Int"
        }
      }
    },
    "name": "ProfilesSidebarStoryQuery",
    "operationKind": "query",
    "text": "query ProfilesSidebarStoryQuery(\n  $libraryId: ID!\n) {\n  node(id: $libraryId) {\n    __typename\n    ... on Library {\n      ...ProfilesSidebar_library\n    }\n    id\n  }\n}\n\nfragment ProfilesSidebar_library on Library {\n  id\n  name\n  mediaType\n  videos(first: 50) {\n    totalCount\n  }\n}\n"
  }
};
})();

(node as any).hash = "2c03fbabd1098b28461eeaf8884d7429";

export default node;
