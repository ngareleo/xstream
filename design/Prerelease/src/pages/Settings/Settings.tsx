import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { useSimulatedLoad } from "../../hooks/useSimulatedLoad.js";
import { usePageLoading } from "../../components/LoadingBar/LoadingBarContext.js";
import { DevThrowTarget } from "../../components/DevTools/DevToolsContext.js";
import {
  IconCog,
  IconFolder,
  IconPlay,
  IconSearch,
  IconUser,
  IconWarning,
} from "../../lib/icons.js";
import { useSettingsStyles } from "./Settings.styles.js";

type SettingsSection = "general" | "library" | "playback" | "metadata" | "account" | "danger";

interface Toggle {
  id: string;
  on: boolean;
}

const VALID_SECTIONS: SettingsSection[] = ["general", "library", "playback", "metadata", "account", "danger"];

export const Settings: FC = () => {
  const loading = useSimulatedLoad();
  usePageLoading(loading);
  const [searchParams] = useSearchParams();
  const paramSection = searchParams.get("section") as SettingsSection | null;
  const initialSection: SettingsSection =
    paramSection && VALID_SECTIONS.includes(paramSection) ? paramSection : "general";
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    hardwareAccel: true,
    autoPlay: false,
    notifications: true,
    analytics: false,
  });

  const flip = (key: string) => setToggles((t) => ({ ...t, [key]: !t[key] }));

  const s = useSettingsStyles();

  const Toggle: FC<{ id: string }> = ({ id }) => (
    <div
      className={mergeClasses(s.toggle, toggles[id] && s.toggleOn)}
      onClick={() => flip(id)}
    >
      <div className={mergeClasses(s.toggleThumb, toggles[id] && s.toggleThumbOn)} />
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
    <DevThrowTarget id="Settings">
      <>
      <AppHeader collapsed={false}>
        <span className={s.topbarTitle}>Settings</span>
      </AppHeader>

      <div className="main">
        <div className={s.content}>
          <div className={s.layout}>
            {/* Settings nav */}
            <div className={s.nav}>
              {navItems.map(({ id, icon: Icon, label, danger }) => (
                <div
                  key={id}
                  className={mergeClasses(s.navItem, section === id && s.navItemActive)}
                  onClick={() => setSection(id)}
                  style={danger ? { color: "rgba(206,17,38,0.8)" } : undefined}
                >
                  <Icon size={13} />
                  {label}
                </div>
              ))}
            </div>

            {/* Content panels */}
            <div className={s.panels}>
              {section === "general" && (
                <>
                  <div className={s.block}>
                    <div className={s.blockHead}>
                      <div className={s.blockTitle}>Appearance</div>
                      <div className={s.blockDesc}>Visual preferences for the application</div>
                    </div>
                    <div className={s.row}>
                      <div>
                        <div className={s.sLabel}>Theme</div>
                        <div className={s.sHint}>Controls the overall color scheme</div>
                      </div>
                      <select className={s.sSelect}>
                        <option>Dark (default)</option>
                        <option>OLED Black</option>
                      </select>
                    </div>
                    <div className={mergeClasses(s.row, s.rowLast)}>
                      <div>
                        <div className={s.sLabel}>Language</div>
                        <div className={s.sHint}>Interface language</div>
                      </div>
                      <select className={s.sSelect}>
                        <option>English</option>
                        <option>Swahili</option>
                      </select>
                    </div>
                  </div>
                  <div className={s.block}>
                    <div className={s.blockHead}>
                      <div className={s.blockTitle}>Notifications</div>
                    </div>
                    <div className={s.row}>
                      <div>
                        <div className={s.sLabel}>Scan Notifications</div>
                        <div className={s.sHint}>Alert when library scan completes</div>
                      </div>
                      <Toggle id="notifications" />
                    </div>
                    <div className={mergeClasses(s.row, s.rowLast)}>
                      <div>
                        <div className={s.sLabel}>Usage Analytics</div>
                        <div className={s.sHint}>Send anonymous usage data to improve Moran</div>
                      </div>
                      <Toggle id="analytics" />
                    </div>
                  </div>
                </>
              )}

              {section === "library" && (
                <div className={s.block}>
                  <div className={s.blockHead}>
                    <div className={s.blockTitle}>Library Settings</div>
                    <div className={s.blockDesc}>Scanning and indexing preferences</div>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Scan Interval</div>
                      <div className={s.sHint}>How often to auto-rescan libraries</div>
                    </div>
                    <select className={s.sSelect}>
                      <option>Every 30 seconds</option>
                      <option>Every minute</option>
                      <option>Every 5 minutes</option>
                      <option>Manual only</option>
                    </select>
                  </div>
                  <div className={mergeClasses(s.row, s.rowLast)}>
                    <div>
                      <div className={s.sLabel}>Recursive Scan</div>
                      <div className={s.sHint}>Scan all subdirectories automatically</div>
                    </div>
                    <Toggle id="hardwareAccel" />
                  </div>
                </div>
              )}

              {section === "playback" && (
                <div className={s.block}>
                  <div className={s.blockHead}>
                    <div className={s.blockTitle}>Playback Settings</div>
                    <div className={s.blockDesc}>Video player preferences</div>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Default Resolution</div>
                      <div className={s.sHint}>Preferred streaming quality</div>
                    </div>
                    <select className={s.sSelect}>
                      <option>4K (2160p)</option>
                      <option>1080p</option>
                      <option>720p</option>
                      <option>Auto</option>
                    </select>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Hardware Acceleration</div>
                      <div className={s.sHint}>Use GPU decoding when available</div>
                    </div>
                    <Toggle id="hardwareAccel" />
                  </div>
                  <div className={mergeClasses(s.row, s.rowLast)}>
                    <div>
                      <div className={s.sLabel}>Auto-Play Next</div>
                      <div className={s.sHint}>Automatically start the next episode</div>
                    </div>
                    <Toggle id="autoPlay" />
                  </div>
                </div>
              )}

              {section === "metadata" && (
                <div className={s.block}>
                  <div className={s.blockHead}>
                    <div className={s.blockTitle}>Metadata</div>
                    <div className={s.blockDesc}>Configure metadata sources and matching</div>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Metadata Source</div>
                      <div className={s.sHint}>Primary source for film information</div>
                    </div>
                    <select className={s.sSelect}>
                      <option>TMDb</option>
                      <option>IMDb</option>
                      <option>TheTVDB</option>
                    </select>
                  </div>
                  <div className={mergeClasses(s.row, s.rowLast)}>
                    <div>
                      <div className={s.sLabel}>Match Language</div>
                      <div className={s.sHint}>Preferred language for metadata</div>
                    </div>
                    <select className={s.sSelect}>
                      <option>English</option>
                      <option>Swahili</option>
                    </select>
                  </div>
                </div>
              )}

              {section === "account" && (
                <div className={s.block}>
                  <div className={s.blockHead}>
                    <div className={s.blockTitle}>Account</div>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Username</div>
                      <div className={s.sHint}>Your display name</div>
                    </div>
                    <input className={s.formInput} defaultValue="ngareleo" style={{ width: 160 }} />
                  </div>
                  <div className={mergeClasses(s.row, s.rowLast)}>
                    <div>
                      <div className={s.sLabel}>Email</div>
                    </div>
                    <input className={s.formInput} defaultValue="ngareleo@example.com" style={{ width: 220 }} />
                  </div>
                </div>
              )}

              {section === "danger" && (
                <div className={s.block} style={{ borderColor: "rgba(206,17,38,0.25)" }}>
                  <div className={s.blockHead} style={{ borderColor: "rgba(206,17,38,0.15)" }}>
                    <div className={s.blockTitle} style={{ color: "rgba(206,17,38,0.9)" }}>Danger Zone</div>
                    <div className={s.blockDesc}>These actions are irreversible</div>
                  </div>
                  <div className={s.row}>
                    <div>
                      <div className={s.sLabel}>Clear Transcode Cache</div>
                      <div className={s.sHint}>Removes all cached video segments from disk</div>
                    </div>
                    <button className={s.btnDanger}>Clear Cache</button>
                  </div>
                  <div className={mergeClasses(s.row, s.rowLast)}>
                    <div>
                      <div className={s.sLabel}>Reset Database</div>
                      <div className={s.sHint}>Drops all library data — requires re-scan</div>
                    </div>
                    <button className={s.btnDanger}>Reset DB</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
    </DevThrowTarget>
  );
};
