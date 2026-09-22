import type { WidgetVariant } from "@/lib/widgets";
import type { ContributionRow, SponsorRow } from "@/lib/event-data";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeartHandshake, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { calculateFundingProgress } from "@/features/dashboard/dashboard-utils";
import { formatCurrency } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";
import { useEventAccess } from "@/lib/event-access";
import { useMemo, useState } from "react";

/**
 * Contributor tiles. No rank numbers or medals - every contributor gets an
 * equally cheerful tile, they just happen to be laid out largest-first.
 *
 * A soft tint per position, so no two neighbouring tiles share a colour.
 */
const tileTints = [
  "bg-rose-50 border-rose-100",
  "bg-sky-50 border-sky-100",
  "bg-amber-50 border-amber-100",
  "bg-emerald-50 border-emerald-100",
  "bg-violet-50 border-violet-100",
  "bg-orange-50 border-orange-100",
  "bg-teal-50 border-teal-100",
  "bg-fuchsia-50 border-fuchsia-100",
  "bg-lime-50 border-lime-100",
];

/** Nine tiles over three columns - always exactly three tidy rows. */
const MAX_TILES = 9;

type TileEntry = { key: string; amount: number; who: string };

/** Shared by both tabs - contributions and sponsors both carry a `received` field. */
function receivedAmount(row: { received: number }) {
  return row.received;
}

function contributionToTile(row: ContributionRow, index: number): TileEntry {
  return {
    key: row.id ?? `${row.flat}-${index}`,
    amount: row.received,
    who: row.flat && row.flat !== "-" ? `${row.flat} · ${row.name}` : row.name,
  };
}

function sponsorToTile(row: SponsorRow, index: number): TileEntry {
  return {
    key: row.id ?? `${row.name}-${index}`,
    amount: row.received,
    who: row.flat && row.flat !== "-" ? `${row.flat} · ${row.name}` : row.name,
  };
}

/**
 * Largest-first, capped for the mosaic - the last slot becomes a "+N more"
 * tile instead of a 9th entry once there are too many to fit.
 *
 * `getAmount`/`toTile` are expected to be stable module-level functions (see
 * `receivedAmount`, `contributionToTile`, `sponsorToTile` above), not inline
 * closures - that is what lets this memoize on `rows` alone.
 */
function useTopEntries<T>(rows: T[], getAmount: (row: T) => number, toTile: (row: T, index: number) => TileEntry) {
  return useMemo(() => {
    const ranked = rows
      .filter((row) => getAmount(row) > 0)
      .sort((left, right) => getAmount(right) - getAmount(left));
    const overflowCount = Math.max(ranked.length - (MAX_TILES - 1), 0);
    const visible = (overflowCount ? ranked.slice(0, MAX_TILES - 1) : ranked.slice(0, MAX_TILES)).map(toTile);
    return { visible, overflowCount };
  }, [rows, getAmount, toTile]);
}

function TileGrid({
  visible,
  overflowCount,
  moreHref,
  moreLabel,
}: {
  visible: TileEntry[];
  overflowCount: number;
  /** Where "+N more" goes. Omitted when the viewer cannot open that page -
   *  the tile then stays the plain count it has always been, rather than a
   *  link that would bounce them to access-denied. */
  moreHref?: string;
  moreLabel?: string;
}) {
  if (!visible.length) {
    return <p className="mt-2 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  }

  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {visible.map((entry, index) => (
        <div
          key={entry.key}
          title={`${formatCurrency(entry.amount)} from ${entry.who}`}
          className={`animate-fade-up rounded-lg border px-2 py-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tileTints[index % tileTints.length]}`}
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <p className="text-[13px] font-semibold leading-tight tabular-nums text-foreground">
            {formatCurrency(entry.amount)}
          </p>
          <p className="truncate text-[11px] leading-tight text-foreground/60">{entry.who}</p>
        </div>
      ))}

      {overflowCount ? (
        moreHref ? (
          <Link
            to={moreHref}
            aria-label={`See all ${moreLabel ?? "entries"}, including ${overflowCount} more`}
            className="flex animate-fade-up flex-col justify-center rounded-lg border border-dashed bg-muted/50 px-2 py-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ animationDelay: `${visible.length * 45}ms` }}
          >
            <p className="text-[13px] font-semibold leading-tight tabular-nums text-primary">+{overflowCount}</p>
            <p className="truncate text-[11px] leading-tight text-primary/70">See all</p>
          </Link>
        ) : (
          <div
            className="flex animate-fade-up flex-col justify-center rounded-lg border border-dashed bg-muted/50 px-2 py-1.5 shadow-sm"
            style={{ animationDelay: `${visible.length * 45}ms` }}
          >
            <p className="text-[13px] font-semibold leading-tight tabular-nums">+{overflowCount}</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">more</p>
          </div>
        )
      ) : null}
    </div>
  );
}

