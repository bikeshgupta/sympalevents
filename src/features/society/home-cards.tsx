import { Plus, Ticket } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OccasionIcon } from "@/components/shared/icon-tile";
import { useSession } from "@/lib/auth";
import { personalArtworkUrl } from "@/lib/personal-artwork";
import { useSocietyActions } from "@/lib/societies";
import { themeByKey } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { KIND_ACCENT, PERSONAL_KINDS, parseInviteInput } from "../../../shared/personal-events";

/**
 * The home's own cards: the create banner, the kinds to start from, and "Join an event".
 *
 * All three work for somebody who is not signed in. Creating sends them through sign-in first (`/my/new` asks
 * for it and comes straight back); an invitation opens without an account; only joining a society asks to
 * sign in, because membership belongs to an account.
 */

/**
 * The one call to create: a short banner, its picture drawn in code (personal-artwork.ts), one button. Kept to
 * a band of the screen rather than a hero - it sits above the person's own events, which matter more once
 * they have some. Before migration 049 it says personal events are coming and offers nothing that would fail.
 */
export function CreateEventBanner({ ready, motion }: { ready: boolean; motion: boolean }) {
  return (
    <section
      aria-labelledby="create-banner"
      className={cn("group relative mt-5 overflow-hidden rounded-3xl bg-primary shadow-sm", motion && "dfx-row")}
    >
      <img
        src={personalArtworkUrl("birthday")}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 [@media(hover:hover)]:group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      {/* Weighted to the left, where the words are; the picture stays clear on the right. */}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
      <div className="relative flex min-h-44 flex-col justify-center p-5 text-white sm:min-h-52 sm:p-7">
        <h2 id="create-banner" className="font-display max-w-[62%] text-[26px] font-semibold leading-tight sm:max-w-[15ch] sm:text-4xl">
          Make every moment special
        </h2>
        <p className="mt-1.5 max-w-[58%] text-sm text-white/90 sm:max-w-[30ch] sm:text-[15px]">
          {ready
            ? "Private, free and invite-only. For birthdays, anniversaries and more."
            : "Private birthdays, anniversaries and get-togethers are coming soon to My space."}
        </p>
        {ready ? (
          <Button asChild className="mt-4 w-fit bg-white text-foreground shadow-sm hover:bg-white/90">
            <Link to="/my/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create event
            </Link>
          </Button>
        ) : (
          <span className="mt-4 w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">Coming soon</span>
        )}
      </div>
    </section>
  );
}

/** Start from a kind: six tiles, each its own accent from the five presets (KIND_ACCENT). */
export function KindTiles() {
  return (
    <section aria-labelledby="kind-tiles" className="mt-6">
      <h2 id="kind-tiles" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Start with
      </h2>
      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PERSONAL_KINDS.slice(0, 6).map((kind) => {
          const accent = themeByKey(KIND_ACCENT[kind.key]).primary;
          return (
            <li key={kind.key}>
              <Link
                to={`/my/new?kind=${kind.key}`}
                className={cn(
                  "flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center text-sm font-medium transition",
                  "[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md active:scale-[0.98] motion-reduce:transform-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `hsl(${accent} / 0.12)`, color: `hsl(${accent})` }}
                >
                  <OccasionIcon name={kind.key} className="h-5 w-5" />
                </span>
                <span className="leading-tight">{kind.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Join an event": one box for an invitation code (6), a society's code (8), or a whole invitation link
 * pasted from WhatsApp (`parseInviteInput`). An invitation opens at `/i/<code>`, which itself says whether
 * the code exists, was cancelled or has closed; a society code is joined right here (`?resource=join`).
 * Joining needs an account, so a signed-out visitor is sent to sign in and brought back to this box with
 * the code still in it (`?code=`), one tap from joining.
 */
export function JoinEventCard({ variant = "event", className }: { variant?: "event" | "society"; className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const { data: session } = useSession();
  const { join } = useSocietyActions();
  const [value, setValue] = useState(() => search.get("code") ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const id = `join-${variant}`;

  return (
    <section aria-labelledby={`${id}-heading`} className={cn("rounded-3xl border bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Ticket className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="font-display text-xl font-semibold leading-tight">
            {variant === "society" ? "Join a society" : "Join an event"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {variant === "society"
              ? "Enter the 8-character code your committee shared."
              : "Have an invite code or link? Join a private event or a society."}
          </p>
        </div>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const found = parseInviteInput(value);
          if (!found) return setProblem("That isn't a code or an invitation link. Check it with whoever sent it.");
          if (found.kind === "invitation") {
            setOpening(true);
            return navigate(`/i/${found.code}`);
          }
          if (!session) {
            const back = new URLSearchParams(location.search);
            back.set("code", found.code);
            return navigate("/login", { state: { from: `${location.pathname}?${back.toString()}` } });
          }
          join
            .mutateAsync(found.code)
            .then(({ society }) => navigate(society.slug ? `/society/${society.slug}` : "/society"))
            .catch((error: unknown) => setProblem(error instanceof Error ? error.message : "Could not join. Try again."));
        }}
      >
        <label htmlFor={`${id}-code`} className="sr-only">
          Invite code or link
        </label>
        <Input
          id={`${id}-code`}
          value={value}
          maxLength={200}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={variant === "society" ? "AB12CD34" : "K7Q4MX or a link"}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className="font-semibold tracking-[0.12em] placeholder:font-normal placeholder:tracking-normal"
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
        />
        <Button type="submit" disabled={join.isPending || opening || !value.trim()}>
          {join.isPending ? "Joining…" : opening ? "Opening…" : "Open"}
        </Button>
      </form>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="mt-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          {problem}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {variant === "society" ? "You'll be asked to sign in first." : "6 characters for a private event, 8 for a society."}
        </p>
      )}
    </section>
  );
}
