import { type FC, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { useSettingsStyles } from "./Settings.styles.js";

type SectionId = "general" | "library" | "playback" | "metadata" | "account" | "danger";

interface SectionDef {
  id: SectionId;
  label: string;
  body: ReactNode;
}

const VALID_SECTIONS = new Set<SectionId>([
  "general",
  "library",
  "playback",
  "metadata",
  "account",
  "danger",
]);

export const Settings: FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") as SectionId | null;
  const active: SectionId =
    requested && VALID_SECTIONS.has(requested) ? requested : "general";
  const styles = useSettingsStyles();

  const setActive = (id: SectionId): void => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next);
  };

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <div className={mergeClasses("eyebrow", styles.navHeading)}>
          SETTINGS
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={mergeClasses(
              styles.navItem,
              active === s.id && styles.navItemActive,
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className={styles.body}>
        <div className={mergeClasses("eyebrow", styles.sectionEyebrow)}>
          · {active.toUpperCase()}
        </div>
        <div className={styles.sectionTitle}>
          {SECTIONS.find((s) => s.id === active)?.label}
        </div>
        <div className={styles.sectionWrap}>
          {SECTIONS.find((s) => s.id === active)?.body}
        </div>
      </div>
    </div>
  );
};

const SettingsRow: FC<{ label: string; hint?: string; control: ReactNode }> = ({
  label,
  hint,
  control,
}) => {
  const styles = useSettingsStyles();
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.rowHint}>{hint}</div>}
      </div>
      {control}
    </div>
  );
};

const Toggle: FC<{ on?: boolean }> = ({ on = true }) => {
  const styles = useSettingsStyles();
  return (
    <span
      aria-checked={on}
      role="switch"
      className={mergeClasses(styles.toggle, on && styles.toggleOn)}
    >
      <span
        className={mergeClasses(styles.toggleKnob, on && styles.toggleKnobOn)}
      />
    </span>
  );
};

const Selector: FC<{ value: string }> = ({ value }) => {
  const styles = useSettingsStyles();
  return <span className={styles.selector}>{value} ▾</span>;
};

const DangerOutlineBtn: FC<{ children: ReactNode }> = ({ children }) => {
  const styles = useSettingsStyles();
  return <button className={styles.dangerOutlineBtn}>{children}</button>;
};

const DangerSolidBtn: FC<{ children: ReactNode }> = ({ children }) => {
  const styles = useSettingsStyles();
  return <button className={styles.dangerSolidBtn}>{children}</button>;
};

const SECTIONS: SectionDef[] = [
  {
    id: "general",
    label: "General",
    body: (
      <>
        <SettingsRow label="Theme" hint="Display tone for the player chrome." control={<Selector value="DARK" />} />
        <SettingsRow label="Language" hint="UI strings + metadata language." control={<Selector value="ENGLISH (US)" />} />
        <SettingsRow label="Show developer pane" control={<Toggle on={false} />} />
      </>
    ),
  },
  {
    id: "library",
    label: "Library",
    body: (
      <>
        <SettingsRow label="Auto-rescan on launch" control={<Toggle />} />
        <SettingsRow label="Watch directories for changes" control={<Toggle />} />
        <SettingsRow label="OMDb API key" hint="Required for poster + metadata fetches." control={<Selector value="●●●● ●●● 7c2a" />} />
      </>
    ),
  },
  {
    id: "playback",
    label: "Playback",
    body: (
      <>
        <SettingsRow label="Default resolution" hint="Match source · or downscale to save bandwidth." control={<Selector value="MATCH SOURCE" />} />
        <SettingsRow label="HDR tone-mapping" hint="Use display capabilities to render HDR or Dolby Vision sources." control={<Toggle />} />
        <SettingsRow label="Hardware acceleration" control={<Selector value="VAAPI" />} />
      </>
    ),
  },
  {
    id: "metadata",
    label: "Metadata",
    body: (
      <>
        <SettingsRow label="Auto-link unmatched files" control={<Toggle />} />
        <SettingsRow label="Use IMDb ratings" control={<Toggle />} />
      </>
    ),
  },
  {
    id: "account",
    label: "Account",
    body: (
      <>
        <SettingsRow label="Display name" control={<Selector value="ngareleo" />} />
        <SettingsRow label="Email" control={<Selector value="ngareleo@example.com" />} />
        <SettingsRow label="Sign out of all devices" control={<Toggle on={false} />} />
      </>
    ),
  },
  {
    id: "danger",
    label: "Danger zone",
    body: (
      <div>
        <SettingsRow
          label="Reset library cache"
          hint="Discards every poster + match. Re-scans from scratch."
          control={<DangerOutlineBtn>Reset</DangerOutlineBtn>}
        />
        <SettingsRow
          label="Delete account"
          hint="Removes your settings and watchlist. Files on disk are untouched."
          control={<DangerSolidBtn>Delete</DangerSolidBtn>}
        />
      </div>
    ),
  },
];
