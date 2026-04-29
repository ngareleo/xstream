import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";

import { useSettingsTabStyles } from "~/components/settings-tabs/SettingsTabs.styles.js";
import {
  FLAG_REGISTRY,
  type FlagCategory,
  type FlagDescriptor,
  type FlagValue,
} from "~/config/flagRegistry.js";
import { useFeatureFlag, useFeatureFlagControls } from "~/contexts/FeatureFlagsContext.js";

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

      <FlagBulkActions />
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

const FlagBulkActions: FC = () => {
  const styles = useFlagsTabStyles();
  const { clearLocalOverrides, resetAllToDefaults } = useFeatureFlagControls();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  return (
    <div className={styles.actionsBlock}>
      <div className={styles.actionsHeader}>{strings.actionsTitle}</div>
      <div className={styles.actionsDesc}>{strings.actionsDesc}</div>

      <div className={styles.actionRow}>
        <div className={styles.actionLabel}>
          <div className={styles.actionName}>{strings.clearLocalOverrides}</div>
          <div className={styles.actionHint}>{strings.clearLocalOverridesHint}</div>
        </div>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            clearLocalOverrides();
            setStatusMessage(strings.clearedToast);
          }}
        >
          {strings.clearLocalOverrides}
        </button>
      </div>

      <div className={styles.actionRow}>
        <div className={styles.actionLabel}>
          <div className={styles.actionName}>{strings.resetAllToDefaults}</div>
          <div className={styles.actionHint}>{strings.resetAllToDefaultsHint}</div>
        </div>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            resetAllToDefaults();
            setStatusMessage(null);
          }}
        >
          {strings.resetAllToDefaults}
        </button>
      </div>

      {statusMessage !== null && <div className={styles.actionHint}>{statusMessage}</div>}
    </div>
  );
};
