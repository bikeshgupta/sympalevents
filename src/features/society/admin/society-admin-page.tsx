import { ArrowLeft, CalendarDays, Users } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { EventsAccessTab } from "@/features/society/admin/events-access-tab";
import { MembersTab } from "@/features/society/admin/members-tab";
import { OverviewTab } from "@/features/society/admin/overview-tab";
import { SocietyAccount } from "@/features/society/society-account";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { cn } from "@/lib/utils";
import { isEventFilter, type EventFilter, type MemberFilter } from "../../../../shared/society-members";

/**
 * Society Management - `/society/<slug>/admin`.
 *
 * This is NOT an event-admin page. It is private membership information and
 * authority over every event in the society, so only a Society Admin may open
 * it. The check that matters is the server's (requireSocietyAdmin, on every
 * request this page makes); declining to draw the page for anybody else is only
 * so they are told, plainly, instead of watching four requests fail.
 *
 * Outside AppLayout, like the society home it sits beside: a society is not an
 * event, and this page needs no event in hand.
 */

const tabs = [
  { key: "overview", label: "Overview", icon: null },
  { key: "members", label: "Members", icon: Users },
  { key: "events", label: "Events & access", icon: CalendarDays },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const memberFilters: MemberFilter[] = ["all", "admin", "committee", "resident"];

export function SocietyAdminPage() {
  const { societySlug } = useParams();
  const location = useLocation();
  const { data: session, isLoading: sessionLoading } = useSession();
  const { societies, isLoading } = useEventContext();
  const [params, setParams] = useSearchParams();
  const tablist = useRef<HTMLDivElement>(null);

  const tab: TabKey = tabs.some((item) => item.key === params.get("tab")) ? (params.get("tab") as TabKey) : "overview";
  const society = societies.find((item) => item.slug === societySlug) ?? null;

  useEffect(() => {
    document.title = society ? `${society.name} - Society management` : "Society management";
  }, [society]);

  if (sessionLoading || isLoading) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading...</main>;

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!society || society.role !== "admin") {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="text-xl font-semibold">Society management is for society admins</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need to be an admin of this society to open this page. An event admin does not have society-wide access.
        </p>
        <Link to={societySlug ? `/society/${societySlug}` : "/society"} className="mt-4 inline-block text-sm font-medium text-primary">
          Back to the society
        </Link>
      </main>
    );
  }

  // The Overview tiles open a tab already narrowed (`?tab=members&filter=admin`).
  // The filter lives in the address so it survives a refresh and the back button,
  // and a tab opened by hand starts unfiltered.
  const memberFilter: MemberFilter = memberFilters.includes(params.get("filter") as MemberFilter)
    ? (params.get("filter") as MemberFilter)
    : "all";
  const eventFilter: EventFilter = isEventFilter(params.get("filter")) ? (params.get("filter") as EventFilter) : "all";

  function choose(next: TabKey) {
    setParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  function setFilter(next: string) {
    setParams(next === "all" ? { tab } : { tab, filter: next }, { replace: true });
  }

  // Arrow keys move between tabs, as the tablist role promises.
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((item) => item.key === tab);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    choose(next.key);
    window.requestAnimationFrame(() => tablist.current?.querySelector<HTMLButtonElement>(`#society-tab-${next.key}`)?.focus());
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-5 sm:pt-7">
      {/* Back on the left, the account in the top right corner - the same place it is on Society Home and in
          the event pages. Only a society admin reaches this page, so the role is known. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/society/${society.slug}`}
          className="inline-flex min-w-0 shrink items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{society.name}</span>
        </Link>
        <div className="shrink-0">
          <SocietyAccount role="admin" canManage={false} isSocietyAdmin={false} societySlug={society.slug} draftCount={0} onShowDrafts={() => undefined} />
        </div>
      </div>

      <header className="mt-5 flex items-center gap-3">
        {society.logoUrl ? (
          <img src={society.logoUrl} alt="" aria-hidden className="h-11 w-11 shrink-0 rounded-xl border object-cover" />
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display break-words text-[28px] font-semibold leading-[1.15] sm:text-4xl">{society.name}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Society management{society.city ? ` · ${society.city}` : ""}
          </p>
        </div>
      </header>

      {/* Text tabs on a hairline, a teal underline under the chosen one - the same treatment as Society Home's
          Upcoming / Live / Past. Scrolls sideways inside its own row if a phone is too narrow, never the page. */}
      <div
        ref={tablist}
        role="tablist"
        aria-label="Society management"
        onKeyDown={onKey}
        className="mt-5 flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            id={`society-tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            aria-controls="society-panel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => choose(item.key)}
            className={cn(
              "font-display -mb-px min-h-11 shrink-0 border-b-2 px-3 text-base font-medium transition-colors first:pl-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="society-panel" role="tabpanel" aria-labelledby={`society-tab-${tab}`} className="mt-2">
        {tab === "overview" ? <OverviewTab society={society} /> : null}
        {tab === "members" ? <MembersTab societyId={society.id} filter={memberFilter} onFilter={setFilter} /> : null}
        {tab === "events" ? <EventsAccessTab societyId={society.id} filter={eventFilter} onFilter={setFilter} /> : null}
      </div>
    </main>
  );
}
