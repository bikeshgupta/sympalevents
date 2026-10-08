import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * What a screen that is normally a list of money shows when this event only
 * publishes how many people took part.
 *
 * The server has already withheld the rows and the totals - this is the
 * explanation for why the screen is not a table, not the thing doing the
 * hiding. Without it the page would be an empty table under a row of `₹0`
 * tiles, which reads as "nobody has paid" rather than "you are not shown".
 */
export function CountsOnlyNotice({ count, noun }: { count: number; noun: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-2xl font-semibold tabular-nums leading-tight">
            {count} <span className="text-base font-medium text-muted-foreground">{count === 1 ? noun : `${noun}s`}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            This event shows how many people took part, not what they gave or who they are. Event admins, and
            members given access to this page, can see the amounts.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
