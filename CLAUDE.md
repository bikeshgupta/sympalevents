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
    layout/                  app-layout (sidebar + mobile drawer), nav-drawer, nav-items, route-guard
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
- **There is no hardcoded `publicPageKeys` set any more.** Which pages are open to
  whom is the event admin's call, per event, set in Settings → Page Visibility and
  stored in `event_page_visibility`
  ([015_event_page_visibility.sql](supabase/migrations/015_event_page_visibility.sql)).
  Three levels per page:
  - `public` — anyone with the link, no sign-in;
  - `authenticated` — any signed-in user;
  - `restricted` — the admin, plus members granted view/edit for that page in
    `event_page_permissions` (Settings → Member Access).
- **Visibility widens viewing only.** Editing is unchanged: admin, or an explicit
  `edit` grant. Nothing an admin does in Page Visibility can hand out write access.
- **`settings` is not configurable** — it stays admin-only in both API branches,
  because it is the screen that controls all the others.
- The server is the only authority. [api/_lib/page-visibility.ts](api/_lib/page-visibility.ts)
  holds `eventPageKeys` + `fetchPageVisibility()`; both
  [api/page-access.ts](api/page-access.ts) (one page, for the caller) and
  [api/event-access.ts](api/event-access.ts) (the whole list, which the nav filters on)
  resolve against it. The client just asks — do not reintroduce a client-side list of
  "public" pages, and do not gate a page in the UI without the server agreeing.
- A missing `event_page_visibility` table is treated as "no rows" rather than an
  error, falling back to the pages that used to be hardcoded public (`dashboard`,
  `budget`, `auctions`, `closing`), so the app keeps working before the migration is
  applied instead of locking everyone out of everything.
- Because a public page can now be *any* page, the committee's standing decision about
  contributor/sponsor names on the dashboard's Contributions/Sponsors tiles does not
  transfer. Contact details and payment references stay off anything set to `public`.
  See the Privacy section of the UI rules before putting a new personal field on a
  screen an admin might open up.
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
- Agenda points inside a scheduled event (idol arrival, sankalp, when the prasad
  counter opens, a cultural running order) live in `event_schedule.sub_events`,
  **one point per line, plain text, no per-point timing**. Read them with
  `parseAgenda` in [src/lib/agenda.ts](src/lib/agenda.ts) - which returns
  `string[]` - and never split the column by hand. There is deliberately no time
  field per point: the parent event already carries start/end, and a two-clock-input
  row editor is what made this field go unused. `AgendaField`
  ([src/features/event-plan/agenda-editor.tsx](src/features/event-plan/agenda-editor.tsx))
  is one plain `<textarea>` named `subEvents`, so the Events page's uncontrolled
  `FormData` flow is untouched. Both the dashboard timeline and the Events table
  render each line as a bullet.
- **`event_schedule.sub_events` requires
  [007_event_schedule_sub_events.sql](supabase/migrations/007_event_schedule_sub_events.sql),
  which was never applied to the live project** - verified directly against it. That
  is why saved agendas silently vanished: `api/event-schedule.ts` caught the
  missing-column error on write and retried without the field. It no longer does
  that silently - a write carrying agenda text now fails with a 501 naming the
  migration, while a write with an empty agenda still saves. Reads still degrade
  gracefully.

## Navigation

- **Desktop (`lg` and up):** the fixed left sidebar in
  [app-layout.tsx](src/components/layout/app-layout.tsx).
- **Mobile:** a right-hand drawer behind the three-line button next to the profile
  picture ([nav-drawer.tsx](src/components/layout/nav-drawer.tsx)). It shows the
  signed-in account first (or a Sign in button), then every page, then Sign out.

**The fixed bottom bar is gone**, and so is the `pb-20` the layout reserved for it.
With thirteen pages that bar showed about four at a time behind a sideways scroll,
gave no hint the rest existed, and cost the last ~80px of every screen. Do not
reintroduce it; add a page to `navItems` and it appears in both surfaces.

Both surfaces filter on the **same** list — `useEventAccess().pages` — so the sidebar
and the drawer can never disagree about what a viewer may open. See "Auth and access".

## App icon and installability

**Six people around a shared centre**, in warm gold on the brand teal
(`--primary`, `#1D5B5E`).

