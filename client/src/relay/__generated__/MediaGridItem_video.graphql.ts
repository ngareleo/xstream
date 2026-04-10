/**
 * @generated SignedSource<<022d3d641d6177552e392270a7139538>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type MediaGridItem_video$data = {
  readonly durationSeconds: number;
  readonly fileSizeBytes: number;
  readonly id: string;
  readonly title: string;
  readonly videoStream: {
    readonly height: number;
    readonly width: number;
  } | null | undefined;
  readonly " $fragmentType": "MediaGridItem_video";
};
export type MediaGridItem_video$key = {
  readonly " $data"?: MediaGridItem_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"MediaGridItem_video">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "MediaGridItem_video",
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
      "kind": "ScalarField",
      "name": "fileSizeBytes",
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

(node as any).hash = "1ce26360aaf9124acd55914f77068c8f";

export default node;
