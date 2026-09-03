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
  anyone with the link sees them. The committee has cleared contributor and sponsor
  names and flat numbers for the dashboard's Contributions/Sponsors tiles (inside
  Funding Progress); contact details and payment references remain off public pages.
  See the Privacy section of the UI rules before putting any new personal field on
  those screens.
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
- The dashboard's "largest first, capped mosaic" tile grid (Funding Progress →
  Contributions/Sponsors tabs) is `useTopEntries` + `TileGrid` in `dashboard-page.tsx`.
  `useTopEntries` takes `getAmount`/`toTile` as **module-level functions, not inline
  closures** (`receivedAmount`, `contributionToTile`, `sponsorToTile`) — that is what
  lets it memoize on `rows` alone without an `exhaustive-deps` fight. Follow that
  pattern for a third tab rather than inlining a new closure.
- CRUD dialogs use `CrudDialog` + `FormField` + the `formString` / `formNumber` helpers.

## Link previews (Open Graph)

[index.html](index.html) carries static `og:*` / `twitter:*` meta tags so sharing a link
(WhatsApp, Telegram, Slack, iMessage…) shows a title, description, and image.

- **These are static, not per-page.** This is a client-rendered SPA with no SSR —
  a link-preview crawler reads the raw HTML response and never runs React, so every
  route (`/dashboard`, `/contributions`, …) serves the *same* tags via the
  `vercel.json` catch-all rewrite. Don't expect the preview to reflect a specific
  event's name or dates without adding server-rendering for it.
- **`og:image` points at `public/og-image.jpg`**, not the hero image imported in
  `dashboard-page.tsx` (`bg-image.jpeg`, same photo) — files under `public/` are
  served byte-for-byte at a fixed path, unlike a Vite-imported asset, which gets a
  new hashed filename every build. A meta tag needs a URL that doesn't move.
- **`og:image` and `og:url` are absolute** (`https://sympalevents.vercel.app/...`),
  which link-preview crawlers require. **If the production domain ever changes,
  these two tags must be updated by hand** — nothing derives them automatically.
- To change the preview image: replace `public/og-image.jpg` and update the
  `og:image:width` / `og:image:height` tags to match its real dimensions.

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

### Auction registration

An announcement can carry `auction: AnnouncementAuction` (an opens/closes window) and
`art: "laddoo-auction"` (an illustration, mapped in `ART_IMAGES` in
[announcements-card.tsx](src/features/dashboard/announcements-card.tsx)). When present,
`<AuctionPanel>` renders below the notice with a **real, working registration flow** —
bidding itself is a placeholder ("coming soon"); registration is not.

- **Data model:** [supabase/migrations/009_auction_registrations.sql](supabase/migrations/009_auction_registrations.sql)
  adds `auction_registrations`, keyed by `(event_id, auction_id, user_id)`. `auction_id`
  is an announcement's `id` string — the auction is defined in the data file, not a DB
  row, so there is no FK to it.
  **This migration has not necessarily been run against the live Supabase project** —
  check before assuming the feature works end-to-end; run it in the Supabase SQL editor
  the same way as any other file under `supabase/migrations/`.
- **RLS is enabled with zero policies, deliberately.** This app authenticates through
  Firebase, not Supabase Auth — the browser's Supabase client never holds a session, so
  `auth.uid()` never resolves for it. A policy written against `auth.uid()` here would
  be dead code. All access goes through `/api/auction-registrations`
  ([api/auction-registrations.ts](api/auction-registrations.ts)), which verifies the
  Firebase ID token via `requireAppUser()` and writes with the service-role client
  (bypasses RLS by design). **Do not add anon/authenticated policies to this table**
  expecting a direct browser `supabase.from("auction_registrations")` call to work —
  it won't, and it shouldn't; that would remove the only enforcement this table has.
- New local API routes must be added to `localApiRoutes` in `vite.config.ts` or the dev
  server 404s them silently via `next()`.
- `useAuctionRegistration({ eventId, auctionId, signedIn })`
  ([src/lib/auction-registration.ts](src/lib/auction-registration.ts)) wraps the GET
  (status + registrant count) and the register/cancel mutations. The query is `enabled`
  only when signed in, matching the `MyResponsibilities` pattern — signed-out visitors
  never call the endpoint.
- **Bidding is now real too**, built on top of registration exactly as noted above:
  [supabase/migrations/010_auction_bids.sql](supabase/migrations/010_auction_bids.sql)
  adds an append-only `auction_bids` ledger (never updated or deleted — the history
  *is* the record); [api/auction-bids.ts](api/auction-bids.ts) is the only way to
  write to it. Same RLS-with-zero-policies stance as `auction_registrations`, same
  reasoning — do not add client policies to this table either.
  - **Rules are enforced server-side, not just in the UI**: first bid ≥ ₹5,000
    (`STARTING_BID`), every bid after ≥ previous highest + ₹100 (`MIN_INCREMENT`);
    the bidder must have an active `auction_registrations` row for that
    event+auction; and the bid must fall inside the bidding window.
  - **The bidding window is checked against the real `events.start_date`**, not
    trusted from the client. `AUCTION_WINDOWS` in `api/auction-bids.ts` mirrors the
    day-offset/time pair from that auction's entry in `src/data/announcements.ts`
    (e.g. `laddoo-auction-day-3`: opens day-offset 0 at 08:30, closes day-offset 2 at
    10:00) — **the two must be kept in sync by hand**; there is no single source of
    truth for it today. `eventZoneTimestamp`/`addDays` in that file are a deliberate
    mirror of `toEventZoneTimestamp`/`getEventDays` in
    [dashboard-utils.ts](src/features/dashboard/dashboard-utils.ts) — verified to
    produce identical timestamps for the current event, but re-verify if the event's
    day-count logic ever changes.
  - **Known gap:** reading the current highest bid and validating a new one against
    it is not atomic (no DB-level lock or unique-amount constraint) — two people
    bidding within the same instant could both pass validation. Low-stakes for a
    community auction's bid volume; a real fix would move the check-and-insert into
    a Postgres function.
  - `useAuctionBids({ eventId, auctionId, signedIn, live })`
    ([src/lib/auction-bids.ts](src/lib/auction-bids.ts)) polls every 3s while `live`
    is true (bidding actually open) and off otherwise — there is no realtime
    subscription, because the same RLS lockdown that protects this table from direct
    writes also blocks the anon client from subscribing to Realtime changes on it.
  - The bid graph/history live in
    [auction-detail-dialog.tsx](src/features/dashboard/auction-detail-dialog.tsx),
    which also holds the "How it works" view (image is reused across both, content
    swaps). **This file is lazy-loaded** (`React.lazy` in `announcements-card.tsx`) —
    it pulls in `recharts`, ~385KB, and there is no reason to ship that to every
    dashboard visitor who never opens the dialog. Keep any future chart-heavy
    addition here, or in another lazy boundary — don't let a static import drag
    `recharts` back into the main bundle.

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

1. **No database changes** unless the user has asked for something that genuinely
   requires one (a new feature needing its own storage, not an existing screen's
   numbers). No migrations, no column renames, no schema edits, no changes to what an
   *existing* query selects, without that explicit ask. When a change does add a
   migration, say so plainly and tell the user it needs to be run — files under
   `supabase/migrations/` are never applied automatically; the user runs them by hand,
   same as every migration before it (see README → Supabase). Never touch the live DB
   directly.
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
