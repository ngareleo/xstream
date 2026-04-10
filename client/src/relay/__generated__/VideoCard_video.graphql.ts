/**
 * @generated SignedSource<<06c33c725f25e34a02e57a4b5e713d1e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type VideoCard_video$data = {
  readonly durationSeconds: number;
  readonly id: string;
  readonly title: string;
  readonly videoStream:
    | {
        readonly height: number;
      }
    | null
    | undefined;
  readonly " $fragmentType": "VideoCard_video";
};
export type VideoCard_video$key = {
  readonly " $data"?: VideoCard_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"VideoCard_video">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "VideoCard_video",
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

(node as any).hash = "e6d9935152d331ce551a2aed35cb48d0";

export default node;
