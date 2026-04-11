import { makeStyles } from "@griffel/react";
import React, { type FC } from "react";

import { tokens } from "~/styles/tokens.js";

const useStyles = makeStyles({
  // ── Shared shell ──────────────────────────────────────────────────────────
  statsRow: {
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface,
    flexShrink: "0",
  },
  statCell: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 28px",
    borderRight: `1px solid ${tokens.colorBorder}`,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
    padding: "20px",
  },
  posterCard: {
    borderRadius: tokens.radiusMd,
    overflow: "hidden",
    backgroundColor: tokens.colorSurface2,
  },
  posterImg: {
    paddingBottom: "150%",
  },
  posterInfo: {
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  // ── Dashboard skeletons ───────────────────────────────────────────────────
  hero: {
    height: "220px",
    flexShrink: "0",
  },
  locationBar: {
    height: "38px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    display: "flex",
    alignItems: "center",
    padding: "0 24px",
    flexShrink: "0",
  },
  dirHeader: {
    display: "grid",
    gridTemplateColumns: "32px 1fr 120px 160px 80px 80px",
    padding: "0 16px",
    height: "32px",
    alignItems: "center",
    gap: "8px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
  },
  dirRow: {
    display: "grid",
    gridTemplateColumns: "32px 1fr 120px 160px 80px 80px",
    padding: "0 16px",
    height: "52px",
    alignItems: "center",
    gap: "8px",
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
  },
  // ── Watchlist skeletons ───────────────────────────────────────────────────
  listItem: {
    display: "grid",
    gridTemplateColumns: "60px 1fr auto auto",
    alignItems: "center",
    gap: "12px",
    padding: "10px 0",
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
  },
  listThumb: {
    width: "60px",
    height: "34px",
    borderRadius: "4px",
  },
  listInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  // ── Settings skeletons ────────────────────────────────────────────────────
  tabBar: {
    display: "flex",
    alignItems: "center",
    borderBottom: `1px solid ${tokens.colorBorder}`,
    flexShrink: "0",
    backgroundColor: tokens.colorSurface,
    padding: "0 4px",
  },
  tab: {
    padding: "0 18px",
    height: "44px",
    display: "flex",
    alignItems: "center",
  },
  settingsBody: {
    padding: "28px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  settingsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingBottom: "24px",
    borderBottom: `1px solid ${tokens.colorBorder}`,
  },
  // ── Layout helpers ────────────────────────────────────────────────────────
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  scrollBody: {
    flex: "1",
    overflowY: "auto",
    padding: "24px",
  },
});

// ── DashboardSkeleton ─────────────────────────────────────────────────────
export const DashboardSkeleton: FC = () => {
  const s = useStyles();
  return (
    <div className={s.root}>
      {/* Hero shimmer */}
      <div className={`skeleton ${s.hero}`} />
      {/* Location bar */}
      <div className={s.locationBar}>
        <div className="skeleton" style={{ width: 120, height: 14 }} />
      </div>
      {/* Column header row */}
      <div className={s.dirHeader}>
        {[12, 0, 60, 100, 55, 28].map((w, i) =>
          w > 0 ? (
            <div key={i} className="skeleton" style={{ width: w, height: 12 }} />
          ) : (
            <div key={i} />
          )
        )}
      </div>
      {/* Profile row shimmers */}
      {[260, 180, 220].map((w, i) => (
        <div key={i} className={s.dirRow}>
          <div className="skeleton" style={{ width: 12, height: 12, borderRadius: "50%" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div className="skeleton" style={{ width: w, height: 13 }} />
            <div className="skeleton" style={{ width: w * 0.6, height: 11 }} />
          </div>
          <div className="skeleton" style={{ width: 60, height: 13 }} />
          <div className="skeleton" style={{ width: 100, height: 13 }} />
          <div className="skeleton" style={{ width: 55, height: 13 }} />
          <div className="skeleton" style={{ width: 28, height: 28 }} />
        </div>
      ))}
    </div>
  );
};

// ── LibrarySkeleton ───────────────────────────────────────────────────────
export const LibrarySkeleton: FC = () => {
  const s = useStyles();
  return (
    <div className={s.root}>
      {/* Filter bar */}
      <div className={s.filterBar}>
        <div className="skeleton" style={{ flex: 1, height: 32 }} />
        <div className="skeleton" style={{ width: 110, height: 32 }} />
        <div className="skeleton" style={{ width: 68, height: 32 }} />
      </div>
      {/* Poster grids */}
      {[6, 4].map((count, si) => (
        <div key={si} style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="skeleton" style={{ width: 18, height: 18, borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: 160, height: 14 }} />
            <div className="skeleton" style={{ width: 50, height: 12 }} />
          </div>
          <div className={s.grid} style={{ padding: 0, marginBottom: 8 }}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className={s.posterCard}>
                <div
                  className={`skeleton ${s.posterImg}`}
                  style={{ borderRadius: "8px 8px 0 0" }}
                />
                <div className={s.posterInfo}>
                  <div className="skeleton" style={{ width: "80%", height: 13 }} />
                  <div className="skeleton" style={{ width: "55%", height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── WatchlistSkeleton ─────────────────────────────────────────────────────
export const WatchlistSkeleton: FC = () => {
  const s = useStyles();
  return (
    <div className={s.root}>
      {/* Stats row */}
      <div className={s.statsRow}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={s.statCell}>
            <div className="skeleton" style={{ width: 32, height: 26 }} />
            <div className="skeleton" style={{ width: 64, height: 12 }} />
          </div>
        ))}
      </div>
      {/* List items */}
      <div className={s.scrollBody}>
        <div className="skeleton" style={{ width: 160, height: 13, marginBottom: 14 }} />
        {[240, 190, 210, 175, 230].map((w, i) => (
          <div key={i} className={s.listItem}>
            <div className={`skeleton ${s.listThumb}`} />
            <div className={s.listInfo}>
              <div className="skeleton" style={{ width: w, height: 13 }} />
              <div className="skeleton" style={{ width: w * 0.65, height: 11 }} />
            </div>
            <div className="skeleton" style={{ width: 80, height: 3, borderRadius: 2 }} />
            <div className="skeleton" style={{ width: 28, height: 28 }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── SettingsSkeleton ──────────────────────────────────────────────────────
export const SettingsSkeleton: FC = () => {
  const s = useStyles();
  return (
    <div className={s.root}>
      {/* Tab bar */}
      <div className={s.tabBar}>
        {[60, 70, 90].map((w, i) => (
          <div key={i} className={s.tab}>
            <div className="skeleton" style={{ width: w, height: 13 }} />
          </div>
        ))}
      </div>
      {/* Body */}
      <div className={s.settingsBody}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={s.settingsSection}>
            <div className="skeleton" style={{ width: 200, height: 14 }} />
            <div className="skeleton" style={{ width: "60%", height: 11 }} />
            <div className="skeleton" style={{ width: "100%", height: 36 }} />
          </div>
        ))}
      </div>
    </div>
  );
};
