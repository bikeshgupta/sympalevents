import { Copy, RefreshCw } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEventContext, type SocietyOption } from "@/lib/event-context";
import { useSocietyActions } from "@/lib/societies";

/**
 * The society this event belongs to: its name, and the code that lets a
 * resident join it.
 *
 * Only its admin sees this card at all. The invite code is a join credential -
 * the server withholds it from everybody else (api/_lib/societies.ts), so a
 * committee member reading Settings never sees one to pass on.
 */
export function SocietyCard() {
  const { societies, selectedEvent } = useEventContext();
  const society = societies.find((item) => item.id === selectedEvent?.societyId) ?? null;

  // Only an admin gets the invite code back from the server, and only an admin
  // may change any of this. The guard lives out here so the form below can
  // take a society that is definitely there.
  if (!society || society.role !== "admin") return null;
  return <SocietyForm society={society} />;
}

export function SocietyForm({
  society,
  inEvent = true,
  variant = "card",
}: {
  society: SocietyOption;
  /** False on the society's own management page, where "this event" and "below" mean nothing. */
  inEvent?: boolean;
  /** "card" is Settings' boxed card, unchanged. "page" is Society Management's Overview: no outer box, two plain
   *  sections (details, invite) separated by a hairline. Same state, same handlers, same server calls. */
  variant?: "card" | "page";
}) {
  const { update } = useSocietyActions();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  // Which part of the form a message belongs to, so on the page variant it sits next to the thing it is about.
  const [note, setNote] = useState<{ scope: "details" | "invite"; text: string } | null>(null);
  const setMessage = (text: string, scope: "details" | "invite" = "details") => setNote({ scope, text });
  const message = note?.text ?? null;
  const [copied, setCopied] = useState(false);

  const currentName = name || society.name;
  const currentCity = city || society.city;
  const dirty = currentName !== society.name || currentCity !== society.city;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setMessage("Saving...");
    try {
      await update.mutateAsync({ societyId: society.id, name: currentName, city: currentCity });
      setName("");
      setCity("");
      setMessage("Society saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the society");
    }
  }

  async function handleRotate() {
    if (!window.confirm("Make a new code? The old one stops working for anybody who still has it.")) return;
    setMessage("Making a new code...", "invite");
    try {
      await update.mutateAsync({ societyId: society.id, rotateInviteCode: true });
      setMessage("New code ready. Hand this one out instead.", "invite");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change the code", "invite");
    }
  }

  async function copyCode() {
    if (!society.inviteCode) return;
    try {
      await navigator.clipboard.writeText(society.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and every insecure
      // origin. The code is on screen either way.
      setMessage("Could not copy. The code is above - read it out instead.", "invite");
    }
  }

  if (variant === "page") {
    const field =
      "border-border bg-transparent placeholder:text-muted-foreground/60 focus-visible:bg-background";
    return (
      <div>
        <section aria-labelledby="society-details-heading">
          <h2 id="society-details-heading" className="font-display text-2xl font-semibold">
            Society details
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Your community identity and join settings.</p>

          <form className="mt-5 max-w-md space-y-4" onSubmit={handleSave}>
            <div className="space-y-1.5">
              <Label htmlFor="society-name">Society name</Label>
              <Input
                id="society-name"
                className={field}
                value={currentName}
                onChange={(input) => setName(input.target.value)}
                aria-invalid={!currentName.trim()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="society-city">City</Label>
              <Input
                id="society-city"
                className={field}
                value={currentCity}
                onChange={(input) => setCity(input.target.value)}
                placeholder="Pune"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Quiet until there is something to save, then a plain teal button. */}
              <Button
                type="submit"
                size="sm"
                variant={dirty ? "default" : "ghost"}
                className={dirty ? "h-10" : "h-10 px-0 text-muted-foreground hover:bg-transparent"}
                disabled={!dirty || update.isPending}
              >
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
              {note?.scope === "details" ? (
                <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                  {note.text}
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <section aria-labelledby="invite-heading" className="mt-8 border-t pt-6">
          <h2 id="invite-heading" className="font-display text-2xl font-semibold">
            Invite residents
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Share this code with residents to let them join your society.</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <code className="rounded-md border border-border px-3.5 py-2 font-mono text-lg font-medium tracking-[0.3em]">
              {society.inviteCode ?? "Not set"}
            </code>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleRotate()}
            disabled={update.isPending}
            className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Generate new code
          </button>

          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Anyone with this code can join the society as a resident. Joining the society does not grant access to individual
            events - what they can open is still decided by each event&rsquo;s Modules and Member Access.
          </p>
          {note?.scope === "invite" ? (
            <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
              {note.text}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Society</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {inEvent ? "The group that runs this event. " : "The group that runs these events. "}Everyone who joins it sees every
          event the society runs, opened according to each event&rsquo;s own visibility settings.
        </p>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSave}>
          <div className="space-y-1.5">
            <Label htmlFor="society-name">Name</Label>
            <Input id="society-name" value={currentName} onChange={(field) => setName(field.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="society-city">City</Label>
            <Input
              id="society-city"
              value={currentCity}
              onChange={(field) => setCity(field.target.value)}
              placeholder="Pune"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving..." : "Save society"}
            </Button>
          </div>
        </form>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite code</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-card px-3 py-2 font-mono text-base tracking-widest">
              {society.inviteCode ?? "Not set"}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyCode()}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleRotate()}>
              <RefreshCw className="h-4 w-4" />
              New code
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Anyone with this code can join the society as a resident. Joining gives them no role on any event - what they
            can open is still decided by each event&rsquo;s Modules and Member Access.
          </p>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
