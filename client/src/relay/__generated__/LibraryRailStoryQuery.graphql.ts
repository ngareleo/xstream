/**
 * @generated SignedSource<<29046319b2e842b97c0a3a4c179cfcb3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryRailStoryQuery$variables = {
  libraryId: string;
};
export type LibraryRailStoryQuery$data = {
  readonly node: {
    readonly " $fragmentSpreads": FragmentRefs<"LibraryRail_library">;
  } | null | undefined;
};
export type LibraryRailStoryQuery = {
  response: LibraryRailStoryQuery$data;
  variables: LibraryRailStoryQuery$variables;
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
    "name": "LibraryRailStoryQuery",
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
                "name": "LibraryRail_library"
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
    "name": "LibraryRailStoryQuery",
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
    "cacheID": "5aa537ae16d97978d2c4ae4f57ecd9d5",
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
        "node.name": (v2/*: any*/)
      }
    },
    "name": "LibraryRailStoryQuery",
    "operationKind": "query",
    "text": "query LibraryRailStoryQuery(\n  $libraryId: ID!\n) {\n  node(id: $libraryId) {\n    __typename\n    ... on Library {\n      ...LibraryRail_library\n    }\n    id\n  }\n}\n\nfragment LibraryRail_library on Library {\n  id\n  name\n  mediaType\n}\n"
  }
};
})();

(node as any).hash = "057ab7f254e0a73bba754e99699bb519";

export default node;