export function FundingProgress({
  totalBudget,
  fundsReceived,
  contributionReceived,
  sponsorshipReceived,
  contributions,
  sponsors,
  variant = "detailed",
}: {
  totalBudget: number;
  fundsReceived: number;
  contributionReceived: number;
  sponsorshipReceived: number;
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  variant?: WidgetVariant;
}) {
  const progress = calculateFundingProgress(fundsReceived, totalBudget);
  const rounded = Math.round(progress);
  // The bar and the percentage share one animation so they always agree.
  const animatedProgress = useCountUp(progress, { duration: 1400 });
  const aboveExpected = contributions.filter((row) => row.received > row.expected).length;
  const [activeTab, setActiveTab] = useState<"contributions" | "sponsors">("contributions");

  const contributorTiles = useTopEntries(contributions, receivedAmount, contributionToTile);
  const sponsorTiles = useTopEntries(sponsors, receivedAmount, sponsorToTile);
  // "+N more" becomes a link to the full list, but only for a viewer who can
  // actually open that page - the dashboard is public, so plenty of people
  // seeing these tiles cannot. `useEventAccess` is the same list the nav
  // filters on, so the tile and the sidebar always agree.
  const { data: eventAccess } = useEventAccess();
  const canOpen = (pageKey: string) =>
    (eventAccess?.pages ?? []).some((page) => page.pageKey === pageKey && page.canView);
  const activeTiles =
    activeTab === "contributions"
      ? { ...contributorTiles, href: canOpen("contributions") ? "/contributions" : undefined }
      : { ...sponsorTiles, href: canOpen("sponsors") ? "/sponsors" : undefined };
  // Each tab is colored to match its own dot in the Sponsorship/Contribution
  // legend just above, so the tab you pick and the bar segment it summarizes
  // read as the same thing rather than an unrelated teal default.
  const tileTabs = [
    {
      key: "contributions" as const,
      label: "Contributions",
      activeClassName: "border-amber-300 bg-amber-100 text-amber-900",
    },
    {
      key: "sponsors" as const,
      label: "Sponsors",
      activeClassName: "border-primary bg-primary text-primary-foreground",
    },
  ];

  // Each source drawn as its own slice of the budget, so the split is readable
  // at a glance instead of only as two numbers underneath a single bar.
  const sponsorshipShare = totalBudget > 0 ? Math.min(100, (sponsorshipReceived / totalBudget) * 100) : 0;
  const contributionShare = totalBudget > 0 ? Math.min(100 - sponsorshipShare, (contributionReceived / totalBudget) * 100) : 0;
  const scale = progress > 0 ? animatedProgress / progress : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-br from-accent/40 to-transparent pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HeartHandshake className="h-4 w-4 animate-float" aria-hidden="true" />
            </span>
            <CardTitle>Funding Progress</CardTitle>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums" aria-label={`${rounded}% funded`}>
              <span aria-hidden="true">{Math.round(animatedProgress)}%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">funded</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatCurrency(fundsReceived)}</span> of{" "}
          {formatCurrency(totalBudget)} raised
        </p>
      </CardHeader>

      <CardContent className="pt-4">
        <div
          role="progressbar"
          aria-label="Funding progress"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${rounded}% funded — ${formatCurrency(sponsorshipReceived)} sponsorship, ${formatCurrency(contributionReceived)} contribution`}
          className="relative flex h-3.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="relative h-full overflow-hidden bg-primary transition-none"
            style={{ width: `${sponsorshipShare * scale}%` }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
          </div>
          <div className="h-full bg-amber-400" style={{ width: `${contributionShare * scale}%` }} />
        </div>

        <div className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              Sponsorship
            </span>
            <AnimatedNumber value={sponsorshipReceived} format={formatCurrency} className="font-semibold tabular-nums" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
              Contribution
            </span>
            <AnimatedNumber value={contributionReceived} format={formatCurrency} className="font-semibold tabular-nums" />
          </div>
          {aboveExpected ? (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {aboveExpected} resident{aboveExpected > 1 ? "s" : ""} contributed more than expected.
              </span>
            </p>
          ) : null}
        </div>

        {/* Who gave is the "detailed" half. The bar and the totals above
            are the whole of the "basic" one. */}
        {variant === "detailed" ? (
          <div className="mt-4 border-t pt-4">
            {/* Same bordered-tab treatment as the day selector in Event Schedule -
                solid primary fill for the active tab, not a separate "segmented
                control" look. */}
            <div className="flex gap-2" role="tablist" aria-label="Top contributors and sponsors">
              {tileTabs.map((tab, index) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="funding-tile-panel"
                    tabIndex={active ? 0 : -1}
                    onKeyDown={(event) => {
                      const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                      if (!offset) return;
                      event.preventDefault();
                      setActiveTab(tileTabs[(index + offset + tileTabs.length) % tileTabs.length].key);
                    }}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-center text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                      active
                        ? tab.activeClassName
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div id="funding-tile-panel" role="tabpanel">
              <TileGrid
                key={activeTab}
                visible={activeTiles.visible}
                overflowCount={activeTiles.overflowCount}
                moreHref={activeTiles.href}
                moreLabel={activeTab === "contributions" ? "contributions" : "sponsors"}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
