import { useEffect, useRef, useState } from "react";

/**
 * Tracks the OS "reduce motion" setting so animated numbers and decorative
 * effects can drop straight to their final state.
 */
export function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}

/** easeOutCubic - fast off the mark, gentle landing. */
function easeOut(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Animates a number towards `target` on mount and on every subsequent change,
 * always resuming from whatever is currently on screen so a value that updates
 * mid-flight does not snap. Returns the value to render.
 */
export function useCountUp(target: number, { duration = 1100 }: { duration?: number } = {}) {
  const prefersReduced = usePrefersReducedMotion();
  const [value, setValue] = useState(prefersReduced ? target : 0);
  const displayedRef = useRef(prefersReduced ? target : 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReduced || !Number.isFinite(target)) {
      displayedRef.current = target;
      setValue(target);
      return;
    }

    const from = displayedRef.current;
    if (from === target) return;

    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const next = from + (target - from) * easeOut(progress);
      displayedRef.current = next;
      setValue(next);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      displayedRef.current = target;
      setValue(target);
      frameRef.current = null;
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [target, duration, prefersReduced]);

  return value;
}
