# Society Events Platform — architecture

How SymPal Events is arranged as a platform: a society, its events, and the
modules each event turns on.

> **Read this first if you are new to the repo:** most of the platform
> architecture described here was built before this iteration. The section
> "What already existed" says exactly what, so nobody rebuilds it.

---

## What already existed

Shipped on 2026-09-30 (`2227773`), ten phases. None of it was new work in this
iteration:

| Capability | Where |
|---|---|
| Society as a real tenant | `organizations`, `organization_members`, `api/_lib/societies.ts`, `SocietyCard` |
| Pages as per-event modules | `event_page_visibility.is_enabled`, `fetchEventModules()` |
| Event types | `events.event_type` — festival / sports / cultural / mixed / custom |
| Templates | `src/data/event-templates.ts`, five, each with a `ModuleSeed[]` |
| Creation wizard | `src/features/onboarding/create-event-wizard.tsx` |
| Per-event vocabulary | `useVocabulary()` / `labelFor()` |
| Dashboard widgets | `src/lib/widgets.ts`, `widget-host.tsx`, admin-arranged |
| Per-event appearance | `events.theme`, `hero_image_url` |
| Share links | `events.share_token`, `/s/:token` |
| Sports pack | `event_teams`, `event_fixtures` |
| Money, closing, tasks, prasad, auctions, notices | their own feature folders |

Two things are commonly assumed about this repo and are **not true**:

- **There is no Firestore.** Firebase provides Google sign-in only
  (`src/lib/firebase.ts`). All data is Supabase Postgres, reached through
  `/api/*` with the service-role client.
- **No society name is hardcoded in application code.** "TRU WindChimes"
  appears only in `src/data/demo.ts` and `supabase/seed.sql`, both of which are
  demo/seed material. Society identity comes from the `organizations` row.

## What this iteration added

Society Home, the status model behind it, and per-event announcements.

---

## Status model

**One helper, `getEventStatus()` in [src/lib/event-status.ts](../src/lib/event-status.ts),
is the only thing in the app that decides what state an event is in.**

It returns `draft | upcoming | live | completed | cancelled`, by this
precedence:

| | Rule | Result |
|---|---|---|
| 1 | `status_override === "draft"` | **draft** |
| 2 | `status_override === "cancelled"` | **cancelled** |
| 3 | `isClosed === true` | **completed** |
| 4 | `now > endDate` | **completed** |
| 5 | `now < startDate` | **upcoming** |
| 6 | otherwise | **live** |

### Only two states are stored

`events.status_override` (029) holds `draft`, `cancelled`, or NULL. Everything
else is derived from the dates, so no committee has to remember to flip a
switch for an event to become live or completed on time. The column is named
for what it is — an override of the derived answer, not a parallel state
machine. The legacy `events.status` column (001, defaults `'planning'`) is
untouched and unread; it predates all of this.

### `is_closed` is preserved, and still means what it meant

`event_closing.is_closed` is the committee's own "we have wrapped up" switch,
flipped on `/closing`. It is **not** "the end date has passed" — that is rule 4.
It is deliberately independent of the calendar in both directions: a committee
is often still collecting photographs a week after the end date and does not
want the closing page taking over the dashboard yet, and may equally wrap up
early.

So rule 3 is an **OR** with rule 4, never a replacement: an event past its end
date reads completed whether or not anyone flipped the switch, and a closed
event reads completed whether or not the dates agree. Nothing about what
`is_closed` does on the dashboard changed — it still drives the hero badge and
the closed layout exactly as before.

### No second calculation anywhere

`getEventPhase()` in `dashboard-utils` still returns `before | during | after`
for the dashboard widgets, but it is now a three-line adapter over `datePhase()`
in the same module. The event timezone primitives (`toEventZoneTimestamp`,
`getDateInEventZone`) moved there too and are re-exported from `dashboard-utils`,
so no existing import changed. There is exactly one place in the app that
compares an event date to the clock.

---

## Routing

Additive. **Nothing that worked before was moved or removed.**

| Route | Meaning |
|---|---|
| `/` | `SocietyRoot` — a member goes to their society; otherwise the dashboard, as before |
| `/society` | the viewer's own society, resolved server-side |
| `/society/:societySlug` | a named society |
| `/e/:eventId/<page>` | unchanged — every existing link, bookmark and share token still resolves |
| `/<page>` | unchanged |
| `/s/:token` | unchanged |

`/` is deliberately not built around one society: `SocietyRoot` asks how many
the viewer has. When a second appears, the `> 1` branch becomes a chooser and
nothing else moves.

Society Home links to events by **id** (`/e/<id>/dashboard`), the address that
has always worked. Slugs exist in the data from 029 but no route depends on
them yet, so the slug route can be introduced later without touching this page.

### Slugs

