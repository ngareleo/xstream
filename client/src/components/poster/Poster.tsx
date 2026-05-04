import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";

import { resolvePosterUrl } from "~/config/rustOrigin.js";

import { strings } from "./Poster.strings.js";
import { usePosterStyles } from "./Poster.styles.js";

interface PosterProps {
  url: string | null;
  alt: string;
  className?: string;
}

export const Poster: FC<PosterProps> = ({ url, alt, className }) => {
  const styles = usePosterStyles();
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [url]);

  if (!url || errored) {
    return (
      <div className={mergeClasses(styles.placeholder, className)}>
        {alt || strings.fallbackLabel}
      </div>
    );
  }

  // Prepend server origin for `/poster/...` paths; absolute (OMDb fallback) URLs pass through.
  const resolved = resolvePosterUrl(url) ?? url;

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={mergeClasses(styles.image, className)}
    />
  );
};
