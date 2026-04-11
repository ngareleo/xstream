import { type FC, useEffect, useState } from "react";
import "./Slideshow.css";

const IMAGES = [
  "/images/pexels-droneafrica-13338819.jpg",
  "/images/pexels-droneafrica-13954242.jpg",
  "/images/pexels-gsn-travel-28708345.jpg",
  "/images/pexels-dirk-pothen-2149332904-30629530.jpg",
];

const CAPTIONS = [
  "East Africa from above",
  "Golden hour over the Savannah",
  "Into the horizon",
  "The long road home",
];

const INTERVAL_MS = 6000;

export const Slideshow: FC = () => {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent((c) => (c + 1) % IMAGES.length);
        setFading(false);
      }, 600);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const goTo = (idx: number) => {
    if (idx === current) return;
    setFading(true);
    setTimeout(() => {
      setCurrent(idx);
      setFading(false);
    }, 300);
  };

  return (
    <div className="slideshow">
      {IMAGES.map((src, i) => (
        <div
          key={src}
          className={`slideshow-slide ${i === current ? "active" : ""} ${i === current && fading ? "fading" : ""}`}
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
      <div className="slideshow-overlay" />
      <div className="slideshow-caption">{CAPTIONS[current]}</div>
      <div className="slideshow-dots">
        {IMAGES.map((_, i) => (
          <button
            key={i}
            className={`slideshow-dot ${i === current ? "active" : ""}`}
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
