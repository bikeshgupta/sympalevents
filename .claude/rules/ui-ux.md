# UI/UX rules — SymPal Events

Binding rules for any visual or interaction change in this repo. This app is live;
these exist so refinement never turns into a redesign.

## 0. The prime directive

Change how something **reads, responds, and communicates**. Do not change **where it
lives**. If a returning user would have to re-learn the screen, the change is too big.

Allowed without asking: type scale, spacing, contrast, alignment, empty/loading/error
states, focus and hover states, ARIA and semantics, number formatting, keyboard support,
mobile readability of existing content, dead-code removal.

Ask first: moving or reordering major sections, replacing a navigation pattern, adding
or removing a metric tile, changing the app's colour palette, adding a dependency.

## 1. Typography

- **Nothing below 12px (`text-xs`).** `text-[9px]`, `text-[10px]`, `text-[11px]` are
  only acceptable for all-caps micro-labels with `tracking-wide` that sit next to the
  value they label — never for a value, a date, or anything a user must read.
- Use the Tailwind scale (`text-xs` … `text-4xl`). Avoid arbitrary `text-[18px]` values;
  they break the rhythm and usually signal a mobile size that was never designed.
- Every heading needs a deliberate responsive step, e.g. `text-2xl sm:text-4xl`.
  A mobile size must be a *smaller version of the design*, not a different design.
- Numbers use `tabular-nums` so columns and counters do not jitter.

## 2. Colour and contrast

- Semantic tokens only (`text-muted-foreground`, `bg-card`, `border-border`, `bg-primary`).
  Raw rgba belongs only in the hero scrim gradients, which are tuned per breakpoint
  and must stay light enough that the event photo still reads.
- Body text on the hero image must clear ~4.5:1 against the *darkest* part of the
  gradient it sits on. `text-white/60` is the floor, and only for micro-labels.
- **Do not buy legibility by dimming the whole photo.** The hero image is content.
  Put copy on a local frosted plate (`bg-black/35 backdrop-blur`) or in the countdown
  panel, and keep the scrim near-clear through the middle of the frame.
- Colour is never the only signal. Status needs a word (`StatusBadge`), not just a hue.

## 3. State completeness

Every data surface implements four states, not one:

| State | Requirement |
|---|---|
| **Loading** | Skeleton or explicit "…" — **never render `₹0` / `0` while data is in flight.** A zero that is actually "unknown" is a lie. |
| **Empty** | A sentence saying what is missing and, if the user can act, how. Never a bare empty table body. |
| **Error** | Surfaced in-place; `rounded-md bg-destructive/10 p-3 text-sm text-destructive`. |
| **Loaded** | The normal case. |

## 4. Accessibility

- Interactive elements are `<button>`/`<a>`, never a clickable `<div>`.
- Icon-only controls carry `aria-label`.
- Progress bars: `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax`
  + `aria-label`. `aria-hidden` on the visual bar is fine only if an accessible
  equivalent exists next to it.
- A live-updating region (countdown, "happening now") must not spam a screen reader:
  hide the ticking digits with `aria-hidden` and expose one calm text summary.
- Tab groups: `role="tablist"` / `role="tab"` / `aria-selected`, and the content they
  control gets `role="tabpanel"`. If you claim the roles, support the keyboard.
- Focus is always visible — never remove the `focus-visible:ring-2` from `Button`/`Input`.

## 5. Mobile

- The bottom nav occupies the last ~80px; page content already accounts for this via
  `pb-20` on the layout. Do not add fixed-position elements that collide with it.
- Tap targets ≥ 40px.
- **A wide table is not a mobile design.** Tables with a `min-w-[900px]`-class minimum
  must have a card list for `< lg`, using the same data and the same actions.
  Pattern: cards `lg:hidden`, table wrapper `hidden lg:block`.
