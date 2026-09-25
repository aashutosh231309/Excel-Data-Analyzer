import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 600;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a statistic when it first appears or changes.
 *
 * The animation only runs when the incoming value actually changes, so React
 * re-renders never restart it. Reduced-motion users see the value immediately.
 */
export function useCountUp(value: number | null, durationMs = DEFAULT_DURATION_MS): number | null {
  const [displayed, setDisplayed] = useState<number | null>(value);
  const previousValue = useRef<number | null>(value);

  useEffect(() => {
    const from = previousValue.current;
    previousValue.current = value;

    if (value === null || from === null || from === value || prefersReducedMotion()) {
      setDisplayed(value);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return displayed;
}
