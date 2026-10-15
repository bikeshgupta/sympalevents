# Platform Control Center - discovery and implementation plan

Owner-only analytics inside Sympal Events at `/platform/analytics`. Nothing in the app links to it; the server
decides who may read it. Written 2026-10-15 from the repository as it stands on `master` (caabf43).

## 1. What the repository already gives us

| Area | Finding | Consequence |
|---|---|---|
| Routing | `src/app.tsx`, react-router v6. Pages outside an event (`/society/...`, `/profile`) sit under `PageTurnOutlet`, not `AppLayout`. No catch-all route: an unknown address renders nothing. | `/platform/analytics/*` mounts beside `/society`, outside `AppLayout`. It draws its own "Page not found". |
| Bundle | One JS chunk today (Vite warns it is over 500 kB). | The platform UI is `React.lazy`, so residents never download it. A small gate decides first. |
| API | 12 functions under `api/` = the Vercel plan's cap. `api/events.ts` dispatches `?resource=`; Society Management is `resource=societies&part=...`. `tests/api-resources.test.mjs` fails if the client calls a resource no route handles. | One new resource, `?resource=platform&part=...`, in `api/events.ts`. No new file under `api/`. |
| Auth | Firebase ID token verified in `api/_lib/server.ts` (`verifyFirebaseIdToken`, jose). `requireAppUser()` **upserts `app_users` on every call**. | The platform guard verifies the token and **reads** `app_users` by `firebase_uid`; it never calls `requireAppUser`. |
| Roles | `organization_members.role` / `event_members.role` = `admin` / `committee` / `read_only`; `api/_lib/authority.ts` answers who outranks whom. | Platform access is a separate allowlist (`PLATFORM_ADMIN_USER_IDS`), never derived from these roles. |
| Event status | `shared/event-status.ts` `getEventStatus()` (draft and cancelled overrides, `event_closing.is_closed`, IST hours). Society Management already imports it server-side. | Import it directly. No second set of status rules. |
| Design | Warm paper `--background`, teal `--primary`, gold `--chart-budget`, Playfair Display via `.font-display`, lucide line icons, Radix dialog and dropdown, `menuGlass` / `overlayGlass`. Society Management's Overview is "type, spacing and hairlines, not cards". | Reuse the tokens and primitives. No new colours, no new dependency. |
| Mobile nav | The app's convention is a right-hand drawer behind a round button fixed bottom-right (UI rules §5). | The platform uses the same pattern, plus a compact top bar. No sideways-scrolling rail. |
| Tests | `npm test` = `node --test tests/*.test.mjs`. 97 pass. Tests import `.ts` from `shared/` and `src/` directly (Node 22 type stripping), which only works for files without `.js` relative imports. | Pure logic (access decision, date windows) goes in `shared/`, so it can be tested without a network. |
| Lint / types | Baseline: `eslint .` reports 32 existing problems; strict `tsc` over `api/` reports 4 existing errors (`api/event-members.ts`). `npm run build` passes. | New files must add zero to either count. |
| Working agreement | Local branch only. Never commit to `master`, never push (`master` deploys to production). No migration unless the feature needs storage, and the owner runs every migration by hand. | Phase 1 needs no migration. |

### Data that exists, by migration (production state per CLAUDE.md)

| Source | Migration | In production | Time column | Gives us |
|---|---|---|---|---|
| `app_users` | 003 | yes | `created_at` | sign-ups; directory |
| `organizations`, `organization_members` | 001/023 | yes | `created_at` | societies; joins (023 backfill rows carry the day 023 ran; removals are deletes, so leavers are invisible) |
| `events`, `event_closing`, `event_members` | 001/014/003 | yes | `created_at` | events, status, roles |
| `event_registrations` | 032 | yes | `created_at` | bookings, payment states |
| `contributions` | 001/005 | yes | `created_at` | event money (never platform revenue) |
| `event_visits` | 028 | yes | `started_at`, `last_seen_at` | visits, signed-in people (`user_id`), device, browser, city, browser key. Event pages only. Rows older than ~90 days before the traffic.ts fix may have been deleted. |
| `audit_log`, `event_page_views` | 030 | **appears not applied** | `occurred_at`, `opened_at` | actions with before/after; page sequence |
| `event_visits.surface`, `app_users.last_seen_at` | 045 | not applied | - | activity beyond event pages |
| `event_proposals` | 043 | not applied | `submitted_at` | proposals |
| `event_role_history` | 046 | not applied | `ended_at` | role at the time, removals |

