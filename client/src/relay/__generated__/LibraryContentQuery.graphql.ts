/**
 * @generated SignedSource<<76ae9cd2bd3f284be1e09f14b7a220fc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type LibraryContentQuery$variables = Record<PropertyKey, never>;
export type LibraryContentQuery$data = {
  readonly libraries: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly " $fragmentSpreads": FragmentRefs<"LibraryGrid_library">;
  }>;
};
export type LibraryContentQuery = {
  response: LibraryContentQuery$data;
  variables: LibraryContentQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "id",
      storageKey: null,
    },
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    };
  return {
    fragment: {
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "LibraryContentQuery",
      selections: [
        {
          alias: null,
          args: null,
          concreteType: "Library",
          kind: "LinkedField",
          name: "libraries",
          plural: true,
          selections: [
            v0 /*: any*/,
            v1 /*: any*/,
            {
              args: null,
              kind: "FragmentSpread",
              name: "LibraryGrid_library",
            },
          ],
          storageKey: null,
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "LibraryContentQuery",
      selections: [
        {
          alias: null,
          args: null,
          concreteType: "Library",
          kind: "LinkedField",
          name: "libraries",
          plural: true,
          selections: [
            v0 /*: any*/,
            v1 /*: any*/,
            {
              alias: null,
              args: [
                {
                  kind: "Literal",
                  name: "first",
                  value: 50,
                },
              ],
              concreteType: "VideoConnection",
              kind: "LinkedField",
              name: "videos",
              plural: false,
              selections: [
                {
                  alias: null,
                  args: null,
                  concreteType: "VideoEdge",
                  kind: "LinkedField",
                  name: "edges",
                  plural: true,
                  selections: [
                    {
                      alias: null,
                      args: null,
                      concreteType: "Video",
                      kind: "LinkedField",
                      name: "node",
                      plural: false,
                      selections: [
                        v0 /*: any*/,
                        {
                          alias: null,
                          args: null,
                          kind: "ScalarField",
                          name: "title",
                          storageKey: null,
                        },
                        {
                          alias: null,
                          args: null,
                          kind: "ScalarField",
                          name: "durationSeconds",
                          storageKey: null,
                        },
                        {
                          alias: null,
                          args: null,
                          concreteType: "VideoStreamInfo",
                          kind: "LinkedField",
                          name: "videoStream",
                          plural: false,
                          selections: [
                            {
                              alias: null,
                              args: null,
                              kind: "ScalarField",
                              name: "height",
                              storageKey: null,
                            },
                          ],
                          storageKey: null,
                        },
                      ],
                      storageKey: null,
                    },
                  ],
                  storageKey: null,
                },
              ],
              storageKey: "videos(first:50)",
            },
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "1d93d345e630466387b45ed3fdc4b23f",
      id: null,
      metadata: {},
      name: "LibraryContentQuery",
      operationKind: "query",
      text: "query LibraryContentQuery {\n  libraries {\n    id\n    name\n    ...LibraryGrid_library\n  }\n}\n\nfragment LibraryGrid_library on Library {\n  videos(first: 50) {\n    edges {\n      node {\n        id\n        ...VideoCard_video\n      }\n    }\n  }\n}\n\nfragment VideoCard_video on Video {\n  id\n  title\n  durationSeconds\n  videoStream {\n    height\n  }\n}\n",
    },
  };
})();

(node as any).hash = "10465ed4aa95b5f1b87c6692e2a09b84";

export default node;
