import type { Society } from "@/lib/society";

/**
 * The society's own name, and a line that makes the page feel like theirs.
 *
 * Signed in, the society is the small line above and the person is greeted ("Good evening, Bikesh"). Signed
 * out there is nobody to greet, so the society's name is the heading and the line above says what this is.
 * Every word comes from the `organizations` row and the session - nothing about any particular society or
 * person is written into this file, which is what lets a second society be onboarded without a component
 * change. Do not reintroduce a literal.
 *
 * One `<h1>` holds both lines, so a screen reader hears the society's name and then the greeting.
 */
export function SocietyHeader({
  society,
  greeting,
}: {
  society: Society;
  /** "Good evening, Bikesh" for somebody signed in; omit for a visitor. */
  greeting?: string | null;
}) {
  const eyebrow = greeting ? society.name : `Community events${society.city ? ` · ${society.city}` : ""}`;

  return (
    <header>
      <h1>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {society.logoUrl ? (
            <img src={society.logoUrl} alt="" aria-hidden className="h-5 w-5 shrink-0 rounded object-cover" />
          ) : null}
          <span className="truncate">{eyebrow}</span>
        </span>
        <span className="font-display mt-1.5 block text-[28px] font-semibold leading-[1.15] sm:text-4xl">
          {greeting ?? society.name}
        </span>
      </h1>
      <p className="mt-1 text-[15px] text-muted-foreground">What&rsquo;s happening in your community</p>
    </header>
  );
}
