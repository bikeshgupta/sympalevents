import { Share2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppEvent } from "@/lib/event-data";
import { useRegistration } from "@/lib/registration";
import { shareLink } from "@/lib/share";
import { blockOf } from "../../../shared/participation";
import { cn } from "@/lib/utils";

/**
 * "Who's coming": the number that makes a quiet page feel like a party, and the
 * tower breakdown that makes a resident want their own block to show up.
 *
 * Counts only. The server never names a block of fewer than three households
 * (shared/participation.ts), so this can be shown wherever registration can be
 * read. It draws nothing until somebody has registered - an honest "0 people"
 * is the opposite of social proof - and nothing at all when registration is
 * off or the viewer cannot open it.
 *
 * Reads the registration query the action card already made, so it adds no
 * request.
 */
export function CommunityCard({ event, canSeeRegistration }: { event: AppEvent; canSeeRegistration: boolean }) {
  const { query } = useRegistration(canSeeRegistration ? event.id : undefined);
  const [note, setNote] = useState<string | null>(null);
  const data = query.data;
  const participation = data?.participation;

  if (!canSeeRegistration || !data?.config.enabled || !participation || participation.households < 1) return null;

  const mine = data.mine?.flat ? blockOf(data.mine.flat) : null;
  const max = Math.max(1, ...participation.byBlock.map((row) => row.households));
  const attendees = data.summary.attendees;

  async function invite() {
    const outcome = await shareLink({
      title: event.name,
      text: `${participation?.households} households have joined ${event.name}. Have you registered?`,
      url: window.location.href.split("#")[0].replace(/\/(dashboard|registration)\/?$/, ""),
    });
    setNote(outcome === "copied" ? "Link copied. Paste it into your tower's group." : outcome === "failed" ? "Could not share. Copy the address from your browser." : null);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Who's coming
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums">{attendees.toLocaleString("en-IN")}</span>{" "}
          <span className="text-muted-foreground">
            {attendees === 1 ? "person" : "people"} from{" "}
            <span className="font-medium text-foreground tabular-nums">{participation.households.toLocaleString("en-IN")}</span>{" "}
            {participation.households === 1 ? "household" : "households"}
          </span>
        </p>

        {participation.byBlock.length ? (
          <ul className="space-y-2" aria-label="Households by tower">
            {participation.byBlock.map((row) => {
              const yours = mine === row.block;
              return (
                <li key={row.block} className="flex items-center gap-3 text-sm">
                  <span className={cn("w-14 shrink-0 font-medium", yours && "text-primary")}>
                    {row.block === "Other" ? "Other" : `Tower ${row.block}`}
                  </span>
                  <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className={cn("block h-full rounded-full", yours ? "bg-primary" : "bg-primary/45")} style={{ width: `${(row.households / max) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums">{row.households}</span>
                  {yours ? <span className="sr-only">your tower</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div>
          <Button type="button" variant="outline" className="h-11" onClick={() => void invite()}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Tell your neighbours
          </Button>
          {note ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {note}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
