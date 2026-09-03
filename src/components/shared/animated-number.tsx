import { useCountUp } from "@/lib/motion";

/**
 * Counts up to `value` on mount and on every change, then renders it through
 * `format`. Screen readers get the settled value via `aria-label`, so the
 * ticking digits are never announced.
 */
export function AnimatedNumber({
  value,
  format,
  duration,
  className,
  title,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
  title?: string;
}) {
  const animated = useCountUp(value, { duration });
  const settled = format(value);

  return (
    <span className={className} title={title} aria-label={settled}>
      <span aria-hidden="true">{format(Math.round(animated))}</span>
    </span>
  );
}
