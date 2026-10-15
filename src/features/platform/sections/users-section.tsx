import { Link } from "react-router-dom";
import { EmptyState, QueryState, Skeleton, UnavailableState } from "../data-states";
import { formatCount, formatInstantDate, formatInstantTime } from "../format";
import { PageHeader, SectionHeading } from "../page-header";
import { useUser, useUsers, type UserRow, type UsersData } from "../platform-api";
import { roleText, sinceText, useListParams, useSectionLink } from "../platform-helpers";
import { sectionPath, type PlatformSection } from "../platform-sections";
import { Avatar, Change, Choices, DetailDrawer, DrawerSection, EventStatusLabel, Fact, Figure, FigureRow, Pager, SearchField } from "../platform-ui";
import { usePlatformRange } from "../use-platform-range";

/**
 * Users - everyone who has signed in to Sympal. A directory first: search, three filters the data can actually
 * support, and a read-only view of each person. No phone numbers or flat numbers, ever; the API never selects
 * them. "No recorded visit" means unknown, not inactive: visits exist for event pages only, since tracking began.
 */
export function UsersSection({ section }: { section: PlatformSection }) {
  const { preset } = usePlatformRange();
  const { values, set } = useListParams(["q", "joined", "page", "user"] as const);
  const joined = values.joined === "period" || values.joined === "active" ? values.joined : "any";
  const users = useUsers({ range: preset, q: values.q, joined: joined === "any" ? "" : joined, page: values.page });

  return (
    <div>
      <PageHeader title={section.label} summary={section.summary} rangeAware observedAt={users.data?.observedAt ?? null} />
      <div className="mt-8">
        <QueryState query={users} skeleton={<ListSkeleton />} errorMessage="The people could not be loaded.">
          {(data) => (
            <div className="space-y-10">
              <Summary data={data} />
              <section aria-labelledby="directory-heading">
                <div id="directory-heading">
                  <SectionHeading title="Directory" aside={<span className="text-xs text-muted-foreground">Newest first</span>} />
                </div>
                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <SearchField value={values.q} onChange={(q) => set({ q })} placeholder="Search by name or email" label="Search people" />
                  <Choices
                    label="Show"
                    value={joined}
                    onChange={(next) => set({ joined: next })}
                    options={[
                      { value: "any", label: "Everyone" },
                      { value: "period", label: "Joined in this period" },
                      ...(data.coverage.visitsAvailable ? [{ value: "active" as const, label: "Active in this period" }] : []),
                    ]}
                  />
                </div>
                <Directory rows={data.users} onOpen={(id) => set({ user: id }, { keepPage: true })} />
                <Pager page={data.page} pageSize={data.pageSize} total={data.total} busy={users.isFetching} onPage={(page) => set({ page: String(page) })} />
              </section>
            </div>
          )}
        </QueryState>
      </div>
      <UserDrawer id={values.user || null} range={preset} onClose={() => set({ user: null }, { keepPage: true })} />
    </div>
  );
}

function Summary({ data }: { data: UsersData }) {
  const days = data.window.days;
  return (
    <FigureRow>
      <Figure label="Registered" value={formatCount(data.summary.total)} detail="Everyone who has signed in" />
      <Figure label="Joined" value={formatCount(data.summary.joined.current)} detail={<Change value={data.summary.joined} days={days} />} />
      {data.summary.active ? (
        <Figure label="Active" value={formatCount(data.summary.active.current)} detail={<>On event pages · <Change value={data.summary.active} days={days} /></>} />
      ) : (
        <Figure label="Active" value="—" detail="Visits are not recorded" />
      )}
      <Figure label="In a society" value={formatCount(data.summary.inSociety)} detail={`${data.summary.total ? Math.round((data.summary.inSociety / data.summary.total) * 100) : 0}% of everyone`} />
    </FigureRow>
  );
}