- Never leave a rendered-but-`hidden` block in the tree as a substitute for a
  breakpoint. It costs render time and rots. Use real responsive classes or delete it.

## 6. Data honesty

- A tile's label must be true of its math. If a tile says "Additional Contribution",
  it sums per-row overpayment — not `max(totalReceived - totalExpected, 0)`, which
  nets overpayers against underpayers and reads 0 forever.
- Compact currency (`₹1.2L`) must carry the exact value in a `title` attribute.
- Dates are formatted for humans. A raw `2026-08-14` or a bare `-` in a cell is a bug;
  use `formatEventDate` and an em dash `—` for genuinely absent values.
- Money columns are right-aligned with `tabular-nums`. Text columns are left-aligned.

## 7. Privacy on public pages

`publicPageKeys` in [src/lib/page-access.ts](src/lib/page-access.ts) — currently
`dashboard` and `budget` — render **without a session**. Anyone with the link sees them.

**Standing decision:** the committee has chosen to show contributor names and flat
numbers in the dashboard's Contributors tiles. That is deliberate — recognising
contributors publicly is the point of the list. Do not "fix" it back to anonymous.

What still applies:

- Contact details and payment references are **not** for public pages. Names, flat
  numbers, amounts, dates and status are cleared for the Contributors tiles only.
- Do not extend that clearance to other public surfaces by analogy. A new list of
  *who has not paid* is a different thing from a list of who gave most, and needs
  asking about first.
- Reading a new column in `useEventData` makes it available to every page, public ones
  included. Adding a field to a public screen means re-checking this section.
- If the committee ever wants the names restricted, the change is small: gate the list
  on `useSession()` in `FundingProgress` and fall back to amounts only.

## 8. Motion

Motion is there to explain a change, draw the eye to news, and make the app feel
alive. It is not decoration for its own sake.

- **Every animation must respect `prefers-reduced-motion`.** The global block in
  `globals.css` handles CSS animations; JS-driven motion must call
  `usePrefersReducedMotion()` and jump to the final value.
- Entrance animations are **once, on mount**, and short (400–600ms). Nothing that
  re-triggers on every re-render, and nothing that delays reading by more than ~500ms.
- Staggers cap out. `.reveal-stack` stops increasing after the 6th child; list rows
  cap at ~12. A 200-row table must not take seven seconds to arrive.
- Numbers count up via `<AnimatedNumber>` / `useCountUp`, which resumes from the
  currently displayed value so a figure that updates mid-animation never snaps.
  The settled value goes in `aria-label`; ticking digits are `aria-hidden`.
- Looping effects (sheen, pulse, float, gradient pan) are for **one** focal element
  per screen. If two things on a screen loop, neither reads as important.
- Carousels auto-advance no faster than 7s and **must** pause on hover and on focus,
  with manual controls always available.
- Animate `transform` and `opacity`. Animating `width`/`height`/`top` on a loop
  causes layout thrash — the funding bar animates width once, on load, not forever.

## 9. Performance

- A `setInterval` that drives a re-render must be scoped as tightly as possible: stop
  it when the thing it animates is not on screen, and keep derived work behind `useMemo`
  so a 1s tick does not re-sort a timeline.
- Do not ship a `className="hidden"` subtree that maps and renders every row.

## 10. Consistency checklist before you finish

- [ ] Money via `formatCurrency` / `formatCurrencyCompact`.
- [ ] Dates via `formatEventDate` / `formatEventTime`.
- [ ] Colours via semantic tokens.
- [ ] React `key` is a stable id (`row.id ?? ...`) — never a field a user can duplicate
      or leave blank, like a flat number.
- [ ] Mutating controls gated on `access.canEdit`.
- [ ] No contact detail or payment reference on a public page (dashboard, budget); names/flats only where already cleared.
- [ ] Works in both `source: "supabase"` and `source: "demo"`.
- [ ] `npm.cmd run build` passes.
- [ ] Touched files gained no new lint problems.
