/**
 * @generated SignedSource<<e4672a79ccaf69a79d40ffa1f1a1d760>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type MediaType = "MOVIES" | "TV_SHOWS" | "%future added value";
export type SetupPageContentQuery$variables = Record<PropertyKey, never>;
export type SetupPageContentQuery$data = {
  readonly libraries: ReadonlyArray<{
    readonly id: string;
    readonly mediaType: MediaType;
    readonly name: string;
    readonly path: string;
    readonly videos: {
      readonly totalCount: number;
    };
  }>;
};
export type SetupPageContentQuery = {
  response: SetupPageContentQuery$data;
  variables: SetupPageContentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Library",
    "kind": "LinkedField",
    "name": "libraries",
    "plural": true,
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
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "path",
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
            "value": 1
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
        "storageKey": "videos(first:1)"
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "SetupPageContentQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "SetupPageContentQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "486c626a11168090a5564ff318e16c11",
    "id": null,
    "metadata": {},
    "name": "SetupPageContentQuery",
    "operationKind": "query",
    "text": "query SetupPageContentQuery {\n  libraries {\n    id\n    name\n    path\n    mediaType\n    videos(first: 1) {\n      totalCount\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "fd7e134f5929c7d0acfccc917edf585b";

export default node;
