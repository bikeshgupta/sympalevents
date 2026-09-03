# CLAUDE.md

Guidance for Claude Code when working in this repository.

@.claude/rules/ui-ux.md

## What this app is

**SymPal Events** (`sympal-events`) — a multi-event committee management app for
residential-society festivals/events. Committee members track contributions from
residents, sponsorships, budgets, expenses, tasks, and the day-wise event schedule.

**This app is LIVE in production.** Treat every change as a change to software real
committee members are using today. See "Working agreement" below.

## Commands

```bash
npm.cmd run dev      # Vite dev server on :5173, serves /api/* via middleware
npm.cmd run build    # tsc -b && vite build  <- must pass before any rollout
npm.cmd run lint     # eslint
npm.cmd run preview  # preview the production build
```

On Windows use `npm.cmd`, not `npm`.

There is no test suite. `npm.cmd run build` (which type-checks via `tsc -b`) plus a
manual pass through the affected screens is the verification bar.

### Lint baseline

`npm.cmd run lint` currently reports pre-existing errors/warnings unrelated to any
given change. Do not treat a non-zero lint exit as your regression. The rule is:
**a file you touch must not gain new lint problems**, and fixing existing ones in a
file you are already editing is welcome.

## Architecture

```
src/
  app.tsx                    route table (react-router-dom v6)
  main.tsx                   providers: QueryClient, EventContext, Router
  components/
    layout/                  app-layout (sidebar + mobile bottom nav), nav-items, route-guard
    ui/                      shadcn-style primitives: button, card, dialog, input, label, select
    shared/                  cross-feature widgets: stat-card, status-badge, form-field, data-source-badge
  features/<domain>/         one folder per screen; page component + local helpers
  features/shared/           cross-feature table/CRUD building blocks
  lib/                       supabase, firebase, auth, api, event-context, event-data, page-access, utils
  data/demo.ts               demo fallback dataset
api/                         Vercel serverless functions (also served locally by a Vite plugin)
supabase/migrations/         SQL schema
```

`@/` is aliased to `src/` (see `vite.config.ts` and `tsconfig.app.json`).

### Data flow

`useEventData()` in [src/lib/event-data.ts](src/lib/event-data.ts) is the single read
path for screen data. It returns `{ event, contributions, sponsors, budgets, tasks,
expenses, eventPlan, financials, source, fallbackReason }`.

- `source: "supabase"` — real data.
- `source: "demo"` — Supabase unconfigured/unreadable; `src/data/demo.ts` is served
  instead, and `<DataSourceBadge>` surfaces it. **Every screen must stay readable and
  correct in both modes.**

Writes go straight to Supabase from the feature page (`supabase.from(...)`), then
`queryClient.invalidateQueries({ queryKey: ["event-data"] })`. Privileged reads/writes
that need the service role go through `/api/*` via `apiFetch`.

`ContributionRow.createdAt` comes from the table's existing `created_at` column and is
what the Contributions list sorts by (newest first) so the most recent entry is on top.
It is deliberately not a visible table column — `TableToolbar`'s `sortNote` explains the
order instead. Columns marked `searchable: false` stay out of the free-text search.

### Auth and access

Firebase Google sign-in on the client; Vercel functions verify the Firebase ID token
against Google's public keys and map the user into Supabase `app_users`.

- `usePageAccess(pageKey)` → `{ canView, canEdit, requiresLogin, isLoading, role }`.
- Roles: `admin` | `committee` | `read_only`.
- `publicPageKeys` (`dashboard`, `budget`) render read-only **without a session** —
  anyone with the link sees them. The committee has cleared contributor names and flat
  numbers for the dashboard's Contributors tiles; contact details and payment
  references remain off public pages. See the Privacy section of the UI rules before
  putting any new personal field on those screens.
- **Always gate mutating UI on `access.canEdit`**, and render a "View-only access"
  affordance rather than a disabled/hidden control with no explanation.

## Conventions

- TypeScript + React 18 function components. No default exports for components —
  named exports (`export function DashboardPage()`).
