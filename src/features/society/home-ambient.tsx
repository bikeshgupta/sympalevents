import { createPortal } from "react-dom";

/**
 * The home's backdrop: three large, very soft washes of colour (the primary teal, a marigold and a rose)
 * drifting slowly behind everything, so the glass on the page has something to refract instead of reading as
 * flat white. Decoration only - fixed, behind the content, never takes a click, and still under reduced motion.
 *
 * Portalled to `body`: the page is wrapped in PageTurn, whose transform would otherwise become the containing
 * block for a fixed element while a page turns.
 */
export function HomeAmbient() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div aria-hidden="true" className="home-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="-left-[20%] -top-[10%] h-[55vh] w-[70vw] bg-primary/25" />
      <span className="-right-[25%] top-[20%] h-[50vh] w-[65vw] bg-amber-300/40" />
      <span className="-bottom-[15%] left-[10%] h-[45vh] w-[60vw] bg-rose-300/35" />
    </div>,
    document.body,
  );
}
