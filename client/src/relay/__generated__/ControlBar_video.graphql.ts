/**
 * @generated SignedSource<<b2be295af6c52a1e679837d3c4bf6c30>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type ControlBar_video$data = {
  readonly durationSeconds: number;
  readonly title: string;
  readonly videoStream:
    | {
        readonly height: number;
      }
    | null
    | undefined;
  readonly " $fragmentType": "ControlBar_video";
};
export type ControlBar_video$key = {
  readonly " $data"?: ControlBar_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"ControlBar_video">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "ControlBar_video",
  selections: [
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
  type: "Video",
  abstractKey: null,
};

(node as any).hash = "168247599181915f14103b7ea52fc5da";

export default node;