The `sources` probe (section 4) checks every one of these at request time, so the UI never relies on this table
being current.

## 2. Architecture

```
/platform/analytics/<section>            React, lazy chunk, outside AppLayout
  PlatformGate (main bundle, tiny)       signed in? -> GET platform&part=session -> 404 => "Page not found"
  PlatformApp (lazy)                     shell: sidebar / top bar + drawer, header, date range, sections

GET /api/events?resource=platform&part=<part>&range=<preset>
  handlePlatform (api/_lib/platform.ts)  GET only -> checkPlatformAccess -> part handler -> JSON with observedAt
  checkPlatformAccess (shared/platform-access.ts, pure, tested)
     no token | bad token | no app_users row | not listed | no admins configured  => 404 {"error":"Not found"}
```

- **Authorization**: `PLATFORM_ADMIN_USER_IDS` (server-only env var, comma-separated `app_users.id`). An empty or
  missing list admits nobody. Every refusal is the same 404 body, whatever the reason. The reason is logged
  server-side as one JSON line (`platform_access_denied`, reason, part, user id when known, never the token or
  IP). The resource name is visible in the app's JavaScript; the check, not the name, is the protection.
- **Read-only**: the platform module makes no insert, update, upsert, delete or rpc call (tested).
- **Minimum data**: every select names its columns; never `phone`, `flat`, `share_token`, `pass_token`,
  `contact_name`, `payment_reference` (tested).
- **Time**: all windows are IST calendar days (`shared/platform-range.ts`). A window is `[from, to)` in UTC instants
  at IST midnight. The previous window has the same length and ends where the current one starts.
- **Honesty**: every response carries `observedAt`. A part that cannot be answered says `unavailable` with the
  reason and what would make it available. It never returns 0 instead.

## 3. Data contracts (per section)

Legend: **O** observed in a table, **D** derived from observed rows by a written rule, **U** unavailable today.

| Section | Metric | Source and rule | Kind | Coverage notes |
|---|---|---|---|---|
| Overview | Registered users | `count(app_users)`; new = `created_at` in window | O | complete |
| | Active societies | event created in window, or an event on during window (not draft/cancelled), or a member joined, or an event page visited, in window. Labels: New (created in window), Active, Quiet (nothing in window, something in 90 days), Dormant (nothing for 90 days), Empty (no events, no members besides the creator). `societyFacts()` in `shared/platform-metrics.ts` | D | joins carry the 023 backfill caveat |
| | Events | `count(events)`; status via `getEventStatus()` now | O/D | status is a snapshot; past status is never rebuilt |
| | Active people | distinct `event_visits.user_id` whose visit overlaps the IST window (DAU 1 day, WAU 7, MAU 30); per-day series counts each day separately and a week shows the daily average, never a sum | O | event pages only; days before the first `event_visits` row are blank, not 0 |
| | Activity chart | sign-ups/day, visits/day, comparison = previous window | O | visits since first row |
| | Publications trend | `audit_log` rows `action='publish'` | U | needs 030 |
| | Recent activity | `audit_log` | U | needs 030 |
| Users | Directory | `app_users` (id, full_name, email, photo_url, created_at); counts from `organization_members`, `event_members` | O | |
| | Last activity | max `event_visits.last_seen_at` for the user | O | "No recorded visit" is unknown, not inactive |
| Societies | Directory, members, events | `organizations`, `organization_members`, `events` | O | members = current; leavers not recorded until 046 |
| Events | Directory, status, bookings, visits | `events`, `event_closing`, `event_registrations` (status active), `event_visits` | O/D | bookings all time; visits in window |
| | Event record | bookings by `payment_status` (counts only, no amounts), people (adults + children), visits by day and device | O | contributions are the society's, never platform revenue |
| Activity & Audit | Actions | `audit_log` | U | needs 030 |
| | Visits | `event_visits` | O | |
| | Page sequence | `event_page_views` | U | needs 030 |
| | Access attempts | server log lines today; a table needs a migration (Phase 3) | U | |
| Analytics | Traffic, devices, cities | `event_visits` | O | groups under 5 merged |
| | Retention | signed-in `event_visits` by sign-up month | D | event pages only |
| | Event money | `contributions` by status | O | never called revenue |
| System | Deployment | `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_REGION` | O | absent locally |
| | Database | one timed read from the platform API | O | |
| | Data sources | row count, first and last timestamp per table | O | |
| | Vercel / Supabase monitoring | not connected | U | needs API tokens (Phase 4) |

