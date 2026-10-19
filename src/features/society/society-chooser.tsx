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
              "flex min-h-14 w-44 shrink-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current ? "border-foreground" : "[@media(hover:hover)]:hover:bg-muted/40",
            )}
          >
            {society.logoUrl ? (
              <img src={society.logoUrl} alt="" aria-hidden className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            ) : (
              <span aria-hidden className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
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
