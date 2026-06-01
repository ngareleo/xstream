import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import { useSettingsTabStyles } from "~/components/settings-tabs/SettingsTabs.styles.js";
import { useToast } from "~/hooks/useToast.js";
import type { DangerTabWipeAllMutation } from "~/relay/__generated__/DangerTabWipeAllMutation.graphql.js";
import type { DangerTabWipeDbMutation } from "~/relay/__generated__/DangerTabWipeDbMutation.graphql.js";
import type { DangerTabWipePosterCacheMutation } from "~/relay/__generated__/DangerTabWipePosterCacheMutation.graphql.js";
import type { DangerTabWipeSegmentCacheMutation } from "~/relay/__generated__/DangerTabWipeSegmentCacheMutation.graphql.js";
import { clearAppLocal } from "~/services/localStore.js";

import { strings } from "./DangerTab.strings.js";
import { useDangerTabStyles } from "./DangerTab.styles.js";

const WIPE_DB = graphql`
  mutation DangerTabWipeDbMutation {
    wipeDb
  }
`;
const WIPE_POSTERS = graphql`
  mutation DangerTabWipePosterCacheMutation {
    wipePosterCache
  }
`;
const WIPE_SEGMENTS = graphql`
  mutation DangerTabWipeSegmentCacheMutation {
    wipeSegmentCache
  }
`;
const WIPE_ALL = graphql`
  mutation DangerTabWipeAllMutation {
    wipeAll
  }
`;

type WipeKey = "db" | "posters" | "segments" | "all";

const TITLE: Record<WipeKey, string> = {
  db: strings.wipeDbTitle,
  posters: strings.wipePostersTitle,
  segments: strings.wipeSegmentsTitle,
  all: strings.wipeAllTitle,
};

const CONFIRM_WINDOW_MS = 3000;

export const DangerTab: FC = () => {
  const tabStyles = useSettingsTabStyles();
  const styles = useDangerTabStyles();
  const toast = useToast();

  const [wipeDb, dbPending] = useMutation<DangerTabWipeDbMutation>(WIPE_DB);
  const [wipePosters, postersPending] = useMutation<DangerTabWipePosterCacheMutation>(WIPE_POSTERS);
  const [wipeSegments, segmentsPending] =
    useMutation<DangerTabWipeSegmentCacheMutation>(WIPE_SEGMENTS);
  const [wipeAll, allPending] = useMutation<DangerTabWipeAllMutation>(WIPE_ALL);

  const [armed, setArmed] = useState<WipeKey | null>(null);
  const armedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-disarm: if the user clicks once but doesn't follow through within
  // the confirm window, the button reverts to its idle state — so a stale
  // single click can't sit there waiting to fire-on-next-click.
  useEffect(() => {
    if (armed === null) return undefined;
    armedTimer.current = setTimeout(() => setArmed(null), CONFIRM_WINDOW_MS);
    return () => {
      if (armedTimer.current) clearTimeout(armedTimer.current);
    };
  }, [armed]);

  const fire = useCallback(
    (key: WipeKey): void => {
      const fail = (error: string): void => {
        toast({
          variant: "error",
          message: strings.formatString(strings.toastFailFormat, {
            title: TITLE[key],
            error,
          }) as string,
        });
      };
      const onCompleted = (
        _: unknown,
        errors: ReadonlyArray<{ message: string }> | null | undefined
      ): void => {
        if (errors && errors.length > 0) {
          fail(errors[0].message);
          return;
        }
        // Hard reset — also clear client-side UI state (pane width, last-opened film).
        if (key === "all") clearAppLocal();
        toast({
          variant: "success",
          message: strings.formatString(strings.toastOkFormat, { title: TITLE[key] }) as string,
        });
      };
      const onError = (err: Error): void => fail(err.message);
      const variables = {};
      switch (key) {
        case "db":
          wipeDb({ variables, onCompleted, onError });
          break;
        case "posters":
          wipePosters({ variables, onCompleted, onError });
          break;
        case "segments":
          wipeSegments({ variables, onCompleted, onError });
          break;
        case "all":
          wipeAll({ variables, onCompleted, onError });
          break;
      }
    },
    [wipeDb, wipePosters, wipeSegments, wipeAll, toast]
  );

  const onClick = (key: WipeKey): void => {
    if (armed === key) {
      setArmed(null);
      fire(key);
    } else {
      setArmed(key);
    }
  };

  const pendingFor = (key: WipeKey): boolean => {
    switch (key) {
      case "db":
        return dbPending;
      case "posters":
        return postersPending;
      case "segments":
        return segmentsPending;
      case "all":
        return allPending;
    }
  };

  const renderRow = (key: WipeKey, title: string, desc: string): JSX.Element => {
    const isArmed = armed === key;
    const isPending = pendingFor(key);
    const label = isPending ? strings.btnPending : isArmed ? strings.btnConfirm : strings.btnIdle;
    return (
      <div className={styles.row}>
        <div>
          <div className={styles.rowTitle}>{title}</div>
          <div className={styles.rowDesc}>{desc}</div>
        </div>
        <button
          type="button"
          className={mergeClasses(styles.btn, isArmed && styles.btnArmed)}
          onClick={() => onClick(key)}
          disabled={isPending}
        >
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className={tabStyles.section}>
      <div className={tabStyles.dangerZone}>
        <div className={tabStyles.dangerTitle}>{strings.dangerTitle}</div>
        <div className={tabStyles.dangerDesc}>{strings.dangerDesc}</div>
        <div className={styles.stack}>
          {renderRow("db", strings.wipeDbTitle, strings.wipeDbDesc)}
          {renderRow("posters", strings.wipePostersTitle, strings.wipePostersDesc)}
          {renderRow("segments", strings.wipeSegmentsTitle, strings.wipeSegmentsDesc)}
          {renderRow("all", strings.wipeAllTitle, strings.wipeAllDesc)}
        </div>
      </div>
    </div>
  );
};
