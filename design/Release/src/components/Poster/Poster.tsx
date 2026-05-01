import { type CSSProperties, type FC, useState } from "react";

interface PosterProps {
  url: string | null;
  alt: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Renders an OMDb poster URL with a graceful fallback to a gradient
 * placeholder if the image fails to load (or no URL is supplied).
 *
 * Mirrors the `<Poster>` helper in `/home/dag/Downloads/app-mockups.jsx`.
 */
export const Poster: FC<PosterProps> = ({ url, alt, style, className }) => {
  const [errored, setErrored] = useState(false);

  if (!url || errored) {
    return (
      <div
        className={className}
        style={{
          background:
            "linear-gradient(160deg, var(--surface-2), var(--bg-0))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          ...style,
        }}
      >
        {alt || "poster"}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setErrored(true)}
      className={className}
      style={{ objectFit: "cover", display: "block", ...style }}
    />
  );
};
