import { Check, HandHelping, Mic2, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEventTimestamp, formatEventTimestampTime } from "@/features/dashboard/dashboard-utils";
import { useSession } from "@/lib/auth";
import { useEventData } from "@/lib/event-data";
import { usePageAccess } from "@/lib/page-access";
import { useProfileDefaults } from "@/lib/profile";
import { istInputToIso, isoToIstInput, useOpportunities, type Opportunity, type OpportunityKind } from "@/lib/opportunities";
import { cn } from "@/lib/utils";

const textarea =
  "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Get involved: what the event needs people for, and a way to say yes.
 *
 * One page, two audiences. A resident sees what is wanted and signs up in a
 * few taps; the organisers see the same list with who has signed up beside each
 * line, and add or close things. Residents are only ever shown counts - who
 * signed up, and their phone numbers, are the organisers' (see
 * api/_lib/opportunities.ts).
 */
export function VolunteersPage() {
  const { data } = useEventData({ includeTasks: false });
  const { data: session } = useSession();
  const access = usePageAccess("volunteers");
  const { query, act } = useOpportunities(data.event.id, data.source !== "demo");
  const [editing, setEditing] = useState<Opportunity | "new" | null>(null);
  const payload = query.data;
  const canManage = Boolean(payload?.canManage);
  const items = payload?.items ?? [];
  const volunteer = items.filter((item) => item.kind === "volunteer");
  const performance = items.filter((item) => item.kind === "performance");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Get involved</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? `Ask for helpers and performers for ${data.event.name}, and see who has said yes.`
              : `Lend a hand or take the stage at ${data.event.name}.`}
          </p>
        </div>
        {canManage ? (
          <Button type="button" className="h-10" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ask for people
          </Button>
        ) : null}
      </header>

      {data.source === "demo" ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Sign-ups appear here once this event is live.</p>
      ) : query.isLoading || access.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/70" />
        </div>
      ) : query.isError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load this page."}
        </p>
      ) : (
        <>
          {payload && !payload.ready ? (
            <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Sign-ups need supabase/migrations/040_opportunities.sql. Run it in Supabase, then reload this page.
            </p>
          ) : null}

          {!items.length ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {canManage
                ? "Nothing asked for yet. Use “Ask for people” to list a job that needs helpers, or an open call for performers."
                : "Nothing to sign up for right now. When the organisers need helpers or performers, it will be here."}
            </p>
          ) : null}

          <Section icon={HandHelping} title="Help out" items={volunteer} signedIn={Boolean(session?.user)} canManage={canManage} act={act.mutateAsync} onEdit={setEditing} />
          <Section icon={Mic2} title="On stage" items={performance} signedIn={Boolean(session?.user)} canManage={canManage} act={act.mutateAsync} onEdit={setEditing} />
        </>
      )}

      {editing ? <OpportunityDialog opportunity={editing === "new" ? null : editing} onClose={() => setEditing(null)} act={act.mutateAsync} /> : null}
    </div>
  );
}

type Act = (body: Record<string, unknown>) => Promise<unknown>;

function Section({ icon: Icon, title, items, signedIn, canManage, act, onEdit }: { icon: typeof HandHelping; title: string; items: Opportunity[]; signedIn: boolean; canManage: boolean; act: Act; onEdit: (item: Opportunity) => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {items.map((item) => (
        <OpportunityCard key={item.id} item={item} signedIn={signedIn} canManage={canManage} act={act} onEdit={() => onEdit(item)} />
      ))}
    </section>
  );
}

function OpportunityCard({ item, signedIn, canManage, act, onEdit }: { item: Opportunity; signedIn: boolean; canManage: boolean; act: Act; onEdit: () => void }) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await act(body);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const places = item.slots === null ? `${item.taken} signed up` : item.full ? "All places taken" : `${item.left} of ${item.slots} places left`;
  const mine = item.mine;

  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          {item.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.description}</p> : null}
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", item.closed ? "bg-muted text-muted-foreground" : item.full ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800")}>
          {item.closed ? "Closed" : item.full ? "Full" : "Open"}
        </span>
      </div>
      <p className="mt-2 text-sm tabular-nums text-muted-foreground">
        {places}
        {item.closesAt ? ` · closes ${formatEventTimestamp(item.closesAt)}, ${formatEventTimestampTime(item.closesAt)}` : ""}
      </p>

      {/* The resident's own state, or the way to join. */}
      <div className="mt-3">
        {mine ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              {mine.status === "confirmed" ? "You're in" : mine.status === "pending" ? "Sent - waiting for the organisers" : "The organisers could not fit this one in"}
            </p>
            <Button type="button" variant="ghost" className="h-10" disabled={busy} onClick={() => void run({ action: "withdraw", opportunityId: item.id })}>
              Withdraw
            </Button>
          </div>
        ) : item.closed || item.full ? null : !signedIn ? (
          <Button asChild variant="outline" className="h-11">
            <Link to="/login" state={{ from: window.location.pathname }}>
              Sign in to sign up
            </Link>
          </Button>
        ) : joining ? (
          <JoinForm
            item={item}
            busy={busy}
            onCancel={() => setJoining(false)}
            onSubmit={async (body) => {
              if (await run({ action: "join", opportunityId: item.id, ...body })) setJoining(false);
            }}
          />
        ) : (
          <Button type="button" className="h-11" onClick={() => setJoining(true)}>
            {item.kind === "volunteer" ? "I'll help" : "I'd like to perform"}
          </Button>
        )}
        {error ? (
          <p role="alert" className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {canManage ? <ManagerPanel item={item} act={run} busy={busy} onEdit={onEdit} /> : null}
    </article>
  );
}

