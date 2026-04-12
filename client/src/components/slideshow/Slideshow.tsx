import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useRef, useState } from "react";

import { strings } from "./Slideshow.strings.js";
import { useSlideshowStyles } from "./Slideshow.styles.js";

// Gradient placeholders — replaced with real poster backdrops once OMDb is live
const GRADIENTS = [
  "linear-gradient(135deg, #1a0a0a 0%, #3d0b0b 40%, #0a0a0a 100%)",
  "linear-gradient(135deg, #0a0a1a 0%, #0b1a3d 40%, #0a0a0a 100%)",
  "linear-gradient(135deg, #0a1a0a 0%, #0b3d1a 40%, #0a0a0a 100%)",
  "linear-gradient(135deg, #1a1a0a 0%, #3d2d0b 40%, #0a0a0a 100%)",
];

const CAPTIONS = [strings.caption0, strings.caption1, strings.caption2, strings.caption3];

const INTERVAL_MS = 6000;

export const Slideshow: FC = () => {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const styles = useSlideshowStyles();

  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      fadeTimerRef.current = setTimeout(() => {
        setCurrent((c) => (c + 1) % GRADIENTS.length);
        setFading(false);
      }, 600);
    }, INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (fadeTimerRef.current !== null) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const goTo = (idx: number): void => {
    if (idx === current) return;
    setFading(true);
    setTimeout(() => {
      setCurrent(idx);
      setFading(false);
    }, 300);
  };

  return (
    <div className={styles.root}>
      {GRADIENTS.map((gradient, i) => (
        <div
          key={gradient}
          className={mergeClasses(
            styles.slide,
            i === current && styles.slideActive,
            i === current && fading && styles.slideFading
          )}
          style={{ background: gradient }}
        />
      ))}
      <div className={styles.overlay} />
      <div className={styles.caption}>{CAPTIONS[current]}</div>
      <div className={styles.dots}>
        {GRADIENTS.map((_, i) => (
          <button
            key={i}
            className={mergeClasses(styles.dot, i === current && styles.dotActive)}
            onClick={() => goTo(i)}
            aria-label={`${strings.slideAriaLabel} ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
