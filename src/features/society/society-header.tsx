import { MapPin } from "lucide-react";
import type { Society } from "@/lib/society";

/**
 * The society's own name, its place, and its mark.
 *
 * Every word here comes from the `organizations` row. Nothing about any
 * particular society is written into this file - that is the whole point of
 * it, and it is what lets a second society be onboarded without a component
 * change. Do not reintroduce a literal name or city here.
 */
export function SocietyHeader({ society }: { society: Society }) {
  return (
    <header className="flex items-start gap-3 sm:gap-4">
      {society.logoUrl ? (
        <img
          src={society.logoUrl}
          alt=""
          aria-hidden
          className="h-12 w-12 shrink-0 rounded-xl border object-cover sm:h-14 sm:w-14"
        />
      ) : null}

      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">{society.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground sm:text-base">Community Events</p>
        {society.city ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            {society.city}
          </p>
        ) : null}
      </div>
    </header>
  );
}