function JoinForm({ item, busy, onSubmit, onCancel }: { item: Opportunity; busy: boolean; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const performance = item.kind === "performance";
  const mine = useProfileDefaults();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    await onSubmit({
      note: text("note"),
      contact: text("contact"),
      details: performance ? { act: text("act"), minutes: Number(text("minutes")) || null, performers: text("performers") } : undefined,
    });
  }
  const id = (name: string) => `${item.id}-${name}`;
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg border bg-background p-3">
      {performance ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("act")}>What will you perform?</Label>
            <Input id={id("act")} name="act" required maxLength={100} placeholder="Group dance, song, skit…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("minutes")}>How long (minutes)</Label>
              <Input id={id("minutes")} name="minutes" type="number" min={1} max={60} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("performers")}>Who is performing</Label>
              <Input id={id("performers")} name="performers" maxLength={200} placeholder="Names, or “5 kids from B wing”" />
            </div>
          </div>
        </>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={id("contact")}>Phone number {performance ? "" : "(optional)"}</Label>
        <Input key={mine.loaded ? "profile" : "blank"} defaultValue={mine.phone} id={id("contact")} name="contact" type="tel" inputMode="tel" required={performance} maxLength={40} autoComplete="tel" />
        <p className="text-xs text-muted-foreground">Only the organisers see this.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("note")}>Anything the organisers should know (optional)</Label>
        <textarea id={id("note")} name="note" maxLength={500} className={textarea} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy}>
          {busy ? "Sending…" : item.kind === "volunteer" ? "Sign me up" : "Send to the organisers"}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ManagerPanel({ item, act, busy, onEdit }: { item: Opportunity; act: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean; onEdit: () => void }) {
  const entries = item.signups ?? [];
  return (
    <div className="mt-4 space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => void act({ action: "update", id: item.id, status: item.closed ? "open" : "closed" })}>
          {item.closed ? "Reopen" : "Close sign-up"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 text-destructive"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove "${item.title}"${entries.length ? ` and its ${entries.length} entries` : ""}? This cannot be undone.`)) void act({ action: "delete", id: item.id });
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Remove
        </Button>
      </div>
      {entries.length ? (
        <ul className="divide-y rounded-md border">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{entry.name}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", entry.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : entry.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>
                  {entry.status === "confirmed" ? "Confirmed" : entry.status === "pending" ? "Needs a decision" : "Declined"}
                </span>
              </div>
              {entry.details.act ? (
                <p>
                  {entry.details.act}
                  {entry.details.minutes ? ` · ${entry.details.minutes} min` : ""}
                  {entry.details.performers ? ` · ${entry.details.performers}` : ""}
                </p>
              ) : null}
              {entry.contact ? (
                <p>
                  <a className="text-primary underline-offset-2 hover:underline" href={`tel:${entry.contact.replace(/[^0-9+]/g, "")}`}>
                    {entry.contact}
                  </a>
                </p>
              ) : null}
              {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
              {entry.status !== "confirmed" || item.kind === "performance" ? (
                <div className="flex gap-2 pt-1">
                  {entry.status !== "confirmed" ? (
                    <Button type="button" className="h-10" disabled={busy} onClick={() => void act({ action: "decide", signupId: entry.id, status: "confirmed" })}>
                      Confirm
                    </Button>
                  ) : null}
                  {entry.status !== "declined" ? (
                    <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => void act({ action: "decide", signupId: entry.id, status: "declined" })}>
                      Decline
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody has signed up yet.</p>
      )}
    </div>
  );
}

function OpportunityDialog({ opportunity, onClose, act }: { opportunity: Opportunity | null; onClose: () => void; act: Act }) {
  const [kind, setKind] = useState<OpportunityKind>(opportunity?.kind ?? "volunteer");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const slots = Number(text("slots"));
    const body = {
      title: text("title"),
      description: text("description"),
      slots: text("slots") && slots > 0 ? Math.round(slots) : null,
      closesAt: istInputToIso(text("closesAt")),
    };
    setSaving(true);
    setError(null);
    try {
      await act(opportunity ? { action: "update", id: opportunity.id, ...body } : { action: "create", kind, ...body });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{opportunity ? "Edit sign-up" : "Ask for people"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {opportunity ? null : (
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sr-only">What are you asking for?</legend>
              {(["volunteer", "performance"] as const).map((value) => (
                <label key={value} className={cn("flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium", kind === value ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
                  <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                  {value === "volunteer" ? "Helpers" : "Performers"}
                </label>
              ))}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="opp-title">{kind === "volunteer" ? "What is the job?" : "What is the call?"}</Label>
            <Input id="opp-title" name="title" required minLength={2} maxLength={100} defaultValue={opportunity?.title} placeholder={kind === "volunteer" ? "Parking help" : "Open mic for the cultural evening"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opp-description">Details (optional)</Label>
            <textarea id="opp-description" name="description" maxLength={1000} defaultValue={opportunity?.description} className={textarea} placeholder="When, where, what it involves" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opp-slots">How many people (blank for no limit)</Label>
              <Input id="opp-slots" name="slots" type="number" min={1} max={500} inputMode="numeric" defaultValue={opportunity?.slots ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opp-closes">Sign-up closes (IST, optional)</Label>
              <Input id="opp-closes" name="closesAt" type="datetime-local" defaultValue={isoToIstInput(opportunity?.closesAt ?? null)} />
            </div>
          </div>
          {error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
