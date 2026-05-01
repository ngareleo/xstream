import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { IconSearch, IconFilm, IconPlay, IconClose } from "../../lib/icons.js";
import { watchlist, films } from "../../data/mock.js";
import { useSimulatedLoad } from "../../hooks/useSimulatedLoad.js";
import { usePageLoading } from "../../components/LoadingBar/LoadingBarContext.js";
import { DevThrowTarget } from "../../components/DevTools/DevToolsContext.js";
import { useWatchlistStyles } from "./Watchlist.styles.js";


// ── Watchlist (page root) ─────────────────────────────────────────────────
export const Watchlist: FC = () => {
  const loading = useSimulatedLoad();
  usePageLoading(loading);
  const [search,  setSearch]  = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const visible = watchlist.filter(
    (item) =>
      !removed.has(item.id) &&
      (!search.trim() || item.title.toLowerCase().includes(search.toLowerCase())),
  );

  const inProgress = visible.filter((i) => i.progress != null);
  const queued     = visible.filter((i) => i.progress == null);

  const searchResults = search.trim()
    ? films.filter((f) => f.title?.toLowerCase().includes(search.toLowerCase()))
    : [];

  const w = useWatchlistStyles();

  return (
    <DevThrowTarget id="Watchlist">
    <>
      <AppHeader collapsed={false}>
        <span className={w.topbarTitle}>Watchlist</span>
        <span className={w.topbarSep} />
        <span className={w.topbarSub}>{visible.length} titles</span>
      </AppHeader>

      <div className="main">
        <div className={w.content}>
          <div className={w.stats}>
            <div>
              <div className={w.statNum}>{visible.length}</div>
              <div className={w.statLabel}>Queued</div>
            </div>
            <div>
              <div className={mergeClasses(w.statNum, w.statNumGreen)}>{inProgress.length}</div>
              <div className={w.statLabel}>In Progress</div>
            </div>
            <div>
              <div className={mergeClasses(w.statNum, w.statNumRed)}>{watchlist.length - visible.length}</div>
              <div className={w.statLabel}>Watched</div>
            </div>
          </div>

          <div className={w.layout}>
            <div>
              {inProgress.length > 0 && (
                <>
                  <div className={w.sectionHead}>Continue Watching</div>
                  <div className={w.items}>
                    {inProgress.map((item) => (
                      <div key={item.id} className={mergeClasses(w.item, w.itemAvailable)}>
                        <div className={w.thumb} style={{ background: "#1C1C1C" }}>
                          <IconFilm size={16} style={{ color: "rgba(255,255,255,0.2)" }} />
                        </div>
                        <div>
                          <div className={w.title}>{item.title}</div>
                          <div className={w.meta}>{item.year} · {item.genre} · {item.duration}</div>
                          {item.progress && (
                            <div style={{ marginTop: 5, height: 3, width: 120, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${item.progress}%`, background: "#CE1126", borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                        <div className={w.right}>
                          <span className={mergeClasses(w.badge, w.badgeGray)}>{item.resolution}</span>
                          <a href={`/player/${item.filmId}`} className={w.play}>
                            <IconPlay size={10} /> Play
                          </a>
                          <button className={w.remove} onClick={() => setRemoved((s) => new Set([...s, item.id]))}>
                            <IconClose size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className={w.sectionHead}>Up Next</div>
              <div className={w.items}>
                {queued.map((item) => (
                  <div key={item.id} className={w.item}>
                    <div className={w.thumb} style={{ background: "#1C1C1C" }}>
                      <IconFilm size={16} style={{ color: "rgba(255,255,255,0.2)" }} />
                    </div>
                    <div>
                      <div className={w.title}>{item.title}</div>
                      <div className={w.meta}>{item.year} · {item.genre} · {item.duration}</div>
                      {item.notes && (
                        <div style={{ fontSize: 10, color: "#3E3E3E", marginTop: 2, fontStyle: "italic" }}>
                          {item.notes}
                        </div>
                      )}
                    </div>
                    <div className={w.right}>
                      <span className={mergeClasses(w.badge, w.badgeGray)}>{item.resolution}</span>
                      <a href={`/player/${item.filmId}`} className={w.play}>
                        <IconPlay size={10} /> Play
                      </a>
                      <button className={w.remove} onClick={() => setRemoved((s) => new Set([...s, item.id]))}>
                        <IconClose size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {visible.length === 0 && (
                <div className={w.emptyState}>
                  <div className={w.emptyIcon} style={{ color: "#3E3E3E" }}>
                    <IconSearch size={36} />
                  </div>
                  <div className={w.emptyTitle}>Your watchlist is empty</div>
                  <div className={w.emptySub}>Search for titles on the right to add them</div>
                </div>
              )}
            </div>

            <div className={w.addPanel}>
              <div className={w.addPanelHead}>
                <div className={w.addPanelTitle}>Add to Watchlist</div>
                <div className={w.searchWrap}>
                  <span className={w.searchIcon}><IconSearch size={13} /></span>
                  <input
                    className={w.searchInput}
                    type="text"
                    placeholder="Search your library…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className={w.addPanelBody}>
                {searchResults.length > 0 ? (
                  searchResults.map((film) => (
                    <div key={film.id} className={w.searchResItem}>
                      <div className={w.searchResThumb} style={{ background: film.gradient }}>
                        <IconFilm size={14} style={{ color: "rgba(255,255,255,0.2)" }} />
                      </div>
                      <div>
                        <div className={w.searchResTitle}>{film.title}</div>
                        <div className={w.searchResMeta}>
                          {film.year} · {film.genre}
                          {film.matched && <span className={w.onDisk}> · On disk</span>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "#3E3E3E", padding: "8px 0", textAlign: "center" }}>
                    {search.trim() ? "No matching titles" : "Start typing to search…"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
    </DevThrowTarget>
  );
};
