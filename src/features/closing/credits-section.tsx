import { HandHeart, HeartHandshake, Pencil, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials, type ClosingCredits, type PrasadCredit } from "@/lib/closing";
import { cn } from "@/lib/utils";

/**
 * One name on the honour roll, with the flat it belongs to when the data
 * knows it. `flat` is empty for the groups built from names alone - the
 * committee list, the volunteers, the prasad sponsors.
 */
export type CreditPerson = { name: string; flat: string };

/**
 * The honour roll: names, and a flat where the row carries one.
 *
 * Two shapes, deliberately. The **core committee is one name per line** -
 * they are a named, ordered group the admin arranges by hand, and a wrapped
 * bag of chips makes the fifth name look like the fiftieth. Everybody else is
 * chips, equal-sized, no ranking and no medals: the celebration took all of
 * them.
 *
 * Privacy: amounts, phone numbers, email addresses and payment references
 * stay off this page - it is public the same way the dashboard is. Only the
 * Contributors and Sponsors chips carry a flat, which is the pairing the
 * dashboard's own tiles already show publicly (see .claude/rules/ui-ux.md,
 * "Privacy on public pages"). The server-built groups carry no flat at all.
 */
export function CreditsSection({
  credits,
  contributors,
  sponsors,
  isLoading,
  canManage,
  onEdit,
  dayLabel,
}: {
  credits: ClosingCredits;
  contributors: CreditPerson[];
  sponsors: CreditPerson[];
  isLoading: boolean;
  canManage: boolean;
  onEdit: () => void;
  /** "Day 3 · Sat, 20 Sept" for a prasad slot's date, from the event itself. */
  dayLabel: (date: string) => string;
}) {
  const named = (names: string[]): CreditPerson[] => names.map((name) => ({ name, flat: "" }));

  const prasadSponsorCount = new Set(
    credits.prasad.flatMap((entry) => entry.sponsors.map((name) => name.toLowerCase())),
  ).size;

  const total =
    credits.core.length + credits.volunteers.length + prasadSponsorCount + sponsors.length + contributors.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>It took all of us</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isLoading ? "Counting everyone…" : `${total} people made this happen.`}
              </p>
            </div>
          </div>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit credits
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section>
          <GroupHeading
            icon={ShieldCheck}
            title="Core committee"
            count={credits.core.length}
            blurb="Planned it, chased it, and stayed till the lights went off."
          />
          {credits.core.length ? (
            <ol className="mt-2.5 overflow-hidden rounded-lg border">
              {credits.core.map((name, index) => (
                <li
                  key={`core-${name}-${index}`}
                  className="flex items-center gap-3 border-b bg-card px-3 py-2.5 last:border-b-0"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {initials(name)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium">{name}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyLine isLoading={isLoading} />
          )}

          {credits.shoutouts.map((shoutout) => (
            <p
              key={shoutout.name}
              className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm"
            >
              <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{shoutout.name}</span>
                {shoutout.role ? <span className="text-foreground"> - {shoutout.role}.</span> : null}
                {shoutout.note ? ` ${shoutout.note}` : null}
              </span>
            </p>
          ))}
        </section>

        <ChipGroup
          icon={Users}
          title="Volunteers"
          blurb="Owned a task or a slot on the schedule and saw it through."
          people={named(credits.volunteers)}
          isLoading={isLoading}
        />

        <section>
          <GroupHeading
            icon={HandHeart}
            title="Prasad sponsors"
            count={prasadSponsorCount}
            blurb="What each family brought, in the order it was served."
          />
          {credits.prasad.length ? (
            <ol className="mt-2.5 space-y-2">
              {credits.prasad.map((entry, index) => (
                <PrasadRow key={`${entry.date}-${entry.slot}-${entry.item}-${index}`} entry={entry} dayLabel={dayLabel} />
              ))}
            </ol>
          ) : (
            <EmptyLine isLoading={isLoading} />
          )}
        </section>

        <ChipGroup
          icon={HeartHandshake}
          title="Sponsors"
          blurb="Backed a slot, an item, or a whole evening."
          people={sponsors}
          isLoading={isLoading}
        />

        <ChipGroup
          icon={Sparkles}
          title="Contributors"
          blurb="Every family who put money behind the celebration."
          people={contributors}
          isLoading={isLoading}
        />
      </CardContent>
    </Card>
  );
}

function GroupHeading({
  icon: Icon,
  title,
  count,
  blurb,
}: {
  icon: typeof Users;
  title: string;
  count: number;
  blurb: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
    </>
  );
}

function ChipGroup({
  icon,
  title,
  blurb,
  people,
  isLoading,
}: {
  icon: typeof Users;
  title: string;
  blurb: string;
  people: CreditPerson[];
  isLoading: boolean;
}) {
  return (
    <section>
      <GroupHeading icon={icon} title={title} count={people.length} blurb={blurb} />
      {people.length ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {people.map((person, index) => (
            <NameChip key={`${title}-${person.name}-${person.flat}-${index}`} person={person} />
          ))}
        </ul>
      ) : (
        <EmptyLine isLoading={isLoading} />
      )}
    </section>
  );
}

/**
 * The chip itself: name on the card surface, flat in its own tinted capsule
 * beside it. The flat used to be grey text run on after the name, which read
 * as part of it - two families at B-402 and B-403 looked like one long name
 * each.
 */
function NameChip({ person }: { person: CreditPerson }) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pl-3",
        person.flat ? "pr-1.5" : "pr-3",
      )}
    >
      <span className="text-sm font-medium leading-5">{person.name}</span>
      {person.flat ? (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold leading-4 tabular-nums text-primary">
          {person.flat}
        </span>
      ) : null}
    </li>
  );
}

/** One prasad, its slot, and who arranged it. */
function PrasadRow({ entry, dayLabel }: { entry: PrasadCredit; dayLabel: (date: string) => string }) {
  return (
    <li className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {[dayLabel(entry.date), entry.slot].filter(Boolean).join(" · ")}
        </span>
        <span className="text-sm font-medium">{entry.item || "Prasad"}</span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {entry.sponsors.map((name, index) => (
          <li
            key={`${name}-${index}`}
            className="inline-flex items-center rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium"
          >
            {name}
          </li>
        ))}
      </ul>
    </li>
  );
}

function EmptyLine({ isLoading }: { isLoading: boolean }) {
  return <p className="mt-2 text-sm text-muted-foreground">{isLoading ? "…" : "Nobody recorded here yet."}</p>;
}
