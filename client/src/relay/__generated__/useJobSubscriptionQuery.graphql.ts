/**
 * @generated SignedSource<<4386075712615dde64707644aa45c98f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from "relay-runtime";
export type JobStatus = "COMPLETE" | "ERROR" | "PENDING" | "RUNNING" | "%future added value";
export type useJobSubscriptionQuery$variables = {
  jobId: string;
};
export type useJobSubscriptionQuery$data = {
  readonly transcodeJobUpdated: {
    readonly completedSegments: number;
    readonly id: string;
    readonly status: JobStatus;
    readonly totalSegments: number | null | undefined;
  };
};
export type useJobSubscriptionQuery = {
  response: useJobSubscriptionQuery$data;
  variables: useJobSubscriptionQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "jobId",
      },
    ],
    v1 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "jobId",
            variableName: "jobId",
          },
        ],
        concreteType: "TranscodeJob",
        kind: "LinkedField",
        name: "transcodeJobUpdated",
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
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "useJobSubscriptionQuery",
      selections: v1 /*: any*/,
      type: "Subscription",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "useJobSubscriptionQuery",
      selections: v1 /*: any*/,
    },
    params: {
      cacheID: "5d10c379e194b1dc732c283d3328a68e",
      id: null,
      metadata: {},
      name: "useJobSubscriptionQuery",
      operationKind: "subscription",
      text: "subscription useJobSubscriptionQuery(\n  $jobId: ID!\n) {\n  transcodeJobUpdated(jobId: $jobId) {\n    id\n    status\n    completedSegments\n    totalSegments\n  }\n}\n",
    },
  };
})();

(node as any).hash = "c36340362358b76cff9615ad789f1050";

export default node;
