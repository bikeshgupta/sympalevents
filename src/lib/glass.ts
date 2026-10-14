/**
 * The look and motion of everything that opens over the page: menus, dialogs, sheets, the drawer.
 *
 * The material is `.glass-panel` in globals.css (translucent, blurred, bright top edge). The motion is
 * tailwindcss-animate's data-state classes, which Radix keeps on an element until its exit animation has
 * finished, so a panel leaves the way it arrived instead of vanishing. `prefers-reduced-motion` collapses all of
 * it (globals.css), and the finished state is what remains.
 */

/** A menu opening from its button: a short fade and settle. */
export const menuGlass =
  "glass-panel duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/** The dimmed, softly blurred backdrop behind a dialog, sheet or drawer. */
export const overlayGlass =
  "bg-black/35 backdrop-blur-[3px] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

/**
 * A centred dialog: slides in from the right of its resting place and leaves the same way (going deeper comes in from
 * the right, going back leaves to the right, like turning a page - Settings' sheets do the same).
 *
 * Only the "right" variants are used: tailwindcss-animate writes `-${value}` for the "left" ones, and `-calc(...)`
 * is invalid CSS, which silently drops the whole transform (the dialog then starts from its top-left corner). The
 * -50% is the dialog's own centring translate, which the animation replaces; the + 1.5rem is how far right it starts.
 */
export const dialogGlass =
  "glass-panel duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-[calc(-50%_+_1.5rem)] data-[state=open]:slide-in-from-right-[calc(-50%_+_1.5rem)] data-[state=closed]:slide-out-to-top-1/2 data-[state=open]:slide-in-from-top-1/2";
