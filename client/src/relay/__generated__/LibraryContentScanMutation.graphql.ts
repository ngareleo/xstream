/**
 * @generated SignedSource<<6f1243cd9e3db9b4291efd1d086b1cbc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from "relay-runtime";
export type LibraryContentScanMutation$variables = Record<PropertyKey, never>;
export type LibraryContentScanMutation$data = {
  readonly scanLibraries: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
};
export type LibraryContentScanMutation = {
  response: LibraryContentScanMutation$data;
  variables: LibraryContentScanMutation$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
    {
      alias: null,
      args: null,
      concreteType: "Library",
      kind: "LinkedField",
      name: "scanLibraries",
      plural: true,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "id",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "name",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
  ];
  return {
    fragment: {
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "LibraryContentScanMutation",
      selections: v0 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "LibraryContentScanMutation",
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: "b9fed36b9477a4790d598f758eb5445e",
      id: null,
      metadata: {},
      name: "LibraryContentScanMutation",
      operationKind: "mutation",
      text: "mutation LibraryContentScanMutation {\n  scanLibraries {\n    id\n    name\n  }\n}\n",
    },
  };
})();

(node as any).hash = "9c6f119b105bfc721555fd827899fc9b";

export default node;
