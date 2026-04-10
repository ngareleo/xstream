/**
 * @generated SignedSource<<968c7b3567fe948e19492a595ccf2a8e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ControlBar_video$data = {
  readonly durationSeconds: number;
  readonly title: string;
  readonly videoStream: {
    readonly height: number;
    readonly width: number;
  } | null | undefined;
  readonly " $fragmentType": "ControlBar_video";
};
export type ControlBar_video$key = {
  readonly " $data"?: ControlBar_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"ControlBar_video">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "ControlBar_video",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "title",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "durationSeconds",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "VideoStreamInfo",
      "kind": "LinkedField",
      "name": "videoStream",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "height",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "width",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Video",
  "abstractKey": null
};

(node as any).hash = "81e40d9d310e9373e4dacf347887e54b";

export default node;
