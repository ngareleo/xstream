/**
 * @generated SignedSource<<fc1077d91d38da2f5ae4394618f82961>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type VideoPlayer_video$data = {
  readonly id: string;
  readonly videoStream:
    | {
        readonly height: number;
      }
    | null
    | undefined;
  readonly " $fragmentSpreads": FragmentRefs<"ControlBar_video">;
  readonly " $fragmentType": "VideoPlayer_video";
};
export type VideoPlayer_video$key = {
  readonly " $data"?: VideoPlayer_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"VideoPlayer_video">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "VideoPlayer_video",
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
      args: null,
      kind: "FragmentSpread",
      name: "ControlBar_video",
    },
  ],
  type: "Video",
  abstractKey: null,
};

(node as any).hash = "a1375741013d9867392b7803f8ff81ad";

export default node;
