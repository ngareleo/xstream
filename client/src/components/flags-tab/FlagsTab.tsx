import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { useSettingsTabStyles } from "~/components/settings-tabs/SettingsTabs.styles.js";
import {
  FLAG_REGISTRY,
  type FlagCategory,
  type FlagDescriptor,
  type FlagValue,
} from "~/config/flagRegistry.js";
import { useFeatureFlag } from "~/contexts/FeatureFlagsContext.js";

import { strings } from "./FlagsTab.strings.js";
import { useFlagsTabStyles } from "./FlagsTab.styles.js";

const CATEGORY_ORDER: FlagCategory[] = ["playback", "telemetry", "ui", "experimental"];

const CATEGORY_LABEL: Record<FlagCategory, string> = {
  playback: strings.categoryPlayback,
  telemetry: strings.categoryTelemetry,
  ui: strings.categoryUi,
  experimental: strings.categoryExperimental,
};

export const FlagsTab: FC = () => {
  const settingsStyles = useSettingsTabStyles();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    flags: FLAG_REGISTRY.filter((f) => f.category === cat),
  })).filter((g) => g.flags.length > 0);

  return (
    <div className={settingsStyles.section}>
      <div className={settingsStyles.sectionTitle}>{strings.sectionTitle}</div>
      <div className={settingsStyles.sectionDesc}>{strings.sectionDesc}</div>

      {grouped.map(({ category, flags }) => (
        <FlagCategorySection key={category} category={category} flags={flags} />
      ))}
    </div>
  );
};

const FlagCategorySection: FC<{ category: FlagCategory; flags: readonly FlagDescriptor[] }> = ({
  category,
  flags,
}) => {
  const styles = useFlagsTabStyles();
  return (
    <div className={styles.categoryBlock}>
      <div className={styles.categoryHeader}>{CATEGORY_LABEL[category]}</div>
      {flags.map((flag) => (
        <FlagRow key={flag.key} flag={flag} />
      ))}
    </div>
  );
};

const FlagRow: FC<{ flag: FlagDescriptor }> = ({ flag }) => {
  const styles = useFlagsTabStyles();
  const { value, setValue } = useFeatureFlag<FlagValue>(flag.key, flag.defaultValue);
  const isDefault = value === flag.defaultValue;

  return (
    <div className={styles.flagRow}>
      <div className={styles.flagMeta}>
        <div className={styles.flagName}>
          {flag.name}
          {isDefault && <span className={styles.defaultHint}>{strings.defaultHint}</span>}
        </div>
        <div className={styles.flagDesc}>{flag.description}</div>
      </div>
      <div className={styles.flagControl}>
        {flag.valueType === "boolean" ? (
          <BooleanToggle value={value as boolean} onChange={(v) => setValue(v)} />
        ) : (
          <NumberInput
            value={value as number}
            min={flag.min}
            max={flag.max}
            step={flag.step}
            onChange={(v) => setValue(v)}
          />
        )}
      </div>
    </div>
  );
};

const BooleanToggle: FC<{ value: boolean; onChange: (v: boolean) => void }> = ({
  value,
  onChange,
}) => {
  const styles = useFlagsTabStyles();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={mergeClasses(styles.toggle, value && styles.toggleOn)}
      onClick={() => onChange(!value)}
    >
      <span className={mergeClasses(styles.toggleThumb, value && styles.toggleThumbOn)} />
    </button>
  );
};

const NumberInput: FC<{
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ value, min, max, step, onChange }) => {
  const styles = useFlagsTabStyles();
  return (
    <input
      type="number"
      className={styles.numberInput}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
};
