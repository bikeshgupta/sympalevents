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
function. Dispatch reads only the query string, never the body, so each handler still
consumes its own body normally.

New local API routes must be added to `localApiRoutes` in `vite.config.ts` or the dev
server 404s them silently via `next()`.

### Permissions

- **Browsing auctions, and watching one (chart, bid history, current bid) is public** —
  `auctions` is in `publicPageKeys` ([page-access.ts](src/lib/page-access.ts)) and
  `GET /api/auctions` and `GET /api/auctions?resource=bids` need no token. `useAuctionBids`'s query
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
  No "View all" link to `/auctions` — the sidebar/bottom-nav already has an Auctions
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

## Self-service UPI contributions

A resident can pay the committee from their own phone: **Contribute now** →
capture their details → their UPI app (PhonePe / Google Pay / anything) opens
with the amount pre-filled → the committee confirms the payment against the
account, and only then does it become a row in Contributions.

**There is no payment gateway and no merchant account here, and the whole design
follows from that.** A `upi://pay` intent link hands control to another app and
never reports back to the browser, so the app *cannot* know whether the transfer
succeeded. Anything that claimed otherwise would be putting made-up money on the
dashboard. So every attempt is recorded before the hand-off, the payer is asked
afterwards how it went, and a committee member makes the call.

### Setup

`VITE_UPI_ID` (and optionally `VITE_UPI_PAYEE_NAME`) in the environment - see
`.env.example`. **Until `VITE_UPI_ID` is set, every entry point renders
nothing**: `isUpiConfigured` in [src/lib/upi.ts](src/lib/upi.ts) gates the
button on both screens and the review panel, so a deploy without it behaves
exactly as before this feature existed. The VPA is public config (it is the
string printed on a payment QR code), not a secret - hence a `VITE_` value.

Migration [014_contribution_payments.sql](supabase/migrations/014_contribution_payments.sql)
adds the table. **It has not been run** - like every migration here, the user
applies it by hand (README → Supabase). Until then, starting a payment fails
with a Supabase error; nothing else on the app is affected.

### Statuses, and what each one means for the numbers

| status | meaning | in `contributions`? |
|---|---|---|
| `initiated` | link opened, we never heard back | no |
| `awaiting_confirmation` | the payer says they paid - still just a claim | no |
| `confirmed` | committee matched it against the account | **yes** |
| `rejected` | reviewed, not accepted | no |
| `cancelled` | the payer told us they did not complete it | no |

`initiated` rows stay in the queue on purpose: someone who pays and then closes
the tab would otherwise vanish, and the committee would find money in the
account with nothing to attach it to.

### Where it writes

`applyConfirmedPayment()` in
[api/_lib/contribution-payments.ts](api/_lib/contribution-payments.ts) is the
**only** place this feature touches `contributions`, and it runs on confirm
only. A flat that already has a contribution row gets topped up (`received`
goes up, `expected` is left exactly as the committee set it, mode `UPI`,
status `Received`, the reference appended). A flat new to the list gets a
`residents` row and a `contributions` row created with **`expected` set equal
to what they paid** - there is no other figure to go on, and inventing a
per-flat default server-side would bake one society's convention into a
multi-tenant app. Flat matching is `ilike`, so "a-101" does not become a second
resident next to "A-101".

### API

**`/api/events?resource=contribution-payments`** - folded into the events route
for the same reason auctions has three resources in one function: Vercel counts
every file under `api/` as a serverless function and this project is at the
plan's cap. The handler is in `api/_lib/`, which is never routed.

- `POST` is **deliberately unauthenticated** - the dashboard is a public page
  and a resident should not need an account to contribute. It only records an
  unverified claim; a signed-in payer gets `app_user_id` attached as a bonus.
- `PATCH` with `action: "reported" | "cancelled"` is the payer's own answer,
  authorized by `paymentId` **and** the server-generated `reference` - that
  pair is the capability token, which is what stops one resident closing out
  another's payment. It is refused once the committee has reviewed the row.
- `PATCH` with `action: "confirm" | "reject"` and `GET` require admin/committee
  via `requireEventCommittee`. The queue holds residents' phone numbers, so
  that check is server-side, not a hidden button.

### Client

- [src/lib/upi.ts](src/lib/upi.ts) - config + `buildUpiUrl()`. Every parameter
  is percent-encoded through `URLSearchParams`; a raw `&` in a payee name would
  silently truncate the amount. `upi://` is the link that always works - the
  PhonePe/GPay/Paytm schemes are there because residents ask for those apps by
  name, not because they do anything different.
- [src/lib/contribution-payments.ts](src/lib/contribution-payments.ts) - the
  hooks, plus `commonExpectedAmount()`, which reads the quick-pick chip amounts
  off the event's own rows (the most common `expected`, not the average) rather
  than hardcoding ₹501/₹1100-style presets.
- [contribute-dialog.tsx](src/features/contributions/contribute-dialog.tsx) -
  the three-step payer flow. Step 2 is the hand-off, and its copy never says
  the contribution is recorded, only that it is pending confirmation. On
  desktop it shows the VPA to copy instead of app buttons that would do nothing.
- [pending-payments-panel.tsx](src/features/contributions/pending-payments-panel.tsx)
  - the committee queue on `/contributions`, rendered only for `canEdit`.
- **The one payer entry point is the dashboard** - a callout inside the Funding
  Progress card. Deliberately *not* on `/contributions`: that page needs a
  login, so a resident could never reach it, and Contributions is the
  committee's ledger rather than a place anyone pays from. It hides itself
  without a `VITE_UPI_ID` **or** without a selected event id, which is also why
  demo mode shows no button (`demoEvent` has no id, so there would be nothing
  to attribute a payment to). `/contributions` carries only the committee's
  review queue.

**Known gap:** confirming twice in two tabs would apply the amount twice - the
read-then-write in `applyConfirmedPayment` is not atomic, the same tradeoff
already documented for auction bids. The status guard makes it a narrow window
and the volume here is a few payments a day.

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
