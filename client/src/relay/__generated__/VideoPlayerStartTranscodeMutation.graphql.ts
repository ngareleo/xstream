/**
 * @generated SignedSource<<8d466f176bc005bed60d7831e1f0b86a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from "relay-runtime";
export type JobStatus = "COMPLETE" | "ERROR" | "PENDING" | "RUNNING" | "%future added value";
export type Resolution =
  | "RESOLUTION_1080P"
  | "RESOLUTION_240P"
  | "RESOLUTION_360P"
  | "RESOLUTION_480P"
  | "RESOLUTION_4K"
  | "RESOLUTION_720P"
  | "%future added value";
export type VideoPlayerStartTranscodeMutation$variables = {
  resolution: Resolution;
  videoId: string;
};
export type VideoPlayerStartTranscodeMutation$data = {
  readonly startTranscode: {
    readonly completedSegments: number;
    readonly id: string;
    readonly status: JobStatus;
    readonly totalSegments: number | null | undefined;
  };
};
export type VideoPlayerStartTranscodeMutation = {
  response: VideoPlayerStartTranscodeMutation$data;
  variables: VideoPlayerStartTranscodeMutation$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "resolution",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "videoId",
    },
    v2 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "resolution",
            variableName: "resolution",
          },
          {
            kind: "Variable",
            name: "videoId",
            variableName: "videoId",
          },
        ],
        concreteType: "TranscodeJob",
        kind: "LinkedField",
        name: "startTranscode",
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
            kind: "ScalarField",
            name: "status",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "completedSegments",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "totalSegments",
            storageKey: null,
          },
        ],
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [v0 /*: any*/, v1 /*: any*/],
      kind: "Fragment",
      metadata: null,
      name: "VideoPlayerStartTranscodeMutation",
      selections: v2 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [v1 /*: any*/, v0 /*: any*/],
      kind: "Operation",
      name: "VideoPlayerStartTranscodeMutation",
      selections: v2 /*: any*/,
    },
    params: {
      cacheID: "e84d45894645faaf0d69b3394317eca2",
      id: null,
      metadata: {},
      name: "VideoPlayerStartTranscodeMutation",
      operationKind: "mutation",
      text: "mutation VideoPlayerStartTranscodeMutation(\n  $videoId: ID!\n  $resolution: Resolution!\n) {\n  startTranscode(videoId: $videoId, resolution: $resolution) {\n    id\n    status\n    completedSegments\n    totalSegments\n  }\n}\n",
    },
  };
})();

(node as any).hash = "3b98fd9147c6a3f8cd5385c79d0bb69a";

export default node;
