import { mergeClasses } from "@griffel/react";
import React, { type FC } from "react";

import { usePageSkeletonStyles } from "./PageSkeleton.styles.js";

export const DashboardSkeleton: FC = () => {
  const s = usePageSkeletonStyles();
  return (
    <div className={s.root}>
      {/* Hero shimmer */}
      <div className={mergeClasses(s.skeleton, s.hero)} />
      {/* Location bar */}
      <div className={s.locationBar}>
        <div className={s.skeleton} style={{ width: 120, height: 14 }} />
      </div>
      {/* Column header row */}
      <div className={s.dirHeader}>
        {[12, 0, 60, 100, 55, 28].map((w, i) =>
          w > 0 ? (
            <div key={i} className={s.skeleton} style={{ width: w, height: 12 }} />
          ) : (
            <div key={i} />
          )
        )}
      </div>
      {/* Profile row shimmers */}
      {[260, 180, 220].map((w, i) => (
        <div key={i} className={s.dirRow}>
          <div className={s.skeleton} style={{ width: 12, height: 12, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div className={s.skeleton} style={{ width: w, height: 13 }} />
            <div className={s.skeleton} style={{ width: w * 0.6, height: 11 }} />
          </div>
          <div className={s.skeleton} style={{ width: 60, height: 13 }} />
          <div className={s.skeleton} style={{ width: 100, height: 13 }} />
          <div className={s.skeleton} style={{ width: 55, height: 13 }} />
          <div className={s.skeleton} style={{ width: 28, height: 28 }} />
        </div>
      ))}
    </div>
  );
};

export const LibrarySkeleton: FC = () => {
  const s = usePageSkeletonStyles();
  return (
    <div className={s.root}>
      {/* Filter bar */}
      <div className={s.filterBar}>
        <div className={s.skeleton} style={{ flex: 1, height: 32 }} />
        <div className={s.skeleton} style={{ width: 110, height: 32 }} />
        <div className={s.skeleton} style={{ width: 68, height: 32 }} />
      </div>
      {/* Poster grids */}
      {[6, 4].map((count, si) => (
        <div key={si} style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className={s.skeleton} style={{ width: 18, height: 18, borderRadius: "50%" }} />
            <div className={s.skeleton} style={{ width: 160, height: 14 }} />
            <div className={s.skeleton} style={{ width: 50, height: 12 }} />
          </div>
          <div className={s.grid} style={{ padding: 0, marginBottom: 8 }}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className={s.posterCard}>
                <div
                  className={mergeClasses(s.skeleton, s.posterImg)}
                  style={{ borderRadius: "8px 8px 0 0" }}
                />
                <div className={s.posterInfo}>
                  <div className={s.skeleton} style={{ width: "80%", height: 13 }} />
                  <div className={s.skeleton} style={{ width: "55%", height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const WatchlistSkeleton: FC = () => {
  const s = usePageSkeletonStyles();
  return (
    <div className={s.root}>
      {/* Stats row */}
      <div className={s.statsRow}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={s.statCell}>
            <div className={s.skeleton} style={{ width: 32, height: 26 }} />
            <div className={s.skeleton} style={{ width: 64, height: 12 }} />
          </div>
        ))}
      </div>
      {/* List items */}
      <div className={s.scrollBody}>
        <div className={s.skeleton} style={{ width: 160, height: 13, marginBottom: 14 }} />
        {[240, 190, 210, 175, 230].map((w, i) => (
          <div key={i} className={s.listItem}>
            <div className={mergeClasses(s.skeleton, s.listThumb)} />
            <div className={s.listInfo}>
              <div className={s.skeleton} style={{ width: w, height: 13 }} />
              <div className={s.skeleton} style={{ width: w * 0.65, height: 11 }} />
            </div>
            <div className={s.skeleton} style={{ width: 80, height: 3, borderRadius: 2 }} />
            <div className={s.skeleton} style={{ width: 28, height: 28 }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SettingsSkeleton: FC = () => {
  const s = usePageSkeletonStyles();
  return (
    <div className={s.settingsShell}>
      {/* Left nav */}
      <div className={s.settingsNav}>
        <div className={s.skeleton} style={{ width: 64, height: 11, marginBottom: 6 }} />
        {[60, 70, 50, 80, 75].map((w, i) => (
          <div key={i} className={s.settingsNavItem}>
            <div className={s.skeleton} style={{ width: w, height: 12 }} />
          </div>
        ))}
      </div>
      {/* Body */}
      <div className={s.settingsBody}>
        <div className={s.skeleton} style={{ width: 80, height: 11 }} />
        <div className={s.skeleton} style={{ width: 220, height: 36, marginBottom: 12 }} />
        {[260, 200, 240].map((w, i) => (
          <div key={i} className={s.settingsRow}>
            <div className={s.skeleton} style={{ width: w, height: 13 }} />
            <div className={s.skeleton} style={{ width: w * 0.7, height: 11 }} />
          </div>
        ))}
      </div>
    </div>
  );
};