The committee rather than the festival. This app is multi-event, so anything
festival-specific — a diya, a modak, a Ganesh silhouette — would date it to one
celebration; a group of residents organising something together does not. (Earlier
drafts of a diya and an "S" monogram were both rejected; the S in particular is a
trap, because the stroke weight that makes a letter solid at 512px closes its counters
at 16px.)

Three things about the drawing are load-bearing, all of them learned by getting them
wrong first:

- **Each figure is a head circle plus a separate shoulder dome with a 12-unit gap**,
  the dome wider than the head so the silhouette narrows at the neck. Overlap them and
  the pair reads as a *heart*, not a person.
- **The gradient is declared in each figure's own rotated frame**, so all six are
  shaded identically. One gradient across the whole icon left the top of the ring pale
  and the bottom deep orange, and they stopped reading as one group.
- **The gradient range is short** (`#FFE4A0` → `#F6BE60`). More contrast than that and
  the head reads as an object separate from the body.

If you edit the generator, note that GDI+'s `LinearGradientBrush` **tiles** by default:
a gradient whose range is narrower than the shape it fills wraps around and lays hard
bands across it.

**Known limitation:** at 16px six figures collapse into a warm blob. That is inherent
to the concept, not a bug to fix by nudging — accepted deliberately, on the grounds
that a gold-on-teal tab marker is still distinctive. If tab legibility ever matters
more, the fix is a *simplified* 16/32px favicon (the hub alone, or three larger
figures) while the home-screen icon keeps all six.

Everything lives in [public/](public/) and is served byte-for-byte at a fixed path.
That is not incidental: a Vite-imported asset gets a new hashed filename every build,
and an icon URL that moves is one a browser cache and an installed home-screen
shortcut both lose. Same reasoning as `og-image.jpg`.

| File | Used by |
|---|---|
| `favicon.svg` | tab icon on anything modern |
| `favicon.ico` | older browsers, and the `/favicon.ico` a browser requests whether or not you link one. 16/32/48, PNG-in-ICO |
| `apple-touch-icon.png` | iOS "Add to Home Screen". **Full-bleed** — iOS applies its own rounding, and ignores the manifest's icons entirely |
| `icon-192.png`, `icon-512.png` | manifest, `purpose: "any"` |
| `icon-maskable-512.png` | manifest, `purpose: "maskable"`. Full-bleed with the letter at 84%, keeping it inside the 80% safe circle Android crops to |
| `site.webmanifest` | name, `start_url: /dashboard`, `display: standalone`, theme colours |

**All of them are one drawing.** The geometry is authored in a 1024×1024 space and
shared between `favicon.svg` and the generator script that rasterised the PNGs
(`scripts/make-icons.ps1`) — change one and you must change the other, or the tab icon
and the home-screen icon stop matching.

### It is not a full PWA yet

The manifest and icons make it **installable on iOS** ("Add to Home Screen" gives a
proper icon and a standalone, chrome-less window) and give Android/Chrome everything
it needs except one thing: **Chrome will not offer its install prompt without a
service worker**. There is deliberately no service worker here — adding one to a live
app introduces cache-invalidation behaviour worth deciding on its own terms, not as a
side effect of an icon change. Until then, Android users can still install via
Chrome's "Add to Home screen" menu item, and there is no offline support.

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

## Auctions

Its own page at `/auctions` ([src/features/auctions/](src/features/auctions/)),
**not** part of the dashboard notice card anymore. This is a real, multi-tenant
feature: an event admin/committee member creates one or more auctions themselves —
title, description, prize, starting bid, minimum increment, opens/closes time, an
optional image URL. **There is no static/hardcoded auction and no default content**
— every field is entered by the person creating it, on purpose, because this app is
not built for one specific event; any event created later gets its own empty auction
list.

(Earlier versions of this feature lived inside the dashboard's News & Announcements
card, driven by a hardcoded "laddoo auction" entry in `src/data/announcements.ts`.
That entry, and the announcement fields that only existed to support it
(`art`, `auction`, `prize`), are gone. `announcements.ts` is plain text notices again.)

### Data model

Three tables, in dependency order:

1. **`auctions`** ([009_auctions.sql](supabase/migrations/009_auctions.sql)) — the
   auction itself: `title`, `tag`, `description`, `prize`, `image_url` (all
   user-entered), `starting_bid`, `min_increment`, `opens_at`/`closes_at`
   (`timestamptz`, absolute — not day-offsets from the event start; that hack existed
   only because the old system derived a window from a hardcoded notice, and is gone
   now that an admin picks the actual date/time), `status` (`active`/`cancelled`),
   `created_by`, and `is_published` (added by
   [013_auction_publish_status.sql](supabase/migrations/013_auction_publish_status.sql)
   — see "Publish / unpublish" below).