- Tailwind only. Colors come from the CSS variables in
  [src/styles/globals.css](src/styles/globals.css) via semantic Tailwind tokens
  (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`). Do not hardcode
  hex/rgb, and do not add new palette variables without a reason.
- Class merging uses `cn()` from `@/lib/utils`.
- Money is rendered with `formatCurrency` (`@/lib/utils`, `en-IN` / INR, 0 decimals) or
  `formatCurrencyCompact` (dashboard, `₹1.2L` / `₹45K`). Never hand-roll `₹` + `toLocaleString`.
- Dates/times are event-timezone aware (`Asia/Kolkata`) — use the helpers in
  [src/features/dashboard/dashboard-utils.ts](src/features/dashboard/dashboard-utils.ts)
  (`toEventZoneTimestamp`, `formatEventDate`, `formatEventTime`), never bare `new Date(string)`.
- Icons are `lucide-react`, sized `h-4 w-4` in buttons/labels and `h-5 w-5` in card headers.
- Table screens compose `useFilteredSortedRows` + `SortableHeader` + `ColumnFilter` +
  `TableToolbar` from [src/features/shared/table-tools.tsx](src/features/shared/table-tools.tsx).
  Add a screen's columns as a `TableColumn<T>[]` const at module scope.
- CRUD dialogs use `CrudDialog` + `FormField` + the `formString` / `formNumber` helpers.

## Announcements (News section)

Dashboard notices and the header bell are driven by
[src/data/announcements.ts](src/data/announcements.ts) — **a plain file, not a
database table.** To post a notice, add an entry and deploy.

- `day: "Day 3"` is resolved to the event's real calendar date at render time by
  `resolveAnnouncements()` in [src/lib/announcements.ts](src/lib/announcements.ts),
  so notices survive the event dates changing.
- `tone: "spotlight"` gets the animated gradient + light-sweep treatment. Use it for
  one notice at a time; a screen where everything glows highlights nothing.
- `leadTimeLabel()` produces "in 2 days 4 hr" / "Happening now" / "Completed".
  A notice reads as live for 2 hours past its start, then drops out of the bell count.
- More than one entry turns the dashboard card into an auto-rotating carousel
  (8s, pauses on hover/focus, dots + arrows). One entry renders as a static card.

## Motion

- `useCountUp(target)` and `usePrefersReducedMotion()` live in
  [src/lib/motion.ts](src/lib/motion.ts); `<AnimatedNumber value format />`
  ([src/components/shared/animated-number.tsx](src/components/shared/animated-number.tsx))
  wraps them for display. `StatCard` animates when given `countTo` + `format`.
- Named animations (`animate-fade-up`, `animate-sheen`, `animate-pulse-ring`,
  `animate-float`, `animate-gradient-pan`, …) are defined in `tailwind.config.ts`
  under `theme.extend.keyframes` / `theme.extend.animation`.
- `.reveal-stack` on a stacked container staggers its direct children in. It is a CSS
  rule, not a wrapper component, deliberately: a child that renders `null` must not
  leave an empty box behind for `space-y` to space.
- The countdown uses `.font-countdown` (Playfair Display, loaded in `index.html`,
  falling back to a system serif) and `.flip-unit` / `.flip-face`, which flip each
  numeral down as it changes. The flip replays because the face is keyed on its value,
  so it remounts only when that unit actually ticks.
- A global `prefers-reduced-motion` block in `globals.css` collapses every animation
  and transition. Because animations use `both` fill mode they still settle at their
  final state. **Never bypass it with inline styles or `!important`.**

## Working agreement (production app)

1. **No database changes** unless explicitly asked. No migrations, no column renames,
   no schema edits, no changes to what a query selects.
2. **No major layout changes.** Users know these screens. Refine within the existing
   structure: spacing, type scale, contrast, states, affordances, accessibility,
   correctness of the numbers shown. Do not reorder major sections, swap navigation
   patterns, or restyle the app wholesale.
3. **Work on a local branch and stop there.** Do not commit to `master`, and never
   push — `master` auto-deploys to production via Vercel. Rollout is the user's call,
   made explicitly, after they have reviewed the change running locally.
4. **Changing a displayed number is a behavioural change, not a style change.** If a
   metric's math is wrong, fix it — but call it out explicitly so the user can confirm
   the new figure is what they expect.
5. **Shared components have blast radius.** `StatCard`, `StatusBadge`, `DataSourceBadge`,
   `TableToolbar`, `PageTools` are used across many screens. Extend them with optional
   props that default to today's behaviour; do not silently change every screen.
