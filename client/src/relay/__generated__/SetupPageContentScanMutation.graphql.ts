/**
 * @generated SignedSource<<53e42d8d887a723cde35eb6054767c48>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type SetupPageContentScanMutation$variables = Record<PropertyKey, never>;
export type SetupPageContentScanMutation$data = {
  readonly scanLibraries: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
};
export type SetupPageContentScanMutation = {
  response: SetupPageContentScanMutation$data;
  variables: SetupPageContentScanMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Library",
    "kind": "LinkedField",
    "name": "scanLibraries",
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
    "name": "SetupPageContentScanMutation",
    "selections": (v0/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "SetupPageContentScanMutation",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "76c75d1a1752756d9eb33b984e0647b8",
    "id": null,
    "metadata": {},
    "name": "SetupPageContentScanMutation",
    "operationKind": "mutation",
    "text": "mutation SetupPageContentScanMutation {\n  scanLibraries {\n    id\n    name\n  }\n}\n"
  }
};
})();

(node as any).hash = "15438ba32f129c84fa9511c9c107adfd";

export default node;
