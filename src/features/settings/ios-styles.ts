/** Class strings shared by the iOS-style Settings components (kept out of ios-list.tsx so that file only exports components). */

/** The grouped-list background. Opaque on purpose: the section sheet slides over the index and must hide it. */
export const groupedBackground = "bg-[hsl(42_26%_94%)]";

/** The input in a row whose value you type: right-aligned, no box. */
export const fieldInput =
  "min-w-0 flex-1 bg-transparent py-2 text-right text-base text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
