import { type FC, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

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

  const setActive = (id: SectionId): void => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        overflow: "hidden",
      }}
    >
      <nav
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--bg-1)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          SETTINGS
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            style={{
              padding: "9px 12px",
              border: 0,
              background:
                active === s.id ? "var(--green-soft)" : "transparent",
              color:
                active === s.id ? "var(--green)" : "var(--text-dim)",
              fontSize: 12,
              textAlign: "left",
              borderRadius: 2,
              borderLeft:
                active === s.id
                  ? "2px solid var(--green)"
                  : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div style={{ overflow: "auto", padding: "32px 40px" }}>
        <div className="eyebrow" style={{ color: "var(--green)" }}>
          · {active.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: "var(--font-head)",
            fontSize: 40,
            color: "var(--text)",
            marginTop: 12,
            marginBottom: 24,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
          }}
        >
          {SECTIONS.find((s) => s.id === active)?.label}
        </div>
        <div style={{ maxWidth: 640 }}>
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
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      gap: 16,
      paddingTop: 14,
      paddingBottom: 14,
      borderBottom: "1px solid var(--border-soft)",
    }}
  >
    <div>
      <div style={{ fontSize: 13, color: "var(--text)" }}>{label}</div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
    {control}
  </div>
);

const Toggle: FC<{ on?: boolean }> = ({ on = true }) => (
  <span
    aria-checked={on}
    role="switch"
    style={{
      width: 38,
      height: 20,
      background: on ? "var(--green)" : "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 999,
      position: "relative",
      cursor: "pointer",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 2,
        left: on ? 20 : 2,
        width: 14,
        height: 14,
        borderRadius: 999,
        background: on ? "var(--green-ink)" : "var(--text-dim)",
        transition: "left 0.15s",
      }}
    />
  </span>
);

const Selector: FC<{ value: string }> = ({ value }) => (
  <span
    style={{
      padding: "6px 12px",
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 2,
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--text)",
      letterSpacing: "0.08em",
    }}
  >
    {value} ▾
  </span>
);

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
          control={
            <button
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--red)",
                color: "var(--red)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          }
        />
        <SettingsRow
          label="Delete account"
          hint="Removes your settings and watchlist. Files on disk are untouched."
          control={
            <button
              style={{
                padding: "8px 14px",
                background: "var(--red)",
                color: "#fff",
                border: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                borderRadius: 2,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Delete
            </button>
          }
        />
      </div>
    ),
  },
];