2. **`auction_registrations`** ([010_auction_registrations.sql](supabase/migrations/010_auction_registrations.sql))
   — `auction_id` is now a real `uuid references public.auctions(id)`, not a free-text
   string matching an announcement's id like it used to be.
3. **`auction_bids`** ([011_auction_bids.sql](supabase/migrations/011_auction_bids.sql))
   — same FK fix. Append-only; bids are never updated or deleted, the history *is* the
   record.

(014, for the closing page, is new and has **not** been run - see "Closing page" below.)

**Migrations 009–011 and 013 are confirmed applied to the live Supabase project**
(verified directly against it — `is_published` is present and populated on the real
auction in production). 012 (the storage bucket) was verified live earlier the same
way. Still worth a spot-check with the same technique before assuming any *new*
migration in this file has been run — none of them run automatically.

**RLS is enabled on all three with zero policies, deliberately**, the same reasoning
repeated in each migration's comments: this app authenticates through Firebase, not
Supabase Auth, so the browser's Supabase client never holds a session and `auth.uid()`
never resolves for it — a policy written against it would be dead code. All access
goes through `/api/auctions` (see "One function, three resources" below), which
uses the service-role client (bypasses RLS by design). **Do not add anon/authenticated
policies to any of the three** expecting a direct browser `supabase.from(...)` call to
work — it won't, and it shouldn't; that would remove the only enforcement these tables
have.

### One function, three resources

Auctions, bids and registrations are all served by **`api/auctions.ts`**, dispatched
on a `?resource=` query param: nothing (auction CRUD), `bids`, or `registrations`.
The bid and registration handlers live in
[api/_lib/auction-bids.ts](api/_lib/auction-bids.ts) and
[api/_lib/auction-registrations.ts](api/_lib/auction-registrations.ts) as named
exports.

**This is a deployment constraint, not a style preference.** Vercel turns every file
directly under `api/` into its own serverless function, and the plan caps how many one
deployment may have — this project sits right at that ceiling, and adding these as two
more top-level routes made the deploy fail at `Deploying outputs...` with a clean
build and no error in the build log. Anything under `api/_lib/` is underscore-prefixed
and therefore never routed, so it costs nothing.

So: **before adding a file under `api/`, count what is already there.** If the count is
at the cap, fold the new handler into a related route the same way instead of adding a
function, or replace one. Dispatch reads only the query string, never the body, so each
handler still consumes its own body normally. Two routes already carry more than one
resource this way: `api/auctions.ts` (bids, registrations) and `api/page-access.ts`
(`?resource=visibility`). `api/tasks.ts` is the third, and it exists because
`api/my-responsibilities.ts` was **deleted** to make room - its one job is now
`GET /api/tasks?resource=mine`. The count is 12 either side of that change.

New local API routes must be added to `localApiRoutes` in `vite.config.ts` or the dev
server 404s them silently via `next()`.

### Permissions

- **Browsing auctions, and watching one (chart, bid history, current bid) is public** —
  `auctions` seeds as `public` in `event_page_visibility` (an admin can narrow it; see
  "Auth and access"), and `GET /api/auctions` and `GET /api/auctions?resource=bids`
  need no token regardless — those two routes are open by design, so narrowing the
  page hides it from the nav and the route guard, not from a direct API call. `useAuctionBids`'s query
  has no `signedIn` gate and passes `{ requireAuth: false }` to `apiFetch` for that
  reason — without it, `apiFetch`'s own default refuses to even attempt the request
  without a token, which would silently defeat the point.
- **Registering, and placing a bid, need a signed-in user** — enforced server-side
  (`requireAppUser` inside the relevant branches) and by `apiFetch`'s default
  `requireAuth` behavior on those mutations.
- **Creating, editing, and cancelling an auction need `event_members.role` of `admin`
  or `committee`** — `requireCommittee()` in [api/auctions.ts](api/auctions.ts) checks
  this server-side on every `POST`/`PATCH`, not just via a hidden button client-side.
  `AuctionsPage` reads the same role via `useEventAccess()` purely to decide whether to
  show the "Create Auction" button and each card's edit/cancel icons — the actual
  authorization is the server check, the UI gate is only for not showing controls that
  would just fail.