- `organizations.slug` — globally unique; it is the first path segment.
- `events.slug` — unique **within a society** (`unique(organization_id, slug)`),
  because two societies both running a `diwali-2026` is normal.
- Both are backfilled from existing names by 029, with `-2`, `-3` appended on
  collision in creation order, so the oldest row keeps the clean slug. Nothing
  has to be typed by hand and no existing row changes meaning.

---

## Society Home

[src/features/society/](../src/features/society/) — small pieces, no large page:

| File | Job |
|---|---|
| `society-home-page.tsx` | assembles; owns the tabs and one clock |
| `society-header.tsx` | name, place, logo — **all from the `organizations` row** |
| `featured-event.tsx` | the lead card |
| `event-card.tsx` | one card for every kind of event |
| `event-status-chip.tsx` | the five-state chip |
| `event-presentation.ts` | pure helpers — CTA, date range, featured pick |
| `society-root.tsx` | what `/` means |

It is a community events board, not a dashboard: one lead event, then three
short lists. No stat tiles, no charts, no admin controls — managing an event
happens inside it.

### One EventCard, never one per type

There is deliberately no `SportsEventCard` or `FestivalEventCard`. What a card
says is decided by three inputs, never by the event's name:

- `eventType` — what kind of thing it is
- `getEventStatus()` — where it is in its life
- `modules` — what this event has, **for this viewer**

and then by whether the number is non-zero. A completed festival leads with its
rating and photographs; a sports event leads with its teams; an event with
neither says nothing about either rather than printing a row of zeros. The call
to action follows the same rule — "Relive the event", "View tournament",
"Continue setting up" — never a flat "View Event".

### The featured event is derived, never named

`pickFeaturedEvent()`: a live event first, else the nearest upcoming, else the
most recently completed so a society between events still leads with something.
Draft and cancelled are never featured. It is excluded from the list below it,
so there is one card and one CTA per event.

### Grouping

`groupForStatus()` puts live events in **Ongoing**, completed in **Past**, and
everything else with its dates — so a cancelled event stays where people expect
to find it rather than disappearing into Past. Upcoming sorts soonest first,
Past most recent first.

---

## Access control

Decided server-side in [api/_lib/society-home.ts](../api/_lib/society-home.ts),
not by hiding cards in React:

- a signed-in member sees their society's events;
- a signed-out visitor sees only events whose `dashboard` is public — the same
  rule that decides whether they could open one at all;
- **draft events go only to a manager** of that society;
- a request with no slug and no session is refused rather than being handed
  whichever society is first in the table.

The response carries **counts only** — no money, no names, no contact details.

### One request, no N+1

A card shows a rating, a review count, a photo count, a contributor count.
Fetching those per card is an N+1 that grows with the society's history;
computing them on the client means shipping every contribution row to draw one
number. So each aggregate is **one batched query across all of the society's
events at once** (`.in("event_id", ids)`, narrowest column, tallied
server-side). Fixed ~8 queries whatever the society's size.

Keep it that way: a new card metric is a new tally in that file, never a new
request from the card.

---

## Modules

**The existing page/module registry is unchanged, deliberately.** `prasad`,
`closing`, `contributions` and the rest keep their keys. Conceptual names like
"food", "reviews" or "financialSummary" map onto what already exists —
`food` → `prasad`, `reviews`/`gallery` → inside `closing`, `financialSummary` →
a dashboard widget — and renaming a working registry to match a vocabulary buys
nothing and breaks stored rows.

Where an event wants different wording, that is what `label_override` and
`useVocabulary()` are for. A new module key is justified only when the
functionality genuinely does not exist.

---

## Announcements

`src/data/announcements.ts` is a committed file shared by the whole app. With
one event that was awkward; with several it is wrong, since every event would
show the same notice. 029 adds `event_announcements`, keyed by `event_id`, with
exactly the fields the existing announcement UI already renders — no new
concepts.

The file currently exports an **empty array**, so there is nothing to migrate
across; it remains only as a fallback for a deployment where the table does not
exist yet. The resolution path prefers the database, and global/demo notices are
never merged into a real event's list.

---

## Backward compatibility

- Every existing route resolves unchanged.
- Every migration in 029 is additive: new columns are nullable, new tables start
  empty, no existing row changes meaning.
- The event dashboard was **not modified** in this iteration. "Relive the event"
  opens exactly the experience that was there before.
- The app degrades on every piece of 029 independently, so the code can ship
  before the SQL runs.

See [MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md) for 014–028, which must be
applied before any of the society architecture is live.

---

## Future phases

Not built, deliberately, and each its own decision:

- a tabbed, configurable event page (the dashboard is the Overview for now)
- a general configurable registration engine
- a separate `/manage` organizer experience
- My Events / My Registrations
- yearly society memories
- multi-society onboarding UI