## 4. Phases

**Phase 1 - Foundation (this change)**
- `shared/platform-access.ts`: allowlist parsing and the access decision, dependency-injected and tested.
- `shared/platform-range.ts`: IST presets (7d, 30d, 90d, 12m), previous window, labels; tested.
- `api/_lib/platform.ts`: `handlePlatform`, parts `session` and `sources`; wired as `resource=platform` in
  `api/events.ts`.
- `src/features/platform/`: gate, not-found, lazy app, shell (desktop sidebar, mobile top bar + right drawer),
  page header with the date range, data-state blocks (loading, empty, unavailable, error with a real retry), the
  System section's real data, and the six other sections as honest "next" pages that list the data they will use
  and whether it exists now.
- Tests: access decision, date windows, and static boundaries (no link to `/platform` outside the platform
  folder, platform API read-only, no forbidden columns, no `select("*")`, guard before dispatch, platform queries
  never persisted to `localStorage`).

**Phase 2 - Overview, Users, Societies, Events** (built)
- `shared/platform-metrics.ts` (pure, tested): IST day buckets, active people, comparisons, status tally, the
  society labels, and validation of search text, page numbers, choices and ids.
- `api/_lib/platform-reads.ts`: parts `overview`, `users`, `user`, `societies`, `society`, `events`, `event`.
  Reads are bounded (pages of 1,000 up to a cap per table) and a capped read is reported as partial. One
  5-second limit per request. Unknown or malformed ids answer the same 404 as everything else.
- Pages: each figure opens its list with the filter applied; lists keep search, filters, sort and page in the
  address; a person, society or event opens in a read-only drawer (`?user=`, `?society=`, `?event=`) that
  survives a refresh and closes with Back or Escape. Charts compare with the previous period as a dashed line and
  have a Table view; weeks replace days beyond 92 days.
- Not built here: festival markers on the activity chart (no festival calendar in the data), events published
  (needs 030), members leaving (needs 046).

**Phase 3 - Activity & Audit, Analytics.** Audit and page views light up when 030 is confirmed. Prepared
migration for `platform_access_log` (insert-only, no IP), delivered for manual review and not applied.

**Phase 4 - System monitoring and quality.** Vercel and Supabase APIs only if tokens are provided, plus a
responsive, accessibility, pagination and query-cost pass.

## 5. Setting it up (owner)

1. Find your `app_users.id` (Supabase SQL editor, read-only):
   `select id, email from public.app_users where email = '<your Google email>';`
2. Add `PLATFORM_ADMIN_USER_IDS=<that id>` to `.env` locally and as a Secret in Vercel.
3. Sign in to Sympal Events as usual, then type `/platform/analytics` in the address bar.

Anyone else, signed in or not, sees "Page not found", and the API answers 404.
