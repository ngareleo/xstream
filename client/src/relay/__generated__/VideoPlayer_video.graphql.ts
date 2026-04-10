/**
 * @generated SignedSource<<78a07e3933bac4a02505c1f24a09e6c8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type VideoPlayer_video$data = {
  readonly id: string;
  readonly videoStream: {
    readonly height: number;
    readonly width: number;
  } | null | undefined;
  readonly " $fragmentSpreads": FragmentRefs<"ControlBar_video">;
  readonly " $fragmentType": "VideoPlayer_video";
};
export type VideoPlayer_video$key = {
  readonly " $data"?: VideoPlayer_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"VideoPlayer_video">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "VideoPlayer_video",
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
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "ControlBar_video"
    }
  ],
  "type": "Video",
  "abstractKey": null
};

(node as any).hash = "cab768954ba77b4461e675a0fab93ecb";

export default node;