- **The committee-only registrant list works the same way**: `GET
  /api/auctions?resource=registrations` checks the requester's role and includes `registrants`
  (full list, with phone numbers, for coordinating with bidders) only for admin/
  committee; everyone else gets `registrants: null`. This surfaces as a callout inside
  `AuctionDetailsPanel`. Do not add a client-side-only gate around registrant data —
  the server decides who gets it.

### Publish / unpublish

`is_published` (boolean, default `true`) is separate from `status`
(`active`/`cancelled`) and controls a different thing: **cancelling ends an auction
for good; unpublishing just pulls it off the dashboard and the header bell while
leaving it fully intact** — still on `/auctions`, still manageable, still
bookmarkable, registrations/bids untouched. Use it for "not ready to announce this
yet" or "pull this off the homepage for now."

- **`PATCH /api/auctions` with `action: "publish"` / `"unpublish"`**
  ([api/auctions.ts](api/auctions.ts)) — same `requireEventCommittee` check as every
  other write on this table, flips `is_published`, returns the updated row.
- **`AuctionCard`**'s manage-icon row (visible when `canManage`) gets a third icon
  (Eye/EyeOff) alongside Edit/Cancel, wired to `useAuctions().setPublished`. An
  unpublished auction also gets an amber "Unpublished" badge next to its tag —
  **only shown to `canManage` viewers**; a resident with no management rights simply
  never sees it (and never sees the auction at all, once it's off the dashboard/bell —
  it stays reachable at `/auctions` for committee, not for everyone).
- **`canManage` also gates the committee-only registrant list** inside
  `AuctionDetailsPanel` (names + phone numbers) — it used to derive that from
  `useEventAccess()` itself, now it takes `canManage` as a prop from `AuctionCard` so
  the same switch that hides Edit/Cancel/Publish on the dashboard also hides the
  registrant list there, even for a committee member. That list stays visible only on
  `/auctions`, never on the dashboard — a deliberate ask, not an oversight.
- **`/auctions` itself always shows every auction, published or not** — it's the
  management view; publishing/unpublishing only affects the two *curated* surfaces
  below. `publishedAuctions(auctions)` ([src/lib/auctions.ts](src/lib/auctions.ts))
  is the one filter both of those surfaces share.
