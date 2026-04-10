/**
 * @generated SignedSource<<06aa4d7bb84cf9b8d932114e82fdf051>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type VideoDetailsPanel_video$data = {
  readonly durationSeconds: number;
  readonly fileSizeBytes: number;
  readonly id: string;
  readonly title: string;
  readonly videoStream: {
    readonly codec: string;
    readonly height: number;
    readonly width: number;
  } | null | undefined;
  readonly " $fragmentType": "VideoDetailsPanel_video";
};
export type VideoDetailsPanel_video$key = {
  readonly " $data"?: VideoDetailsPanel_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"VideoDetailsPanel_video">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "VideoDetailsPanel_video",
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
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "codec",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Video",
  "abstractKey": null
};

(node as any).hash = "5c2cacce77da78e936c08bf1767aa61b";

export default node;