function Directory({ rows, onOpen }: { rows: UserRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="py-8 text-sm text-muted-foreground">Nobody matches. Try a shorter search or another filter.</p>;
  return (
    <>
      {/* Phone: one row per person. */}
      <ul className="mt-2 divide-y divide-border/70 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onOpen(row.id)} className="flex w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={row.name} photoUrl={row.photoUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name ?? "No name"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.societies} {row.societies === 1 ? "society" : "societies"} · last visit {row.lastVisitAt ? sinceText(row.lastVisitAt)?.toLowerCase() : "not recorded"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Wider screens: the table. */}
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th className="py-2.5 pr-4 font-semibold">Person</th>
              <th className="px-4 py-2.5 font-semibold">Joined</th>
              <th className="px-4 py-2.5 text-right font-semibold">Societies</th>
              <th className="px-4 py-2.5 text-right font-semibold">Event roles</th>
              <th className="py-2.5 pl-4 font-semibold">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <button type="button" onClick={() => onOpen(row.id)} className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar name={row.name} photoUrl={row.photoUrl} />
                    <span className="min-w-0">
                      <span className="block font-medium hover:underline">{row.name ?? "No name"}</span>
                      <span className="block text-xs text-muted-foreground">{row.email}</span>
                    </span>
                  </button>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{formatInstantDate(row.joinedAt) ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.societies}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.eventRoles}</td>
                <td className="py-2.5 pl-4">{row.lastVisitAt ? <span title={`${formatInstantDate(row.lastVisitAt)}, ${formatInstantTime(row.lastVisitAt)} IST`}>{sinceText(row.lastVisitAt)}</span> : <span className="text-muted-foreground">Not recorded</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UserDrawer({ id, range, onClose }: { id: string | null; range: string; onClose: () => void }) {
  const user = useUser(id, range);
  const link = useSectionLink();
  const data = user.data;
  return (
    <DetailDrawer open={Boolean(id)} onClose={onClose} title={data?.user.name ?? (user.isPending ? "Loading" : "Person")} subtitle={data?.user.email ?? undefined}>
      <QueryState query={user} skeleton={<DrawerSkeleton />} errorMessage="This person could not be loaded." notFound={<EmptyState title="There is no such person." hint="It may have been deleted, or the link is wrong." />}>
        {(person) => (
          <div>
            <div className="flex items-center gap-4">
              <Avatar name={person.user.name} photoUrl={person.user.photoUrl} size="lg" />
              <dl className="grid flex-1 grid-cols-3 gap-4">
                <Fact label="Joined" value={<span className="text-base">{formatInstantDate(person.user.joinedAt) ?? "—"}</span>} />
                <Fact label="Societies" value={person.memberships.length} />
                <Fact label="Bookings made" value={person.bookingsMade ?? "—"} />
              </dl>
            </div>

            <DrawerSection title="Societies">
              {person.memberships.length ? (
                <ul className="divide-y divide-border/70">
                  {person.memberships.map((membership) => (
                    <li key={membership.societyId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link to={link(sectionPath("societies"), { society: membership.societyId })} className="font-medium hover:underline">
                        {membership.society}
                      </Link>
                      <span className="text-muted-foreground">
                        {roleText[membership.role] ?? membership.role}
                        {membership.since ? ` · since ${formatInstantDate(membership.since)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">Not in any society.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Event roles">
              {person.eventRoles.length ? (
                <ul className="divide-y divide-border/70">
                  {person.eventRoles.map((role) => (
                    <li key={role.eventId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                      <span className="min-w-0">
                        <Link to={link(sectionPath("events"), { event: role.eventId })} className="font-medium hover:underline">
                          {role.event}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{role.society}</span>
                      </span>
                      <span className="flex items-center gap-3 text-muted-foreground">
                        {roleText[role.role] ?? role.role}
                        <EventStatusLabel status={role.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">No event roles.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Visits to event pages">
              {person.visits ? (
                <>
                  <p className="py-2 text-sm">
                    <span className="font-semibold tabular-nums">{formatCount(person.visits.inWindow)}</span> visits in this period.
                  </p>
                  {person.visits.recent.length ? (
                    <ul className="divide-y divide-border/70">
                      {person.visits.recent.slice(0, 12).map((visit, index) => (
                        <li key={`${visit.startedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 py-2 text-sm">
                          <span className="min-w-0 truncate">{visit.event ?? "An event that no longer exists"}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatInstantDate(visit.startedAt)}, {formatInstantTime(visit.startedAt)} · {visit.pages} {visit.pages === 1 ? "page" : "pages"}
                            {visit.device ? ` · ${visit.device}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-2 text-sm text-muted-foreground">No visit recorded since tracking began.</p>
                  )}
                </>
              ) : (
                <UnavailableState title="Not recorded" reason="This database does not record visits." />
              )}
            </DrawerSection>

            <DrawerSection title="Actions">
              {person.actions ? (
                person.actions.length ? (
                  <ul className="divide-y divide-border/70">
                    {person.actions.map((action) => (
                      <li key={action.id} className="py-2.5 text-sm">
                        <p className="font-medium">{action.summary ?? `${action.action} ${action.entityType}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatInstantDate(action.at)}, {formatInstantTime(action.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">No recorded actions.</p>
                )
              ) : (
                <UnavailableState title="Not recorded yet" reason="What this person changed appears here once the audit log exists (database update 030)." />
              )}
            </DrawerSection>

            <p className="mt-8 text-xs text-muted-foreground">Phone number and flat number are never read by the Control Center.</p>
          </div>
        )}
      </QueryState>
    </DetailDrawer>
  );
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-10">
      <div className="grid grid-cols-2 gap-6 border-b border-border/80 pb-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, key) => (
          <Skeleton key={key} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-10 flex-1" />
      </div>
      {Array.from({ length: 5 }, (_, key) => (
        <Skeleton key={key} className="h-9 w-full" />
      ))}
    </div>
  );
}
