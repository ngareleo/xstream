import { mergeClasses } from "@griffel/react";
import { type FC } from "react";

import { resolvePosterUrl } from "~/config/rustOrigin.js";

import { strings } from "./Poster.strings.js";
import { usePosterStyles } from "./Poster.styles.js";

interface PosterProps {
  url: string | null;
  alt: string;
  className?: string;
}

// Stateless: the placeholder is layered UNDER the img. When the URL is
// missing, no img mounts. When the img loads cleanly, it covers the
// placeholder. When loading fails, onError hides the broken img via a
// direct DOM mutation, revealing the placeholder underneath. No React
// state — avoids the `act(...)` window outside which the storybook
// console-error guard fails.
export const Poster: FC<PosterProps> = ({ url, alt, className }) => {
  const styles = usePosterStyles();
  const label = alt || strings.fallbackLabel;

  if (!url) {
    return <div className={mergeClasses(styles.placeholderStandalone, className)}>{label}</div>;
  }

  // Prepend server origin for `/poster/...` paths; absolute (OMDb fallback) URLs pass through.
  const resolved = resolvePosterUrl(url) ?? url;

  return (
    <span className={mergeClasses(styles.frame, className)}>
      <span className={styles.placeholder}>{label}</span>
      <img
        src={resolved}
        alt={label}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        className={styles.image}
      />
    </span>
  );
};
