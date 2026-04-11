import { type FC, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import {
  IconCog,
  IconFolder,
  IconPlay,
  IconSearch,
  IconUser,
  IconWarning,
} from "../../lib/icons.js";
import "./Settings.css";

type SettingsSection = "general" | "library" | "playback" | "metadata" | "account" | "danger";

interface Toggle {
  id: string;
  on: boolean;
}

export const Settings: FC = () => {
  const [section, setSection] = useState<SettingsSection>("general");
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    hardwareAccel: true,
    autoPlay: false,
    notifications: true,
    analytics: false,
  });

  const flip = (key: string) => setToggles((t) => ({ ...t, [key]: !t[key] }));

  const Toggle: FC<{ id: string }> = ({ id }) => (
    <div
      className={`toggle${toggles[id] ? " on" : ""}`}
      onClick={() => flip(id)}
    >
      <div className="toggle-thumb" />
    </div>
  );

  const navItems: { id: SettingsSection; icon: FC<{ size?: number }>; label: string; danger?: boolean }[] = [
    { id: "general", icon: IconCog, label: "General" },
    { id: "library", icon: IconFolder, label: "Library" },
    { id: "playback", icon: IconPlay, label: "Playback" },
    { id: "metadata", icon: IconSearch, label: "Metadata" },
    { id: "account", icon: IconUser, label: "Account" },
    { id: "danger", icon: IconWarning, label: "Danger Zone", danger: true },
  ];

  return (
    <>
      <AppHeader collapsed={false}>
        <span className="topbar-title">Settings</span>
      </AppHeader>

      <div className="main">
        <div className="content">
          <div className="settings-layout">
            {/* Settings nav */}
            <div className="settings-nav">
              {navItems.map(({ id, icon: Icon, label, danger }) => (
                <div
                  key={id}
                  className={`s-nav-item${section === id ? " active" : ""}${danger ? " danger" : ""}`}
                  onClick={() => setSection(id)}
                  style={danger ? { color: "rgba(206,17,38,0.8)" } : undefined}
                >
                  <Icon size={13} />
                  {label}
                </div>
              ))}
            </div>

            {/* Content panels */}
            <div className="settings-panels">
              {section === "general" && (
                <>
                  <div className="setting-block">
                    <div className="setting-block-head">
                      <div className="setting-block-title">Appearance</div>
                      <div className="setting-block-desc">Visual preferences for the application</div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Theme</div>
                        <div className="s-hint">Controls the overall color scheme</div>
                      </div>
                      <select className="s-select">
                        <option>Dark (default)</option>
                        <option>OLED Black</option>
                      </select>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Language</div>
                        <div className="s-hint">Interface language</div>
                      </div>
                      <select className="s-select">
                        <option>English</option>
                        <option>Swahili</option>
                      </select>
                    </div>
                  </div>
                  <div className="setting-block">
                    <div className="setting-block-head">
                      <div className="setting-block-title">Notifications</div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Scan Notifications</div>
                        <div className="s-hint">Alert when library scan completes</div>
                      </div>
                      <Toggle id="notifications" />
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Usage Analytics</div>
                        <div className="s-hint">Send anonymous usage data to improve Moran</div>
                      </div>
                      <Toggle id="analytics" />
                    </div>
                  </div>
                </>
              )}

              {section === "library" && (
                <div className="setting-block">
                  <div className="setting-block-head">
                    <div className="setting-block-title">Library Settings</div>
                    <div className="setting-block-desc">Scanning and indexing preferences</div>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Scan Interval</div>
                      <div className="s-hint">How often to auto-rescan libraries</div>
                    </div>
                    <select className="s-select">
                      <option>Every 30 seconds</option>
                      <option>Every minute</option>
                      <option>Every 5 minutes</option>
                      <option>Manual only</option>
                    </select>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Recursive Scan</div>
                      <div className="s-hint">Scan all subdirectories automatically</div>
                    </div>
                    <Toggle id="hardwareAccel" />
                  </div>
                </div>
              )}

              {section === "playback" && (
                <div className="setting-block">
                  <div className="setting-block-head">
                    <div className="setting-block-title">Playback Settings</div>
                    <div className="setting-block-desc">Video player preferences</div>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Default Resolution</div>
                      <div className="s-hint">Preferred streaming quality</div>
                    </div>
                    <select className="s-select">
                      <option>4K (2160p)</option>
                      <option>1080p</option>
                      <option>720p</option>
                      <option>Auto</option>
                    </select>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Hardware Acceleration</div>
                      <div className="s-hint">Use GPU decoding when available</div>
                    </div>
                    <Toggle id="hardwareAccel" />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Auto-Play Next</div>
                      <div className="s-hint">Automatically start the next episode</div>
                    </div>
                    <Toggle id="autoPlay" />
                  </div>
                </div>
              )}

              {section === "metadata" && (
                <div className="setting-block">
                  <div className="setting-block-head">
                    <div className="setting-block-title">Metadata</div>
                    <div className="setting-block-desc">Configure metadata sources and matching</div>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Metadata Source</div>
                      <div className="s-hint">Primary source for film information</div>
                    </div>
                    <select className="s-select">
                      <option>TMDb</option>
                      <option>IMDb</option>
                      <option>TheTVDB</option>
                    </select>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Match Language</div>
                      <div className="s-hint">Preferred language for metadata</div>
                    </div>
                    <select className="s-select">
                      <option>English</option>
                      <option>Swahili</option>
                    </select>
                  </div>
                </div>
              )}

              {section === "account" && (
                <div className="setting-block">
                  <div className="setting-block-head">
                    <div className="setting-block-title">Account</div>
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Username</div>
                      <div className="s-hint">Your display name</div>
                    </div>
                    <input className="form-input" defaultValue="ngareleo" style={{ width: 160, fontSize: 12, padding: "6px 10px" }} />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="s-label">Email</div>
                    </div>
                    <input className="form-input" defaultValue="ngareleo@example.com" style={{ width: 220, fontSize: 12, padding: "6px 10px" }} />
                  </div>
                </div>
              )}

              {section === "danger" && (
                <>
                  <div className="setting-block" style={{ borderColor: "rgba(206,17,38,0.25)" }}>
                    <div className="setting-block-head" style={{ borderColor: "rgba(206,17,38,0.15)" }}>
                      <div className="setting-block-title" style={{ color: "rgba(206,17,38,0.9)" }}>Danger Zone</div>
                      <div className="setting-block-desc">These actions are irreversible</div>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Clear Transcode Cache</div>
                        <div className="s-hint">Removes all cached video segments from disk</div>
                      </div>
                      <button className="btn btn-danger btn-sm">Clear Cache</button>
                    </div>
                    <div className="setting-row">
                      <div>
                        <div className="s-label">Reset Database</div>
                        <div className="s-hint">Drops all library data — requires re-scan</div>
                      </div>
                      <button className="btn btn-danger btn-sm">Reset DB</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
