import { type FC, type ReactNode } from "react";
import { LOGOS, LogoCard, Logo02 } from "../../components/Logo/index.js";

const COLORS: Array<[string, string, string, string]> = [
  ["bg-0", "var(--bg-0)", "#050706", "App ink"],
  ["bg-1", "var(--bg-1)", "#0a0d0c", "Header / sidebar"],
  ["surface", "var(--surface)", "#14181a", "Panels"],
  ["surface-2", "var(--surface-2)", "#1a1f1c", "Cards / inputs"],
  ["border", "var(--border)", "#25302a", "Dividers"],
  ["green", "var(--green)", "oklch(0.78 0.20 150)", "Primary accent"],
  ["green-deep", "var(--green-deep)", "oklch(0.45 0.13 150)", "Hover"],
  ["text", "var(--text)", "#e8eee8", "Foreground"],
  ["text-dim", "var(--text-dim)", "#9aa6a0", "Body"],
  ["text-muted", "var(--text-muted)", "#6a766f", "Secondary"],
  ["text-faint", "var(--text-faint)", "#46504b", "Eyebrow"],
  ["yellow", "var(--yellow)", "#f5c518", "IMDb / warn"],
];

const SPACING = [4, 8, 12, 16, 24, 32];

export const DesignSystem: FC = () => {
  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "32px 40px 80px",
      }}
    >
      <div className="eyebrow" style={{ color: "var(--green)" }}>
        DESIGN SYSTEM · /design-system
      </div>
      <div
        style={{
          fontFamily: "var(--font-head)",
          fontSize: 56,
          lineHeight: 0.92,
          letterSpacing: "-0.01em",
          color: "var(--text)",
          marginTop: 12,
          marginBottom: 8,
        }}
      >
        Xstream — visual language.
      </div>
      <div style={{ color: "var(--text-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        Token map, type scale, spacing, and seven candidate logos for the
        post-Moran identity. Pick a logo and update <code>Logo02</code> in{" "}
        <code>components/Logo/index.tsx</code> + the AppHeader brand glyph
        once you are ready to standardize.
      </div>

      {/* ============== Tokens ============== */}
      <Section label="T-01" title="Color tokens">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {COLORS.map(([name, value, code, usage]) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 10,
                border: "1px solid var(--border-soft)",
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: value,
                  border: "1px solid var(--border)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text)" }}>{name}</div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={code}
                >
                  {code}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-faint)",
                    marginTop: 2,
                  }}
                >
                  {usage}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="T-02" title="Type scale">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Type sample="Anton 56" hint="DISPLAY · HERO" size={56} font="head" />
          <Type sample="Anton 32" hint="TITLE" size={32} font="head" />
          <Type
            sample="Inter 14 — body text, table rows, chip labels"
            hint="BODY · UI"
            size={14}
            font="body"
          />
          <Type
            sample="JETBRAINS MONO 11"
            hint="EYEBROW · MONO"
            size={11}
            font="mono"
            uppercase
          />
        </div>
      </Section>

      <Section label="T-03" title="Spacing scale">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SPACING.map((sp) => (
            <div
              key={sp}
              style={{ display: "flex", alignItems: "center", gap: 14 }}
            >
              <div
                style={{
                  width: sp,
                  height: 18,
                  background: "var(--green)",
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                {sp}px · space{SPACING.indexOf(sp) + 1}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============== Logos ============== */}
      <Section label="L · 1–7" title="Logo candidates">
        <div style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 13 }}>
          Seven explorations. Logo02 (stacked-X monogram) is the default mark
          used in the AppHeader and app-icon mockup below — change the import
          in <code>components/AppHeader/AppHeader.tsx</code> to switch.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 18,
          }}
        >
          {LOGOS.map((entry) => (
            <LogoCard
              key={entry.code}
              entry={entry}
              highlighted={entry.code === "MK-02"}
            />
          ))}
        </div>
      </Section>

      {/* ============== Context frames ============== */}
      <Section label="C-01" title="App icon — Logo02 mark, three sizes">
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: 28,
            display: "flex",
            gap: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[64, 96, 128].map((s) => (
            <div
              key={s}
              style={{
                width: s,
                height: s,
                borderRadius: s * 0.22,
                background: "linear-gradient(160deg, #14181a, #050706)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 14px 30px -16px var(--green-glow)",
              }}
            >
              <Logo02 size={s * 0.55} showWordmark={false} />
            </div>
          ))}
        </div>
      </Section>

      <Section label="C-02" title="Header lockup">
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-head)",
              fontSize: 38,
              letterSpacing: "-0.03em",
              display: "flex",
              alignItems: "baseline",
            }}
          >
            <span style={{ color: "var(--green)" }}>X</span>
            <span style={{ color: "var(--text)" }}>stream</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 22,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text-dim)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span>Profiles</span>
            <span>Library</span>
            <span>Settings</span>
          </div>
        </div>
      </Section>

      <Section label="C-03" title="Brand swatches">
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 14,
          }}
        >
          {(
            [
              ["Ink", "var(--bg-0)", "#050706"],
              ["Surface", "var(--surface)", "#14181a"],
              ["Border", "var(--border)", "#25302a"],
              ["Green", "var(--green)", "oklch 0.78 0.20 150"],
              ["Text", "var(--text)", "#e8eee8"],
            ] as const
          ).map(([name, c, code]) => (
            <div key={name}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1.4/1",
                  background: c,
                  border: "1px solid var(--border)",
                  marginBottom: 8,
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>
                {name}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {code}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};

const Section: FC<{ label: string; title: string; children: ReactNode }> = ({
  label,
  title,
  children,
}) => (
  <section style={{ marginTop: 56 }}>
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        marginBottom: 18,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.22em",
          color: "var(--green)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-head)",
          fontSize: 24,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        {title}
      </span>
    </div>
    {children}
  </section>
);

const Type: FC<{
  sample: string;
  hint: string;
  size: number;
  font: "head" | "body" | "mono";
  uppercase?: boolean;
}> = ({ sample, hint, size, font, uppercase }) => (
  <div>
    <div
      style={{
        fontFamily: `var(--font-${font})`,
        fontSize: size,
        lineHeight: font === "head" ? 0.95 : 1.45,
        letterSpacing:
          font === "head"
            ? "-0.01em"
            : font === "mono"
              ? "0.18em"
              : undefined,
        textTransform: uppercase ? "uppercase" : undefined,
        color: "var(--text)",
      }}
    >
      {sample}
    </div>
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.12em",
        marginTop: 4,
      }}
    >
      {hint}
    </div>
  </div>
);
