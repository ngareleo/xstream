import { useRef, useState, useEffect } from "react";
import type { RefObject } from "react";

interface UseVideoSyncResult {
  currentTime: number;
  isPlaying: boolean;
}

/**
 * Syncs React state with a <video> element's playback position and play/pause state.
 * Uses requestAnimationFrame for smooth currentTime updates.
 */
export function useVideoSync(videoRef: RefObject<HTMLVideoElement | null>): UseVideoSyncResult {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    const tick = () => {
      setCurrentTime(video.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef]);

  return { currentTime, isPlaying };
}
