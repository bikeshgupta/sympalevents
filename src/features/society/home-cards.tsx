import { ClipboardPaste, Plus, Sparkles, Ticket } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroAurora, HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";
import { magneticHandlers, useScrollFrame } from "@/lib/dashboard-motion";
import { useSession } from "@/lib/auth";
import { personalArtworkUrl } from "@/lib/personal-artwork";
import { useSocietyActions } from "@/lib/societies";
import { cn } from "@/lib/utils";
import { parseInviteInput } from "../../../shared/personal-events";

/**
 * The home's own cards: the create banner and "Join an event".
 *
 * All three work for somebody who is not signed in. Creating sends them through sign-in first (`/my/new` asks
 * for it and comes straight back); an invitation opens without an account; only joining a society asks to
 * sign in, because membership belongs to an account.
 */

/**
 * The one call to create: a short banner over the birthday artwork drawn in code (personal-artwork.ts), one
 * button. It is a band of the screen, not a hero - the person's own events sit under it and matter more once
 * they have some. Before migration 049 it says personal events are coming and offers nothing that would fail.
 * Which kind of event is chosen on the next page (the form's first step lists every kind).
 *
 * The scrim is light on purpose: the artwork is already dark on its left, where the words are, and a heavier
 * one turned the whole banner nearly black on a phone. White text there stays well above 4.5:1.
 *
 * Motion (all off for `prefers-reduced-motion`, through `useDashboardMotion`): coloured light drifting behind
 * the picture and embers rising through it (the same pieces the event hero uses), the headline rising in a
 * word at a time, the picture easing with the scroll, and a light sweeping the button, which leans towards a
 * mouse. This is the one looping element on the screen.
 */
export function CreateEventBanner({ ready, motion }: { ready: boolean; motion: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLImageElement>(null);
  const onFrame = useCallback((box: DOMRect) => {
    const art = artRef.current;
    if (!art) return;
    // Up to ~24px of drift and a touch of zoom over the banner's own trip up the screen.
    const travel = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height + 120)));
    art.style.transform = `translateY(${(travel * 24).toFixed(1)}px) scale(${(1.04 + travel * 0.05).toFixed(3)})`;
  }, []);
  useScrollFrame(ref, motion, onFrame);
  const headline = "Make every moment special";

  return (
    <section
      ref={ref}
      aria-labelledby="create-banner"
      className={cn("group relative isolate mt-4 overflow-hidden rounded-3xl bg-primary shadow-sm ring-1 ring-black/5", motion && "dfx-row")}
    >
      <img
        ref={artRef}
        src={personalArtworkUrl("birthday")}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full scale-[1.04] object-cover object-[72%_62%] will-change-transform"
      />
      {motion ? (
        <span aria-hidden="true" className="absolute inset-0 -z-10 opacity-60">
          <HeroAurora />
        </span>
      ) : null}
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
      {motion ? (
        <span aria-hidden="true" className="absolute inset-0 -z-10">
          <HeroEmbers />
        </span>
      ) : null}
      <div className="relative flex flex-col justify-center px-5 py-3.5 text-white sm:px-7 sm:py-5">
        <p className="hidden items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/85 sm:flex">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Your space for celebrations
        </p>
        <h2
          id="create-banner"
          aria-label={motion ? headline : undefined}
          className="font-display max-w-[56%] text-[22px] font-semibold leading-tight sm:mt-1 sm:max-w-[60%] sm:text-3xl"
        >
          {motion ? <RisingWords text={headline} /> : headline}
        </h2>
        <p className="mt-1 max-w-[56%] text-sm leading-snug text-white/90 sm:max-w-[60%] sm:text-[15px]">
          {ready ? (
            <>
              Private and invite-only<span className="hidden sm:inline">, free for every birthday, anniversary and get-together</span>.
            </>
          ) : (
            "Private celebrations are coming soon."
          )}
        </p>
        {ready ? (
          <Button
            asChild
            className={cn("mt-2.5 h-10 w-fit bg-white text-foreground shadow-md transition-transform hover:bg-white", motion && "dfx-glint")}
            {...magneticHandlers(motion)}
          >
            <Link to="/my/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create event
            </Link>
          </Button>
        ) : (
          <span className="mt-3 w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">Coming soon</span>
        )}
      </div>
    </section>
  );
}

/**
 * "Join an event": one box for an invitation code (6), a society's code (8), or a whole invitation link
 * pasted from WhatsApp (`parseInviteInput`), plus a "Paste link" button that reads the clipboard and opens what
 * it finds - where the browser lets a page read it; otherwise it just puts the cursor in the box. An invitation
 * opens at `/i/<code>`, which itself says whether the code exists, was cancelled or has closed; a society code
 * is joined right here (`?resource=join`). Joining needs an account, so a signed-out visitor is sent to sign in
 * and brought back to this box with the code still in it (`?code=`), one tap from joining.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shake = () => {
    const form = formRef.current;
    if (!form) return;
    form.classList.remove("dfx-shake");
    void form.offsetWidth;
    form.classList.add("dfx-shake");
  };
  const id = `join-${variant}`;
  const canPaste = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  const open = (text: string) => {
    const found = parseInviteInput(text);
    if (!found) {
      shake();
      return setProblem("That isn't a code or an invitation link. Check it with whoever sent it.");
    }
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
      .catch((error: unknown) => {
        shake();
        setProblem(error instanceof Error ? error.message : "Could not join. Try again.");
      });
  };

  const paste = async () => {
    setProblem(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error("empty");
      setValue(text);
      open(text);
    } catch {
      // Refused or empty: the box is still there to paste into by hand.
      setProblem("Couldn't read a link from your clipboard. Paste it into the box instead.");
      inputRef.current?.focus();
    }
  };

  const busy = join.isPending || opening;
  return (
    <section aria-labelledby={`${id}-heading`} className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Ticket className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-heading`} className="font-display text-lg font-semibold leading-tight">
            {variant === "society" ? "Join a society" : "Joining an event?"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {variant === "society" ? "Enter the 8-character code your committee shared." : "Enter a code, or paste the link you were sent."}
          </p>
        </div>
        {variant === "event" && canPaste ? (
          <button
            type="button"
            onClick={() => void paste()}
            disabled={busy}
            className="-mr-1 ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            Paste link
          </button>
        ) : null}
      </div>
      <form
        ref={formRef}
        onAnimationEnd={(event) => event.currentTarget.classList.remove("dfx-shake")}
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          open(value);
        }}
      >
        <label htmlFor={`${id}-code`} className="sr-only">
          Invite code or link
        </label>
        <Input
          ref={inputRef}
          id={`${id}-code`}
          value={value}
          maxLength={200}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={variant === "society" ? "AB12CD34" : "K7Q4MX"}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-help`}
          className="h-10 font-semibold tracking-[0.12em] placeholder:font-normal"
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
        />
        <Button type="submit" className="h-10" disabled={busy || !value.trim()}>
          {join.isPending ? "Joining…" : opening ? "Opening…" : variant === "society" ? "Join" : "Open"}
        </Button>
      </form>
      <div className="mt-2">
        {problem ? (
          <p id={`${id}-help`} role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : (
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            {variant === "society" ? (session ? "You join as a resident." : "You'll be asked to sign in first.") : "6 characters for a private event, 8 for a society."}
          </p>
        )}
      </div>
    </section>
  );
}
