import type { Society } from "@/lib/society";

/**
 * The society's own name and place.
 *
 * Deliberately two lines. The first version spent four on a logo, a name, a
 * "Community Events" line and a pinned city, which pushed the thing people
 * came for below the fold on a phone. Name, then one quiet line that carries
 * both the purpose and the place.
 *
 * Every word comes from the `organizations` row - nothing about any particular
 * society is written into this file, which is what lets a second one be
 * onboarded without a component change. Do not reintroduce a literal.
 */
export function SocietyHeader({ society }: { society: Society }) {
  return (
    <header className="flex items-center gap-3">
      {society.logoUrl ? (
        <img
          src={society.logoUrl}
          alt=""
          aria-hidden
          className="h-10 w-10 shrink-0 rounded-xl border object-cover sm:h-12 sm:w-12"
        />
      ) : null}

      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold leading-tight sm:text-3xl">{society.name}</h1>
        <p className="truncate text-sm text-muted-foreground">
          Community Events{society.city ? ` · ${society.city}` : ""}
        </p>
      </div>
    </header>
  );
}
