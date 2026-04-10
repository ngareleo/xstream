/**
 * @generated SignedSource<<66ee142dd9612a0f343e9155386a5b2c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type MediaListItem_video$data = {
  readonly durationSeconds: number;
  readonly fileSizeBytes: number;
  readonly id: string;
  readonly title: string;
  readonly videoStream: {
    readonly height: number;
    readonly width: number;
  } | null | undefined;
  readonly " $fragmentType": "MediaListItem_video";
};
export type MediaListItem_video$key = {
  readonly " $data"?: MediaListItem_video$data;
  readonly " $fragmentSpreads": FragmentRefs<"MediaListItem_video">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "MediaListItem_video",
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

(node as any).hash = "5f153a97b4f3864bc579b2e0e65368a4";

export default node;
