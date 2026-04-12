import { type FC, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { MetadataTabSetKeyMutation } from "~/relay/__generated__/MetadataTabSetKeyMutation.graphql.js";

import { strings } from "./MetadataTab.strings.js";
import { useSettingsTabStyles } from "./SettingsTabs.styles.js";

const SET_SETTING_MUTATION = graphql`
  mutation MetadataTabSetKeyMutation($key: String!, $value: String!) {
    setSetting(key: $key, value: $value)
  }
`;

export const MetadataTab: FC = () => {
  const styles = useSettingsTabStyles();
  const [apiKey, setApiKey] = useState("");
  const [save, isPending] = useMutation<MetadataTabSetKeyMutation>(SET_SETTING_MUTATION);
  const [saved, setSaved] = useState(false);

  const handleSave = (): void => {
    setSaved(false);
    save({
      variables: { key: "omdbApiKey", value: apiKey },
      onCompleted: () => setSaved(true),
    });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{strings.sectionTitle}</div>
      <div className={styles.sectionDesc}>{strings.sectionDesc}</div>
      <label className={styles.label} htmlFor="omdb-key">
        {strings.label}
      </label>
      <input
        id="omdb-key"
        className={styles.input}
        type="password"
        placeholder={strings.placeholder}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        autoComplete="off"
      />
      <button
        className={styles.btn}
        onClick={handleSave}
        disabled={isPending || !apiKey}
        type="button"
      >
        {isPending ? strings.savingBtn : strings.saveBtn}
      </button>
      {saved && <div className={styles.successMsg}>{strings.successMsg}</div>}
    </div>
  );
};
