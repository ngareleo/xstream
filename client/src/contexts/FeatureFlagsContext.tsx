import { type FC, type ReactNode, useCallback, useEffect, useSyncExternalStore } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";

import {
  clearLocalFlagOverrides,
  getFlag,
  getFlagsSnapshot,
  hydrateFlags,
  resetAllFlagsToDefaults,
  serializeValue,
  setFlagLocal,
  subscribeFlags,
} from "~/config/featureFlags.js";
import { FLAG_REGISTRY, type FlagValue } from "~/config/flagRegistry.js";
import type { FeatureFlagsContextQuery } from "~/relay/__generated__/FeatureFlagsContextQuery.graphql.js";
import type { FeatureFlagsContextSetMutation } from "~/relay/__generated__/FeatureFlagsContextSetMutation.graphql.js";

const FLAGS_QUERY = graphql`
  query FeatureFlagsContextQuery($keys: [String!]!) {
    settings(keys: $keys) {
      key
      value
    }
  }
`;

const SET_SETTING_MUTATION = graphql`
  mutation FeatureFlagsContextSetMutation($key: String!, $value: String!) {
    setSetting(key: $key, value: $value)
  }
`;

/** Hydrates flag cache from server; no React context object — cache is source of truth. */
export const FeatureFlagsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const keys = FLAG_REGISTRY.map((f) => f.key);
  const data = useLazyLoadQuery<FeatureFlagsContextQuery>(
    FLAGS_QUERY,
    { keys },
    { fetchPolicy: "store-or-network" }
  );

  useEffect(() => {
    hydrateFlags(data.settings);
  }, [data]);

  return <>{children}</>;
};

export function useFeatureFlag<T extends FlagValue>(
  key: string,
  fallback: T
): { value: T; setValue: (v: T) => void } {
  useSyncExternalStore(subscribeFlags, getFlagsSnapshot, getFlagsSnapshot);
  const value = getFlag<T>(key, fallback);

  const [save] = useMutation<FeatureFlagsContextSetMutation>(SET_SETTING_MUTATION);

  const setValue = useCallback(
    (v: T): void => {
      setFlagLocal(key, v);
      save({ variables: { key, value: serializeValue(v) } });
    },
    [key, save]
  );

  return { value, setValue };
}

/** Bulk operations on flag cache; used by FlagsTab "Clear" and "Reset to defaults" buttons. */
export function useFeatureFlagControls(): {
  clearLocalOverrides: () => void;
  resetAllToDefaults: () => void;
} {
  const [save] = useMutation<FeatureFlagsContextSetMutation>(SET_SETTING_MUTATION);

  const clearLocalOverrides = useCallback((): void => {
    clearLocalFlagOverrides();
  }, []);

  const resetAllToDefaults = useCallback((): void => {
    const writes = resetAllFlagsToDefaults();
    for (const w of writes) {
      save({ variables: { key: w.key, value: w.value } });
    }
  }, [save]);

  return { clearLocalOverrides, resetAllToDefaults };
}
