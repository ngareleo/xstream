/**
 * @generated SignedSource<<525e4da7227b34480285986327ca7f84>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type PlayerPageQuery$variables = {
  id: string;
};
export type PlayerPageQuery$data = {
  readonly video:
    | {
        readonly " $fragmentSpreads": FragmentRefs<"VideoPlayer_video">;
      }
    | null
    | undefined;
};
export type PlayerPageQuery = {
  response: PlayerPageQuery$data;
  variables: PlayerPageQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "id",
      },
    ],
    v1 = [
      {
        kind: "Variable",
        name: "id",
        variableName: "id",
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "PlayerPageQuery",
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: "Video",
          kind: "LinkedField",
          name: "video",
          plural: false,
          selections: [
            {
              args: null,
              kind: "FragmentSpread",
              name: "VideoPlayer_video",
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
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "PlayerPageQuery",
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: "Video",
          kind: "LinkedField",
          name: "video",
          plural: false,
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
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "286849123e0b2304e0ab941c837e4701",
      id: null,
      metadata: {},
      name: "PlayerPageQuery",
      operationKind: "query",
      text: "query PlayerPageQuery(\n  $id: ID!\n) {\n  video(id: $id) {\n    ...VideoPlayer_video\n    id\n  }\n}\n\nfragment ControlBar_video on Video {\n  title\n  durationSeconds\n  videoStream {\n    height\n  }\n}\n\nfragment VideoPlayer_video on Video {\n  id\n  videoStream {\n    height\n  }\n  ...ControlBar_video\n}\n",
    },
  };
})();

(node as any).hash = "82c4920b2e0739ffaacebd63b0864063";

export default node;
