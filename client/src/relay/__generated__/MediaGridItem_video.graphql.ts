/**
 * @generated SignedSource<<63e1f3fc3d476f5dfa9a302273513ada>>
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
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Video",
  "abstractKey": null
};

(node as any).hash = "78df6fd7c4a27062a7eb138e2c2d203a";

export default node;
