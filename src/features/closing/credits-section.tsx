import { HandHeart, HeartHandshake, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClosingPayload } from "@/lib/closing";

/**
 * One name on the honour roll, with the flat it belongs to when the data
 * knows it. `flat` is empty for the groups built from names alone - the
 * committee list, the volunteers, the prasad sponsors.
 */
export type CreditPerson = { name: string; flat: string };

type CreditGroup = {
  title: string;
  blurb: string;
  icon: typeof Users;
  people: CreditPerson[];
};

/**
 * The honour roll. Every name the app knows about, in equal-sized chips -
 * no ranking, no amounts, no medals. The point is that the celebration took
 * all of them, so nobody's tile is bigger than anybody else's.
 *
 * Privacy: names, and a flat number where the row carries one. Amounts,
 * phone numbers, email addresses and payment references stay off this page -
 * it is public the same way the dashboard is, where the committee already
 * shows contributor and sponsor names next to their flats (see
 * .claude/rules/ui-ux.md, "Privacy on public pages"). The two groups the
 * server builds - the committee and the prasad sponsors - carry no flat at
 * all, because `api/_lib/closing.ts` never sends one.
 */
export function CreditsSection({
  credits,
  contributors,
  sponsors,
  isLoading,
}: {
  credits?: ClosingPayload["credits"];
  contributors: CreditPerson[];
  sponsors: CreditPerson[];
  isLoading: boolean;
}) {
  const named = (names: string[] = []) => names.map((name) => ({ name, flat: "" }));

  const groups: CreditGroup[] = [
    {
      title: "Core committee",
      blurb: "Planned it, chased it, and stayed till the lights went off.",
      icon: ShieldCheck,
      people: named(credits?.core),
    },
    {
      title: "Volunteers",
      blurb: "Owned a task or a slot on the schedule and saw it through.",
      icon: Users,
      people: named(credits?.volunteers),
    },
    {
      title: "Prasad sponsors",
      blurb: "Arranged the prasad for a slot - cooked it, bought it, carried it in.",
      icon: HandHeart,
      people: named(credits?.prasadSponsors),
    },
    {
      title: "Contributors",
      blurb: "Every family who put money behind the celebration.",
      icon: Sparkles,
      people: contributors,
    },
    {
      title: "Sponsors",
      blurb: "Backed a slot, an item, or a whole evening.",
      icon: HeartHandshake,
      people: sponsors,
    },
  ];

  const total = groups.reduce((sum, group) => sum + group.people.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
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
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {group.title}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">{group.people.length}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{group.blurb}</p>
              {group.people.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {group.people.map((person, index) => (
                    <li
                      key={`${group.title}-${person.name}-${person.flat}-${index}`}
                      className="inline-flex items-baseline gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-sm"
                    >
                      <span>{person.name}</span>
                      {person.flat ? (
                        <span className="text-xs tabular-nums text-muted-foreground">{person.flat}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {isLoading ? "…" : "Nobody recorded here yet."}
                </p>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