- **Dashboard**: `DashboardAuctions` ([src/features/dashboard/dashboard-auctions.tsx](src/features/dashboard/dashboard-auctions.tsx))
  sits directly below `EventHero` in `DashboardPage` — the slot the single hardcoded
  Laddoo auction used to occupy before this became a multi-tenant feature. It is the
  same card chrome the production announcements card uses (pulse-dot + `CardTitle` +
  a `Gavel` in the header), wrapping **one `AuctionCard` at a time** with `spotlight`
  on and `canManage={false}` — view/register/bid only; editing, cancelling,
  publishing and the registrant list stay on `/auctions`. With more than one published
  auction, the production dots-left / arrows-right row appears underneath (arrows at
  40px rather than production's 32px, to clear the tap-target floor). Manual only —
  deliberately **no auto-rotate** like the announcements carousel has, since
  auto-advancing out from under someone mid-bid would blow away a half-typed amount.
  No "View all" link to `/auctions` — the sidebar/drawer already has an Auctions
  entry. Renders nothing at all when there are no published auctions — no empty-state
  card competing for space on a page that already has one.
- **Header bell**: `AnnouncementsBell` ([src/components/layout/announcements-bell.tsx](src/components/layout/announcements-bell.tsx))
  fetches the same `useAuctions(event?.id)` and lists `publishedAuctions(...)` in a
  second "Auctions" section under "News & Announcements," each row linking to
  `/auctions`. The unread pulse-dot count now includes non-closed published auctions
  alongside active announcements, so a live/upcoming auction contributes to the badge
  the same way a notice does.

### Bid rules, per auction

First bid ≥ that auction's `starting_bid`; every bid after ≥ previous highest +
that auction's `min_increment` — both read from the `auctions` row in
`api/_lib/auction-bids.ts`, not global constants (an earlier version hardcoded
₹2,501/₹100 for everyone; every auction now sets its own). The bidder must have an
active `auction_registrations` row for that auction, and the bid must fall inside
`opens_at`/`closes_at` — compared directly against those columns, no more
day-offset/timezone mirror math to keep in sync with a client-side file.

**Known gap:** reading the current highest bid and validating a new one against it is
not atomic (no DB-level lock or unique-amount constraint) — two people bidding within
the same instant could both pass validation. Low-stakes for a community auction's bid
volume; a real fix would move the check-and-insert into a Postgres function.

### Client structure

- `useAuctions(eventId)` ([src/lib/auctions.ts](src/lib/auctions.ts)) — list +
  create/update/cancel/`setPublished` mutations. `auctionRuntimeStatus(auction, now)`
  derives `"upcoming" | "live" | "closed"` from `opens_at`/`closes_at` — this replaced
  the old `auctionStatus()` that lived in `src/lib/announcements.ts` (deleted along
  with the rest of the announcement-driven auction code). `publishedAuctions(auctions)`
  is the shared filter the dashboard and bell both use (see "Publish / unpublish").
- `AuctionsPage` ([auctions-page.tsx](src/features/auctions/auctions-page.tsx)) owns a
  single ticking `now` (1s while any auction is live, 30s otherwise) shared by every
  `AuctionCard` in the grid — not one timer per card.
- `AuctionCard` ([auction-card.tsx](src/features/auctions/auction-card.tsx)) is what
  `AuctionPanel` used to be, generalized to take an `Auction` row instead of an
  announcement. **It deliberately keeps the exact visual treatment that shipped to
  production** in `aeb02bd` (the last commit before this became multi-event) — that
  design was reviewed and released, and an earlier attempt to "simplify" it here was
  rejected outright. Diff against `git show origin/master:src/features/dashboard/announcements-card.tsx`
  before changing any of it:
  - the panel is a `rounded-lg border p-2.5` block — **not** a `Card`, since both
    callers frame it themselves and a `Card` inside a `Card` doubles the border;
  - a fixed `grid-cols-[3fr_2fr]` split, copy left and the auction's image right at
    `max-h-36 object-contain` (full width when there is no image — no placeholder art);
  - solid-primary tag pill with a `animate-pulse-soft` `Sparkles`, then a "Live now" /
    "in 2 days" pill;
  - under a `border-t border-primary/20` rule: the "Online auction" eyebrow, the
    emerald pulse-ring status pill, the two-column Bidding opens/closes grid, the
    "closes in …" line, the full-width `justify-between` outline toggle, and the
    registration block.
  - `spotlight` adds the `animate-gradient-pan` background and `animate-sheen` sweep.
    Only `DashboardAuctions` passes it — one focal looping element per screen, so the
    `/auctions` grid stays plain.
  Auto-expands the details section the moment status becomes `"live"` and can still be
  collapsed manually afterward. `onEdit`/`onCancel`/`onTogglePublish` are all optional
  — only `AuctionsPage` (the management view) wires them; the dashboard's read-only
  instance passes `canManage={false}` and none of the three.
- `AuctionDetailsPanel` ([auction-details-panel.tsx](src/features/auctions/auction-details-panel.tsx))
  holds the chart, bid history, place-bid form, and the committee registrant callout.
  **Lazy-loaded** (`React.lazy` in `auction-card.tsx`) — it pulls in `recharts`,
  ~385KB, and there is no reason to ship that to every visitor browsing the list who
  never expands a card. Fully self-contained (calls `useSession`, `useEventAccess`,
  `useAuctionRegistration`, `useAuctionBids` itself) rather than taking those as props
  — keep any future chart-heavy addition inside this lazy boundary, don't let a static
  import drag `recharts` back into the main bundle.
- `AuctionHowItWorksDialog` ([auction-how-it-works-dialog.tsx](src/features/auctions/auction-how-it-works-dialog.tsx))
  is a **separate, ordinary (eagerly-loaded) dialog**, deliberately not a second view
  bundled inside the details panel, so opening it never pulls in `recharts`. Its copy
  is generated from the specific `auction` passed in (starting bid, increment, prize)
  — nothing hardcoded.
- `AuctionFormDialog` ([auction-form-dialog.tsx](src/features/auctions/auction-form-dialog.tsx))
  is create **and** edit — pass an `auction` prop to edit, omit it to create. Only
  rendered for admin/committee (`AuctionsPage` conditionally mounts it). Its image field
  is upload **or** paste — see below. A committee member with neither gets a generic
  icon fallback in `AuctionCard`, never a hardcoded illustration.

### Image uploads

Real Supabase Storage, not a URL-only field — built generically on purpose (the ask
that produced it was explicitly "later we will also need this for event photographs
too"), so treat `/api/uploads` and `useImageUpload()` as shared infrastructure, not
an auction-only detail.

- **Bucket:** [012_uploads_bucket.sql](supabase/migrations/012_uploads_bucket.sql)
  creates a single public bucket named `uploads` (`insert into storage.buckets`, not a
  table migration — same "check whether this has actually been run" caveat as every
  other migration here). Objects are organized by folder prefix:
  `auctions/<uuid>.<ext>` today. Reads are public because the bucket itself is marked
  `public: true` — no `storage.objects` RLS policy needed or present. **All writes go
  through `/api/uploads`** ([api/uploads.ts](api/uploads.ts)) using the service-role
  client, the same bypass-RLS pattern as every table in this app; do not add
  anon/authenticated storage policies expecting a direct browser
  `supabase.storage.from("uploads").upload(...)` call to work.
- **Base64-in-JSON, not multipart.** The client reads the file with `FileReader` into a
  data URL and posts it as a normal JSON field (`useImageUpload()` in
  [src/lib/uploads.ts](src/lib/uploads.ts)); the server decodes it back to a `Buffer`.
  This was a deliberate simplicity choice — every other API route in this app is
  already plain JSON (`getRequestBody` just does `JSON.parse`), and adding multipart
  parsing for one feature would mean a new dependency and a second body-handling path.
  **The tradeoff is a hard 4MB file cap** (`MAX_BYTES`, enforced both client- and
  server-side) — base64 inflates a file by ~1/3 inside the JSON body, and serverless
  functions have body-size limits to stay under. Fine for a single photo; if this grows
  into a real photo-gallery feature with many/large images, switch to true multipart or
  a signed direct-to-storage upload instead of raising this cap.
- **Folder allowlist, not a free-text path.** `ALLOWED_FOLDERS` in `api/uploads.ts` is
  checked server-side — the client cannot write to an arbitrary storage path. Add a new
  entry there (and decide its own permission check, see next point) before wiring up a
  second upload surface.
- **Permission:** every folder currently requires `event_members.role` of `admin` or
  `committee`, via the same `requireEventCommittee()` now shared in
  [api/_lib/server.ts](api/_lib/server.ts) (also used by `api/auctions.ts` — it used to
  be a local copy there; promoted to the shared file when uploads needed the identical
  check, to avoid a second copy drifting out of sync). **When event-photo upload is
  built, decide its permission model explicitly** rather than assuming every member can
  upload just because auctions required committee.

## Tasks

`/tasks` ([src/features/tasks/](src/features/tasks/)) is a small JIRA-shaped board:
an admin (or a member with edit access to Tasks) creates a task, assigns **one or
more** people to it, and everyone on it talks in a comment thread attached to it.

**Sign-in only, deliberately.** A task list names people and carries their
conversation with each other, so there is no signed-out view of it — not a partial
one. Three separate things enforce that:

- `signInOnlyPages` in [api/_lib/page-visibility.ts](api/_lib/page-visibility.ts) —
  `tasks` normalises `public` down to `authenticated` on both read and write, so the
  stored setting can never claim otherwise;
- `signInOnlyPageKeys` / `visibilityOptionsFor()` in
  [src/lib/page-access.ts](src/lib/page-access.ts) — Settings → Page Visibility does
  not offer "Anyone with the link" for this page at all;
- `requireAppUser` at the top of **every** branch of [api/tasks.ts](api/tasks.ts).

An admin still chooses between "any signed-in user" (the default) and "only members I
give access to". The default is `authenticated`, not `restricted`, so a committee
member can open Tasks and see what is on them without being granted the page one by
one.

### Data model

[016_task_collaboration.sql](supabase/migrations/016_task_collaboration.sql) adds two
tables next to the existing `tasks` table:

- **`task_assignees`** — `(task_id, user_id)` primary key, plus `assigned_by` /
  `assigned_at`. Many people per task is the point; a task with two owners is normal.
- **`task_comments`** — `task_id`, `user_id`, `body`, `created_at`. Append-only in
  practice: there is no edit or delete UI, the thread is the record.

**`tasks.owner_name` (free text) is not dropped and not migrated.** A typed name
cannot be resolved to an account reliably, so old rows keep it and `AssigneeStack`
falls back to showing it as "Owner: …" when a task has no real assignees. New
assignment goes through `task_assignees` only.

RLS is enabled on both **with zero policies**, the same deliberate choice as the
auction, upload and page-visibility tables — Firebase auth means `auth.uid()` never
resolves for the browser's Supabase client. Everything goes through `/api/tasks` with
the service-role client. Do not add anon/authenticated policies.

**The migration has not been run.** Until it is, `/api/tasks` degrades: the task list
still loads, with no assignees and `commentCount: 0`, and returns
`collaborationReady: false`. The page shows an amber banner naming the migration
rather than looking broken, and assigning or commenting returns a 501 that names it
too. This is the same "read degrades, write says so" shape as
`event_schedule.sub_events`.

### One function, three resources

Everything is [api/tasks.ts](api/tasks.ts), dispatched on `?resource=`: nothing (the
board), `mine` (the dashboard card), `comments`. **This route replaced
`api/my-responsibilities.ts`** rather than being added alongside it — see the Vercel
function-cap note above; the count is 12 either side.

### Permissions, three tiers

- **View** follows the admin's page visibility exactly as every other page does
  (`resolveTaskAccess` in `api/tasks.ts`), except that `public` can only ever mean
  "any signed-in user" here.
- **Comment** needs only view access. That is the point: an assignee who cannot edit
  the task must still be able to say something on it.
- **Manage** (create, edit, assign) needs `admin`, or an `edit` grant on the `tasks`
  page in Member Access — the same switch every other screen's editing uses.
- **Status is its own rule, narrower than manage and not implied by it: `admin` or
  someone actually assigned to that task.** A committee member with edit access can
  create and rewrite tasks but cannot declare someone else's work done — that call
  belongs to the person doing it. `PATCH` enforces this on the `statusOnly` path *and*
  on a full edit (which silently keeps the stored status if the editor may not change
  it); `TaskFormDialog` therefore renders Status read-only in that case rather than
  offering a control the server would ignore.
- **Deleting is `admin` only.** Everyone else retires a task by marking it `Cancelled`
  or `Invalid` — deleting takes the comment thread with it, and a board that loses
  items without trace is worse than one with a few struck-through rows. `Invalid`
  ("this should not have been raised") needs
  [017_task_invalid_status.sql](supabase/migrations/017_task_invalid_status.sql),
  which widens the `tasks_status_check` constraint the same drop-and-recreate way
  005 did for contributions.

### Client structure

- `useTaskBoard(eventId)` ([src/lib/tasks.ts](src/lib/tasks.ts)) — the board plus
  `create` / `update` / `setStatus` / `remove`. **Tasks do not come through
  `useEventData()`** and cannot: assignees and comments are behind RLS with no
  policies, so the browser's Supabase client cannot read them. `useMyTasks` backs the
  dashboard's "My Responsibilities" card, which now resolves by real assignment
  instead of matching the signed-in person's name against `owner_name`.
- `useTaskComments(taskId, enabled)` is gated on the card being open. A board of
  thirty collapsed cards makes **zero** comment requests — the counts on their headers
  come from `task_comments(count)` embedded in the board response.
- **The page is cards at every width, not a table.** The old table needed
  `min-w-[760px]` and sideways scrolling on a phone. `TaskCard` is **two rows** —
  title + status on one, then priority / due / category / comment count / assignee
  faces with the edit, delete and expand controls pushed right on the other — and
  description, the full assignee list and the thread sit behind the chevron in
  `TaskDetailsPanel`. Keep that split when adding anything: header = scannable,
  panel = everything else, and do not spend a new row on something that fits in the
  meta line. Two things earn their compactness specifically: the status control **is**
  the badge (a `<select>` wearing the badge's palette) rather than sitting beside one,
  and the expand affordance is the chevron rather than its own full-width button.
  `TaskCard` is used only by `tasks-page.tsx`, so that treatment is local to this
  screen — no other page renders a task card.
- **The count tiles are one row at every width** (`grid-cols-4`), with short labels
  and the icon dropped below `sm`. Four short counts read as a single glance; two rows
  of two read as two separate things to parse.
- **"Assigned to you" is its own section above everything else**, not a filter someone
  has to find. Within each section the order is `byUrgency`: Critical first, then
  earliest due date, undated last.
- `TaskFormDialog` is create **and** edit (pass a `task` prop to edit). Its assignee
  picker is a list of toggle buttons, not a `<select multiple>` — a multi-select is
  close to unusable on a phone.

## Closing page

`/closing` ([src/features/closing/](src/features/closing/)) - what the celebration
added up to once it is over: the committee's thank-you note, the credits, the
photographs, and residents' reviews. **Public by default** (`closing` seeds as `public` in
`event_page_visibility`; see "Auth and access") - a resident opens the link and reads
it without an account, unless the event admin narrows it in Settings.

### Data model

[014_event_closing.sql](supabase/migrations/014_event_closing.sql) adds three tables.
**It has not been run** - like every migration here, the user applies it by hand
(README -> Supabase); until then the page renders its generated summary and the
gallery/reviews come back empty.

- **`event_closing`** - one row per event: `headline`, `message`, and `is_closed`.
- **`event_gallery_photos`** - `image_url`, `caption`, `album`, `sort_order`.
- **`event_feedback`** - `rating` 1-5 + `comment`, `unique (event_id, user_id)`, which
  is what makes "write or edit my review" one upsert.

RLS is enabled on all three **with zero policies**, the same deliberate choice as the
auction tables - Firebase auth means `auth.uid()` never resolves for the browser's
Supabase client, so a policy against it would be dead code. All access goes through
the API below with the service-role client. Do not add anon/authenticated policies.

### `is_closed` is not "the end date has passed"

`getEventPhase` already turns the hero badge Upcoming -> Live now -> Completed from the
event's dates. `is_closed` is a separate, committee-controlled switch, because a
committee is still collecting photos and writing the note for a week afterwards and the
closing page should not take over the dashboard until they say so. Flipping it (the
control lives on `/closing`, admin/committee only, and is reversible):

- puts `ClosingDashboardCard` directly under the hero, and
- moves the Financial Summary / Funding Progress row **below** the schedule instead of
  above it - after the event, "how did it go" outranks "what is still unfunded".
- forces the hero badge to Completed even if the dates say otherwise.

### API - no new serverless function

The three resources are served by **`api/events.ts`** dispatched on `?resource=`
(`closing`, `gallery`, `feedback`), with the handlers in
[api/\_lib/closing.ts](api/_lib/closing.ts). Same reason as `api/auctions.ts`: this
project is at the Vercel function cap, and `api/_lib/` is never routed. A request with
no `resource` is still the original create-an-event POST. `/api/events` was already in
`localApiRoutes`, so `vite.config.ts` needed no change.

- `GET` is public and returns everything in one round trip (note, credits, gallery,
  feedback). A token is sent when there is one, which is only how the server marks
  which review is `mine`.
- The note, and every gallery write, need `requireEventCommittee`.
- A review needs a signed-in user and is addressed by `(event_id, the caller's own
  user id)` - never an id the client sends - so nobody can edit anybody else's.

**Privacy:** the credits list returns **names only** - no email, no avatar, no role -
because this page is public and the ask was to credit people, not to publish a
directory. Review authors carry their avatar because they chose to post under their own
name. Contact details and payment references stay off it, same as the dashboard; the
contributor and sponsor lists here are names with no amounts beside them.

### Client structure

- `useEventClosing(eventId)` ([src/lib/closing.ts](src/lib/closing.ts)) - the one query
  plus every mutation. `groupByAlbum` is the shared album grouping.
- The thank-you note is **generated from the event's own numbers** when the committee
  has not written one (`defaultClosingMessage` in
  [closing-copy.ts](src/features/closing/closing-copy.ts)), so the page is never a blank
  box and never credits the wrong people. Clearing the message box goes back to it.
- `ClosingStory` / `ClosingStats` / `ClosingDashboardCard` / `ClosingRatingStrip` all
  live in [closing-summary.tsx](src/features/closing/closing-summary.tsx) - the
  dashboard card and the page share them so the two never drift.
- Captions print **over the bottom of their own photo** on a gradient, in `.font-display`
  (the Playfair face the countdown uses, without the tabular figures) - a deliberate
  ask, not a styling accident.
- Photo uploads reuse `/api/uploads` and `useImageUpload()` with the new `closing`
  folder (committee-only, decided explicitly - see the note in `api/uploads.ts`).
- `GalleryPreview` on the dashboard is a window onto the same photos, not a second
  gallery to manage.

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
