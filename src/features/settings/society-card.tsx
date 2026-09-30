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

function SocietyForm({ society }: { society: SocietyOption }) {
  const { update } = useSocietyActions();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage("Making a new code...");
    try {
      await update.mutateAsync({ societyId: society.id, rotateInviteCode: true });
      setMessage("New code ready. Hand this one out instead.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change the code");
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
      setMessage("Could not copy. The code is above - read it out instead.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Society</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The group that runs this event. Everyone who joins it sees every event the society runs, opened according to
          each event&rsquo;s own visibility settings.
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
            Anyone with this code can join the society. Joining gives them no role on any event - what they can open is
            still decided by Modules and Member Access below.
          </p>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
