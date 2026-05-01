import { type FC, useState } from "react";
import { mergeClasses } from "@griffel/react";
import { usePosterStyles } from "./Poster.styles.js";

interface PosterProps {
  url: string | null;
  alt: string;
  className?: string;
}

/**
 * Renders an OMDb poster URL with a graceful fallback to a gradient
 * placeholder if the image fails to load (or no URL is supplied).
 *
 * Geometry (size, aspect-ratio, object-fit overrides) is supplied by the
 * parent via `className` — Poster owns only the visual fallback styling.
 */
export const Poster: FC<PosterProps> = ({ url, alt, className }) => {
  const [errored, setErrored] = useState(false);
  const styles = usePosterStyles();

  if (!url || errored) {
    return (
      <div className={mergeClasses(styles.placeholder, className)}>
        {alt || "poster"}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setErrored(true)}
      className={mergeClasses(styles.image, className)}
    />
  );
};
