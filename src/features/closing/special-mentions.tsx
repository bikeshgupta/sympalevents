import { Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { specialMentions, type SpecialMention } from "@/data/credits";

/** "Ankita Nagar" -> "AN". Two letters at most, so the badge never wraps. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The shout-out above the credits: one column per person who carried a whole
 * strand of the celebration and would otherwise be a single chip in a list of
 * two hundred equal-sized ones.
 *
 * Deliberately quiet - no sheen, no pulse. `ClosingStory` already owns the
 * page's one looping element (see .claude/rules/ui-ux.md §8); a second one
 * here and neither would read as the important thing.
 *
 * The names live in src/data/credits.ts. Renders nothing when there are none,
 * rather than an empty card asking to be filled in.
 */
export function SpecialMentions({ mentions = specialMentions }: { mentions?: SpecialMention[] }) {
  if (!mentions.length) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Award className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>{mentions.length === 1 ? "Special mention" : "Special mentions"}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Somebody who ran a whole part of this, start to finish.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={mentions.length > 1 ? "grid gap-4 sm:grid-cols-2" : undefined}>
        {mentions.map((mention) => (
          <div key={mention.name} className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {initials(mention.name)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-xl leading-tight sm:text-2xl">{mention.name}</p>
              <p className="mt-1 inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                {mention.role}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mention.note}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
