import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

/**
 * A read-only rating. Five outlined stars with a filled copy clipped to the
 * average on top, so 4.6 actually looks like 4.6 rather than rounding to 5.
 * The stars are decorative - the number beside them is the accessible value,
 * so the whole thing carries one label instead of five.
 */
export function StarRating({
  value,
  size = "md",
  className,
  label,
}: {
  value: number;
  size?: keyof typeof sizeClass;
  className?: string;
  label?: string;
}) {
  const percent = Math.min(100, Math.max(0, (value / 5) * 100));

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      role="img"
      aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={cn(sizeClass[size], "text-amber-400")} />
        ))}
      </span>
      <span
        className="pointer-events-none absolute inset-0 flex gap-0.5 overflow-hidden"
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={cn(sizeClass[size], "shrink-0 fill-amber-400 text-amber-400")} />
        ))}
      </span>
    </span>
  );
}

/** The rating input on the review form - five real buttons, arrow-key aware. */
export function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
          disabled={disabled}
          tabIndex={value === star || (!value && star === 1) ? 0 : -1}
          onKeyDown={(event) => {
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!offset) return;
            event.preventDefault();
            onChange(Math.min(5, Math.max(1, (value || 1) + offset)));
          }}
          onClick={() => onChange(star)}
          className="flex h-10 w-10 items-center justify-center rounded-md transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Star
            className={cn("h-6 w-6", star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
