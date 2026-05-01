import { type FC, type ReactNode } from "react";
import { mergeClasses } from "@griffel/react";
import { LOGOS, LogoCard, Logo02 } from "../../components/Logo/index.js";
import { useDesignSystemStyles } from "./DesignSystem.styles.js";

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
  const styles = useDesignSystemStyles();
  return (
    <div className={styles.shell}>
      <div className={mergeClasses("eyebrow", styles.eyebrow)}>
        DESIGN SYSTEM · /design-system
      </div>
      <div className={styles.hero}>Xstream — visual language.</div>
      <div className={styles.intro}>
        Token map, type scale, spacing, and seven candidate logos for the
        post-Moran identity. Pick a logo and update <code>Logo02</code> in{" "}
        <code>components/Logo/index.tsx</code> + the AppHeader brand glyph
        once you are ready to standardize.
      </div>

      <Section label="T-01" title="Color tokens">
        <div className={styles.tokenGrid}>
          {COLORS.map(([name, value, code, usage]) => (
            <div key={name} className={styles.tokenCard}>
              <div className={styles.swatch} style={{ background: value }} />
              <div className={styles.tokenInfo}>
                <div className={styles.tokenName}>{name}</div>
                <div className={styles.tokenCode} title={code}>
                  {code}
                </div>
                <div className={styles.tokenUsage}>{usage}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="T-02" title="Type scale">
        <div className={styles.typeStack}>
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
        <div className={styles.spacingStack}>
          {SPACING.map((sp) => (
            <div key={sp} className={styles.spacingRow}>
              <div className={styles.spacingBar} style={{ width: sp }} />
              <div className={styles.spacingLabel}>
                {sp}px · space{SPACING.indexOf(sp) + 1}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="L · 1–7" title="Logo candidates">
        <div className={styles.logoIntro}>
          Seven explorations. Logo02 (stacked-X monogram) is the default mark
          used in the AppHeader and app-icon mockup below — change the import
          in <code>components/AppHeader/AppHeader.tsx</code> to switch.
        </div>
        <div className={styles.logoGrid}>
          {LOGOS.map((entry) => (
            <LogoCard
              key={entry.code}
              entry={entry}
              highlighted={entry.code === "MK-02"}
            />
          ))}
        </div>
      </Section>

      <Section label="C-01" title="App icon — Logo02 mark, three sizes">
        <div className={mergeClasses(styles.contextFrame, styles.iconRow)}>
          {[64, 96, 128].map((s) => (
            <div
              key={s}
              className={styles.iconTile}
              style={{ width: s, height: s, borderRadius: s * 0.22 }}
            >
              <Logo02 size={s * 0.55} showWordmark={false} />
            </div>
          ))}
        </div>
      </Section>

      <Section label="C-02" title="Header lockup">
        <div className={mergeClasses(styles.contextFrame, styles.headerLockup)}>
          <div className={styles.brand}>
            <span className={styles.brandX}>X</span>
            <span className={styles.brandWord}>stream</span>
          </div>
          <div className={styles.navList}>
            <span>Profiles</span>
            <span>Library</span>
            <span>Settings</span>
          </div>
        </div>
      </Section>

      <Section label="C-03" title="Brand swatches">
        <div className={mergeClasses(styles.contextFrame, styles.swatchPanel)}>
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
              <div className={styles.swatchTile} style={{ background: c }} />
              <div className={styles.swatchName}>{name}</div>
              <div className={styles.swatchCode}>{code}</div>
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
}) => {
  const styles = useDesignSystemStyles();
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionTitle}>{title}</span>
      </div>
      {children}
    </section>
  );
};

// Type scale samples carry runtime-driven font + size + line-height combos that
// would explode the Griffel rule count if precomputed for every size; the static
// hint label uses styles.typeHint, the dynamic sample row stays inline.
const Type: FC<{
  sample: string;
  hint: string;
  size: number;
  font: "head" | "body" | "mono";
  uppercase?: boolean;
}> = ({ sample, hint, size, font, uppercase }) => {
  const styles = useDesignSystemStyles();
  return (
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
      <div className={styles.typeHint}>{hint}</div>
    </div>
  );
};
