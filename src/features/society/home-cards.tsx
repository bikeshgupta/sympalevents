import { CalendarHeart, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyCode, PERSONAL_KINDS } from "../../../shared/personal-events";

/**
 * The two cards My space and the signed-out home share: "Create your free event" and "Got a code?".
 *
 * Both work for somebody who is not signed in. Creating sends them through sign-in first (`/my/new` asks for
 * it and comes straight back); a code needs no account to *open* - an invitation can be replied to as a
 * guest - and only joining a society asks for sign-in, because membership belongs to an account.
 */
export function CreateEventCard({ ready, canCreateSocietyEvent = false }: { ready: boolean; canCreateSocietyEvent?: boolean }) {
  return (
    <section aria-labelledby="host-own" className="mt-8 border-t pt-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarHeart className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="host-own" className="font-display text-xl font-semibold">
            {ready ? "Create your free event" : "Host your own celebration"}
          </h2>
          <p className="mt-1 max-w-prose text-[15px] text-muted-foreground">
            Birthdays, anniversaries, baby showers and get-togethers: private and invite-only, free, with replies
            and wishes in one place.{ready ? " Guests reply without an account." : " Coming soon to My space."}
          </p>
          {ready ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {PERSONAL_KINDS.slice(0, 6).map((kind) => (
                  <Link
                    key={kind.key}
                    to={`/my/new?kind=${kind.key}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span aria-hidden="true">{kind.emoji}</span>
                    {kind.name}
                  </Link>
                ))}
              </div>
              <Button asChild className="mt-3">
                <Link to="/my/new">Create my event</Link>
              </Button>
            </>
          ) : null}
          {canCreateSocietyEvent ? (
            <Link
              to="/new-event"
              className="mt-2 flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Create a society event &rarr;
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * One box for both kinds of code, told apart by length (`classifyCode`): six characters is an invitation to
 * a personal event (opened at `/i/<code>`, no account needed), eight is a society's invite code (joined at
 * `/join/<code>`, which asks for sign-in first).
 */
export function CodeBox() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <section aria-labelledby="code-heading" className="mt-8 border-t pt-6">
      <h2 id="code-heading" className="font-display text-xl font-semibold">
        Got a code?
      </h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        An invitation from a friend (6 letters and numbers), or your society&rsquo;s code (8).
      </p>
      <form
        className="mt-3 flex max-w-sm gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const found = classifyCode(value);
          if (!found) return setProblem("That doesn't look like a code. Check it with whoever sent it.");
          navigate(found.kind === "invitation" ? `/i/${found.code}` : `/join/${found.code}`);
        }}
      >
        <label htmlFor="any-code" className="sr-only">
          Code
        </label>
        <Input
          id="any-code"
          value={value}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="K7Q4MX"
          className="font-semibold uppercase tracking-[0.2em]"
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
        />
        <Button type="submit">Open</Button>
      </form>
      {problem ? <p className="mt-2 text-sm text-destructive">{problem}</p> : null}
    </section>
  );
}
