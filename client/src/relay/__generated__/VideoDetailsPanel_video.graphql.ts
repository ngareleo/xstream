/**
 * @generated SignedSource<<8d3afa96f991eb8f8b7006100ad2c0a0>>
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

(node as any).hash = "fc3decde42dd8522406ec68ee39ce172";

export default node;
