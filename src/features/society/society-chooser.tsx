import { Link } from "react-router-dom";
import type { SocietyOption } from "@/lib/event-context";
import { cn } from "@/lib/utils";

/**
 * Which society, for somebody who belongs to more than one. Shown only then (`showsSocietyChooser`): with
 * one society the tab itself carries its name and there is nothing to choose.
 *
 * Each is a link to that society's address, so the choice survives a refresh and can be shared.
 */
export function SocietyChooser({ societies, currentSlug }: { societies: SocietyOption[]; currentSlug: string | null }) {
  return (
    <nav aria-label="Your societies" className="-mx-4 mt-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {societies.map((society) => {
        const current = society.slug === currentSlug;
        return (
          <Link
            key={society.id}
            to={society.slug ? `/society/${society.slug}` : "/society"}
            aria-current={current ? "page" : undefined}
            className={cn(
              "glass-card glass-press flex min-h-14 w-44 shrink-0 lg:w-56 items-center gap-2.5 rounded-full py-2 pl-2 pr-4 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current ? "ring-2 ring-primary/70" : "",
            )}
          >
            {society.logoUrl ? (
              <img src={society.logoUrl} alt="" aria-hidden className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                {society.name[0]?.toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{society.name}</span>
              {society.city ? <span className="block truncate text-xs text-muted-foreground">{society.city}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
