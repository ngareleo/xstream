import { type FC, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { IconSearch, IconFilm, IconPlay, IconClose } from "../../lib/icons.js";
import { watchlist, films } from "../../data/mock.js";
import "./Watchlist.css";

export const Watchlist: FC = () => {
  const [search, setSearch] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const visible = watchlist.filter(
    (item) =>
      !removed.has(item.id) &&
      (!search.trim() || item.title.toLowerCase().includes(search.toLowerCase())),
  );

  const inProgress = visible.filter((i) => i.progress != null);
  const queued = visible.filter((i) => i.progress == null);

  const searchResults = search.trim()
    ? films.filter((f) => f.title?.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <>
      <AppHeader collapsed={false}>
        <span className="topbar-title">Watchlist</span>
        <span className="topbar-sep" />
        <span className="topbar-sub">{visible.length} titles</span>
      </AppHeader>

      <div className="main">
        <div className="content">
          <div className="wl-stats">
            <div>
              <div className="stat-num">{visible.length}</div>
              <div className="stat-label">Queued</div>
            </div>
            <div>
              <div className="stat-num green">{inProgress.length}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div>
              <div className="stat-num red">{watchlist.length - visible.length}</div>
              <div className="stat-label">Watched</div>
            </div>
          </div>

          <div className="wl-layout">
            <div>
              {inProgress.length > 0 && (
                <>
                  <div className="wl-section-head">Continue Watching</div>
                  <div className="wl-items">
                    {inProgress.map((item) => (
                      <div key={item.id} className="wl-item available">
                        <div className="wl-thumb" style={{ background: "var(--surface3)" }}>
                          <IconFilm size={16} style={{ color: "rgba(255,255,255,0.2)" }} />
                        </div>
                        <div>
                          <div className="wl-title">{item.title}</div>
                          <div className="wl-meta">{item.year} · {item.genre} · {item.duration}</div>
                          {item.progress && (
                            <div style={{ marginTop: 5, height: 3, width: 120, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${item.progress}%`, background: "var(--red)", borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                        <div className="wl-right">
                          <span className="badge badge-gray">{item.resolution}</span>
                          <a href={`/player/${item.filmId}`} className="wl-play">
                            <IconPlay size={10} /> Play
                          </a>
                          <button className="wl-remove" onClick={() => setRemoved((s) => new Set([...s, item.id]))}>
                            <IconClose size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="wl-section-head">Up Next</div>
              <div className="wl-items">
                {queued.map((item) => (
                  <div key={item.id} className="wl-item">
                    <div className="wl-thumb" style={{ background: "var(--surface3)" }}>
                      <IconFilm size={16} style={{ color: "rgba(255,255,255,0.2)" }} />
                    </div>
                    <div>
                      <div className="wl-title">{item.title}</div>
                      <div className="wl-meta">{item.year} · {item.genre} · {item.duration}</div>
                      {item.notes && (
                        <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2, fontStyle: "italic" }}>{item.notes}</div>
                      )}
                    </div>
                    <div className="wl-right">
                      <span className="badge badge-gray">{item.resolution}</span>
                      <a href={`/player/${item.filmId}`} className="wl-play">
                        <IconPlay size={10} /> Play
                      </a>
                      <button className="wl-remove" onClick={() => setRemoved((s) => new Set([...s, item.id]))}>
                        <IconClose size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {visible.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon" style={{ color: "var(--muted2)" }}>
                    <IconSearch size={36} />
                  </div>
                  <div className="empty-title">Your watchlist is empty</div>
                  <div className="empty-sub">Search for titles on the right to add them</div>
                </div>
              )}
            </div>

            {/* Add panel */}
            <div className="add-panel">
              <div className="add-panel-head">
                <div className="add-panel-title">Add to Watchlist</div>
                <div className="search-wrap">
                  <span className="search-icon"><IconSearch size={13} /></span>
                  <input
                    type="text"
                    placeholder="Search your library…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="add-panel-body">
                {searchResults.length > 0 ? (
                  searchResults.map((film) => (
                    <div key={film.id} className="search-res-item">
                      <div className="search-res-thumb" style={{ background: film.gradient }}>
                        <IconFilm size={14} style={{ color: "rgba(255,255,255,0.2)" }} />
                      </div>
                      <div>
                        <div className="search-res-title">{film.title}</div>
                        <div className="search-res-meta">
                          {film.year} · {film.genre}
                          {film.matched && <span className="on-disk"> · On disk</span>}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted2)", padding: "8px 0", textAlign: "center" }}>
                    {search.trim() ? "No matching titles" : "Start typing to search…"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
