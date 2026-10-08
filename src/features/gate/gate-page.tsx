import { AlertTriangle, Check, Minus, Plus, ScanLine, UserPlus, Wifi, WifiOff } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanDialog } from "@/features/gate/scan-dialog";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { confirmedPayment, scanningSupported, useGate, useOnline, type GateBooking } from "@/lib/gate";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The gate: one screen for a volunteer with a phone or a tablet.
 *
 * Built for being read at arm's length in a crowd. Everything is large, one
 * thing is asked at a time (find somebody, then admit them), and the only
 * navigation anywhere near it is the page's own. A volunteer given access to the
 * Gate page and nothing else sees nothing else - see api/_lib/gate.ts.
 *
 * ## Honest about connectivity
 *
 * A check-in is shown as done only once the server has answered, never before.
 * The strip at the top says whether the phone believes it is online and when the
 * server last answered, and while it is offline the buttons are off: an
 * unsaved check-in that looked saved would let the same household in twice, or
 * not at all. There is deliberately no offline queue yet - that wants the online
 * workflow proven first.
 */
export function GatePage() {
  const { selectedEventId } = useEventContext();
  const { data: eventData } = useEventData({ includeTasks: false });
  const online = useOnline();

  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [scanning, setScanning] = useState(false);
  const [walkIn, setWalkIn] = useState(false);

  // Search as they type, but not on every key: a phone keyboard is slow and
  // every request is somebody else's battery.
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const { query, act } = useGate(selectedEventId, term);
  const data = query.data;
  const synced = query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null;
  const stats = data?.stats;

  function search(value: string) {
    setInput(value);
    setTerm(value.trim());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Gate</h1>
          <p className="truncate text-sm text-muted-foreground">{eventData.event.name}</p>
        </div>
        <p
          role="status"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            online && !query.isError ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900",
          )}
        >
          {online && !query.isError ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {!online
            ? "Offline - check-ins are paused"
            : query.isError
              ? "Can't reach the server"
              : synced
                ? `Synced ${synced.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`
                : "Connecting…"}
        </p>
      </header>

      {stats ? (
        <StatGrid>
          <StatCard title="Checked in" shortTitle="In" value={`${stats.checkedIn} / ${stats.attendees}`} icon={Check} />
          <StatCard title="Food served" shortTitle="Food" value={`${stats.foodServed} / ${stats.food}`} icon={Check} />
          <StatCard title="Walk-ins" shortTitle="Walk-in" value={String(stats.walkIns)} icon={UserPlus} />
          <StatCard title="Pending payment" shortTitle="Unpaid" value={String(stats.pendingPayment)} icon={AlertTriangle} />
        </StatGrid>
      ) : null}

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <label htmlFor="gate-search" className="block text-sm font-medium">
          Find a booking
        </label>
        <div className="flex gap-2">
          <Input
            id="gate-search"
            className="h-12 text-base"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Name, flat or booking code"
            autoComplete="off"
            autoCapitalize="off"
            inputMode="search"
          />
          <Button
            type="button"
            className="h-12 shrink-0 px-4"
            disabled={!online || !scanningSupported()}
            onClick={() => setScanning(true)}
            title={scanningSupported() ? undefined : "Scanning is not supported in this browser - search instead"}
          >
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Scan QR
          </Button>
        </div>
        {!scanningSupported() ? (
          <p className="text-xs text-muted-foreground">
            This browser cannot scan QR codes. Search by name, flat or booking code, or paste the pass code.
          </p>
        ) : null}
      </section>

      {query.isError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load the gate."}
        </p>
      ) : null}

      {term.length >= 2 ? (
        data?.results.length ? (
          <ul className="space-y-3">
            {data.results.map((booking) => (
              <li key={booking.id}>
                <BookingPanel
                  booking={booking}
                  canOverride={data.canOverride}
                  online={online}
                  busy={act.isPending}
                  onAct={(request) => act.mutateAsync(request).then((response) => response.registration)}
                />
              </li>
            ))}
          </ul>
        ) : query.isFetching ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : (
          <div className="space-y-2 rounded-xl border border-dashed p-5 text-sm">
            <p>Nobody found for &ldquo;{term}&rdquo;.</p>
            <Button type="button" variant="outline" className="h-11" onClick={() => setWalkIn(true)} disabled={!online}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add as a walk-in
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Type at least two letters, or scan a pass.</p>
      )}

      {walkIn ? (
        <WalkInForm
          initialName={/\d/.test(term) ? "" : term}
          busy={act.isPending}
          onCancel={() => setWalkIn(false)}
          onSubmit={async (values) => {
            const booking = await act.mutateAsync({ action: "walk_in", ...values });
            setWalkIn(false);
            search(booking.registration.bookingCode);
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="h-12 w-full" disabled={!online} onClick={() => setWalkIn(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add a walk-in
        </Button>
      )}

      <ScanDialog
        open={scanning}
        onOpenChange={setScanning}
        onScan={(value) => {
          setScanning(false);
          search(value);
        }}
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button type="button" variant="outline" size="icon" className="h-12 w-12" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-5 w-5" aria-hidden="true" />
      </Button>
      <span className="w-10 text-center text-xl font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button type="button" variant="outline" size="icon" className="h-12 w-12" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function BookingPanel({
  booking: b,
  canOverride,
  online,
  busy,
  onAct,
}: {
  booking: GateBooking;
  canOverride: boolean;
  online: boolean;
  busy: boolean;
  onAct: (
    request:
      | { action: "check_in" | "serve_food"; id: string; version: number; count: number; override?: boolean }
      | { action: "cash"; id: string; version: number },
  ) => Promise<GateBooking>;
}) {
  const people = b.adults + b.children;
  const remainingIn = people - b.checkedIn;
  const foodReady = Math.max(0, Math.min(b.food, b.checkedIn) - b.foodServed);
  const confirmed = confirmedPayment(b);
  const cancelled = b.status === "cancelled";

  const [arriving, setArriving] = useState(Math.max(1, remainingIn));
  const [meals, setMeals] = useState(Math.max(1, foodReady));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // The steppers follow the booking: after somebody is admitted, "how many are
  // arriving" must become the number still outside, not stay where it was.
  useEffect(() => setArriving(Math.max(1, remainingIn)), [remainingIn]);
  useEffect(() => setMeals(Math.max(1, foodReady)), [foodReady]);

  async function run(
    request:
      | { action: "check_in" | "serve_food"; id: string; version: number; count: number; override?: boolean }
      | { action: "cash"; id: string; version: number },
    done: (after: GateBooking) => string,
  ) {
    setMessage(null);
    try {
      const after = await onAct(request);
      setMessage({ tone: "ok", text: done(after) });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }

  const checkIn = (override: boolean) => {
    const target = b.checkedIn + arriving;
    void run(
      { action: "check_in", id: b.id, version: b.version, count: target, override },
      (after) =>
        after.checkedIn === b.checkedIn
          ? `Already checked in - ${after.checkedIn} of ${people}.`
          : `Checked in ${after.checkedIn} of ${people}.`,
    );
  };

  return (
    <article className={cn("space-y-3 rounded-xl border bg-card p-4", cancelled && "opacity-80")} aria-label={`${b.name}, ${b.flat}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">{b.name}</h2>
          <p className="text-sm text-muted-foreground">
            Flat {b.flat} · Booking {b.bookingCode}
            {b.walkIn ? " · Walk-in" : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            cancelled
              ? "bg-muted text-muted-foreground"
              : confirmed
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-900",
          )}
        >
          {cancelled ? "Cancelled" : confirmed ? (b.payment === "free" ? "Free entry" : "Payment verified") : b.payment === "submitted" ? "Payment submitted" : "Payment due"}
        </span>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Attendees", people],
          ["Checked in", `${b.checkedIn}`],
          ["Food booked", b.food],
          ["Food served", `${b.foodServed}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md bg-muted/60 px-1 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {cancelled ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          This booking was cancelled. Do not admit.
        </p>
      ) : (
        <>
          {!confirmed ? (
            <div role="alert" className="space-y-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Payment is not confirmed - {formatCurrency(b.amountDue / 100)} due.
              </p>
              {canOverride ? (
                <p>You can record cash, or admit them anyway. Both are logged against your name.</p>
              ) : (
                <p>Ask an organiser to confirm payment before they come in.</p>
              )}
              {canOverride ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full bg-background"
                  disabled={busy || !online}
                  onClick={() => {
                    if (window.confirm(`Confirm ${formatCurrency(b.amountDue / 100)} cash received from ${b.name}?`)) {
                      void run({ action: "cash", id: b.id, version: b.version }, () => "Cash recorded. Payment is now verified.");
                    }
                  }}
                >
                  Cash received · {formatCurrency(b.amountDue / 100)}
                </Button>
              ) : null}
            </div>
          ) : null}

          {remainingIn > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Arriving now</p>
              <div className="flex flex-wrap items-center gap-3">
                <Stepper label="people arriving" value={arriving} min={1} max={remainingIn} onChange={setArriving} />
                <Button
                  type="button"
                  className="h-12 flex-1 text-base"
                  disabled={busy || !online || (!confirmed && !canOverride)}
                  onClick={() => checkIn(!confirmed)}
                >
                  {confirmed ? `Check in ${arriving}` : `Admit ${arriving} anyway`}
                </Button>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <Check className="h-4 w-4" aria-hidden="true" />
              Everyone on this booking is checked in.
            </p>
          )}

          {b.food > 0 ? (
            foodReady > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Meals to serve</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Stepper label="meals to serve" value={meals} min={1} max={foodReady} onChange={setMeals} />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 flex-1 text-base"
                    disabled={busy || !online}
                    onClick={() =>
                      void run(
                        { action: "serve_food", id: b.id, version: b.version, count: b.foodServed + meals, override: !confirmed },
                        (after) => `Served ${after.foodServed} of ${b.food} meals.`,
                      )
                    }
                  >
                    Serve {meals} {meals === 1 ? "meal" : "meals"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {b.foodServed >= b.food ? "All booked meals served." : "Meals can be served once people are checked in."}
              </p>
            )
          ) : null}
        </>
      )}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md p-3 text-sm font-medium",
            message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-900",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </article>
  );
}

function WalkInForm({
  initialName,
  busy,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; flat: string; adults: number; children: number; idempotency_key: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [flat, setFlat] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // One key per form, so a double tap books once.
  const [key] = useState(() => crypto.randomUUID());

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({ name: name.trim(), flat: flat.trim(), adults, children, idempotency_key: key });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">Add a walk-in</h2>
      <p className="text-sm text-muted-foreground">Name and flat. Payment is taken or confirmed after.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input className="h-12 text-base" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="off" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Flat</span>
          <Input className="h-12 text-base" value={flat} onChange={(event) => setFlat(event.target.value)} required maxLength={40} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="space-y-1.5 text-sm">
          <span className="font-medium">Adults</span>
          <Stepper label="adults" value={adults} min={0} max={20} onChange={setAdults} />
        </div>
        <div className="space-y-1.5 text-sm">
          <span className="font-medium">Children</span>
          <Stepper label="children" value={children} min={0} max={20} onChange={setChildren} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1" disabled={busy || adults + children < 1 || !name.trim() || !flat.trim()}>
          Add and find booking
        </Button>
        <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
