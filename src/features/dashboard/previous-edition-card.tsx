import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PreviousEdition } from "@/lib/event-data";

/**
 * "Last time": a few photographs from the edition this one was copied from.
 *
 * What a person deciding whether to come wants to see is what it was like -
 * and the committee already has that, in last year's album. The server sends
 * it only when this viewer could open that album themselves (see
 * api/_lib/previous-edition.ts), so there is nothing to gate here; it is simply
 * absent when there is nothing to show.
 */
export function PreviousEditionCard({ edition }: { edition: PreviousEdition }) {
  if (!edition.photos.length) return null;
  const shown = edition.photos.slice(0, 6);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Last time: {edition.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {shown.map((photo, index) => (
            <li key={`${photo.url}-${index}`} className="aspect-square overflow-hidden rounded-lg bg-muted">
              <img src={photo.url} alt={photo.caption || `Photograph from ${edition.name}`} loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
        <Link
          to={`/e/${edition.eventId}/closing#photographs`}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {edition.photoCount > shown.length ? `See all ${edition.photoCount} photographs` : "See the album"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
