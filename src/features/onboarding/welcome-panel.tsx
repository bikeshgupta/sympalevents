import { ArrowRight, Building2, CalendarPlus, KeyRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSocietyActions } from "@/lib/societies";

/**
 * What a signed-in person sees before they belong to anything.
 *
 * Without it they landed on a dashboard showing the demo Ganesh Chaturthi,
 * with a badge explaining that the data was not real - which reads as a broken
 * app rather than an empty one. There are exactly two ways forward from here
 * and this says so: start an event, or join the society that already has one.
 */
export function WelcomePanel() {
  const { join } = useSocietyActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setJoined(null);
    try {
      const result = await join.mutateAsync(code);
      setJoined(result.society.name);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that society");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to SymPal Events</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          You are signed in but not part of any event yet. Either start one for your society, or join a society that is
          already running theirs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <Card>
          <CardContent className="space-y-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarPlus className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Start an event</h2>
            <p className="text-sm text-muted-foreground">
              A festival, a sports meet, a cultural night, or a blank slate. Pick what it is made of before anybody
              sees it. You become its admin.
            </p>
            <Button asChild>
              <Link to="/new-event">
                New event
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Join your society</h2>
            <p className="text-sm text-muted-foreground">
              Ask your committee for the society&rsquo;s invite code. Their events then show up in your switcher.
            </p>
            <form className="space-y-3" onSubmit={handleJoin}>
              <div className="space-y-1.5">
                <Label htmlFor="welcome-code">Invite code</Label>
                <Input
                  id="welcome-code"
                  value={code}
                  onChange={(field) => setCode(field.target.value.toUpperCase())}
                  placeholder="ABCD2345"
                  autoComplete="off"
                  className="font-mono tracking-widest"
                />
              </div>
              {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
              {joined ? (
                <p className="rounded-md bg-accent/60 p-3 text-sm text-accent-foreground">
                  You joined {joined}. Their events are in your switcher now.
                </p>
              ) : null}
              <Button type="submit" variant="outline" disabled={join.isPending || !code.trim()}>
                {join.isPending ? "Joining…" : "Join society"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center">
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            A society is the group that runs the events: your building, your complex, your school. One society can run
            as many events as it likes, and everyone who belongs to it sees them all.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
