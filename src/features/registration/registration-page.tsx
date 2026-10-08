import { FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarCheck, Check, Ticket, Users, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEventContext } from "@/lib/event-context";
import { useRegistration, type RegistrationPayload } from "@/lib/registration";
import { formatCurrency } from "@/lib/utils";
import {
  paymentLabels,
  quoteBooking,
  type Registration,
  type RegistrationConfig,
} from "../../../shared/registration";

export function RegistrationPage() {
  const { selectedEventId } = useEventContext();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const { query, mutation } = useRegistration(selectedEventId, page, term);
  const location = useLocation();
  const [chosenTab, setTab] = useState<"mine" | "manage" | "setup" | null>(
    null,
  );
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(method: "POST" | "PUT" | "PATCH", body: unknown) {
    setNotice("");
    await mutation.mutateAsync({ method, body });
    setNotice("Saved successfully.");
  }
  if (!selectedEventId)
    return (
      <div className="rounded-xl border p-6">
        <h1 className="text-2xl font-semibold">Participate</h1>
        <p className="mt-2 text-muted-foreground">
          Choose an event to register. This preview does not accept bookings.
        </p>
      </div>
    );
  if (query.isLoading) return <p role="status">Loading registration…</p>;
  if (query.error)
    return (
      <div role="alert" className="rounded-xl bg-destructive/10 p-4">
        <p>{query.error.message}</p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  const data = query.data;
  if (!data) return null;
  const tab = chosenTab ?? (data.canManage ? "manage" : "mine");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <p className="text-sm text-primary">Your community, together</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Participate</h1>
        <p className="mt-2 text-muted-foreground">
          Register a household, track payments and manage entry.
        </p>
      </header>
      {data.canManage && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Registration sections"
        >
          {(
            [
              ["mine", "My registration"],
              ["manage", "Attendees & entry"],
              ["setup", "Registration setup"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "outline"}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {mutation.error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {mutation.error.message}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {tab === "setup" && data.canManage ? (
        <ConfigForm
          key={JSON.stringify(data.config)}
          config={data.config}
          pending={mutation.isPending}
          onSave={(c) => save("PUT", c)}
        />
      ) : tab === "manage" && data.canManage ? (
        <>
          <Summary data={data} />
          <Button onClick={() => setAdding(!adding)}>
            {adding ? "Close form" : "Add household"}
          </Button>
          {adding && (
            <BookingForm
              admin
              config={data.config}
              pending={mutation.isPending}
              onSave={async (body) => {
                await save("POST", body);
                setAdding(false);
              }}
            />
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setTerm(search);
            }}
          >
            <Input
              aria-label="Find attendee by name, flat or full booking ID"
              placeholder="Name, flat or booking ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            Verify payments against your bank or UPI statement. A submitted
            reference is not proof of receipt. Ticket collections are shown
            separately from voluntary contributions.
          </p>
          {data.registrations?.length ? (
            data.registrations.map((r) => (
              <BookingCard
                key={r.id}
                row={r}
                manager
                pending={mutation.isPending}
                onAction={(action, value) =>
                  save("PATCH", { id: r.id, version: r.version, action, value })
                }
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed p-6">
              No matching registrations yet.
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              disabled={!page || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={!data.hasMore || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <>
          <Pricing config={data.config} attendees={data.summary.attendees} />
          {data.mine && (
            <BookingCard
              row={data.mine}
              pending={mutation.isPending}
              onAction={(action, value) =>
                save("PATCH", {
                  id: data.mine!.id,
                  version: data.mine!.version,
                  action,
                  value,
                })
              }
            />
          )}
          {data.mine?.status !== "active" &&
            (data.config.enabled && data.config.self_service ? (
              data.signedIn ? (
                <BookingForm
                  config={data.config}
                  pending={mutation.isPending}
                  onSave={(body) => save("POST", body)}
                />
              ) : (
                <div className="rounded-xl border bg-card p-5">
                  <p className="mb-3">
                    Sign in to book and access your registration securely.
                  </p>
                  <Button asChild>
                    <Link to="/login" state={{ from: location.pathname }}>
                      Sign in to register
                    </Link>
                  </Button>
                </div>
              )
            ) : (
              <p className="rounded-xl border border-dashed p-5">
                Contact the event organiser to register with your name and flat
                number. Existing booking details remain available above.
              </p>
            ))}
          {data.config.payment_instructions && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">How to pay</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {data.config.payment_instructions}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pay the exact booking total, then submit the transaction
                reference on your booking. The organiser will verify receipt.
              </p>
            </section>
          )}
          {data.config.cancellation_policy && (
            <section className="rounded-xl border p-5">
              <h2 className="font-semibold">Cancellation policy</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {data.config.cancellation_policy}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function Pricing({
  config: c,
  attendees,
}: {
  config: RegistrationConfig;
  attendees: number;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Ticket className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Entry & food</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Price label={`Age ${c.child_age_limit}+`} value={c.adult_price} />
        <Price label={`Under ${c.child_age_limit}`} value={c.child_price} />
        {c.food_enabled && (
          <Price label="Optional food / person" value={c.food_price} />
        )}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {c.audience === "society" ? "Society members" : "Open registration"} ·{" "}
        {c.allow_guests ? "Guests welcome with your group" : "Residents only"}
        {c.capacity !== null
          ? ` · ${Math.max(0, c.capacity - attendees)} places remaining`
          : ""}
      </p>
      {c.closes_at && (
        <p className="mt-2 text-sm">
          Register by{" "}
          {new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }).format(new Date(c.closes_at))}{" "}
          IST
        </p>
      )}
    </section>
  );
}
function Price({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {value ? formatCurrency(value / 100) : "Free"}
      </p>
    </div>
  );
}
function BookingForm({
  config: c,
  pending,
  onSave,
  admin = false,
}: {
  config: RegistrationConfig;
  pending: boolean;
  admin?: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [food, setFood] = useState(0);
  const [guests, setGuests] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const total = quoteBooking(c, { adults, children, food_count: food });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await onSave({
        contact_name: f.get("name"),
        flat: f.get("flat"),
        adults,
        children,
        guests,
        food_count: food,
        idempotency_key: key,
        quoted_amount: total,
        on_behalf: admin,
      });
    } catch {
      /* parent displays API errors */
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold">
        {admin ? "Add household" : "Who is coming?"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {admin
          ? "Name and flat are enough. Starts with one adult; add family or food details if needed."
          : "One booking per account. Include guests in the adult/child totals."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name">
          <Input
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </Field>
        <Field label="Flat / household">
          <Input name="flat" required maxLength={40} placeholder="D104" />
        </Field>
        {(!admin || expanded) && (
          <>
            <Counter
              label={`Adults (${c.child_age_limit}+)`}
              value={adults}
              onChange={setAdults}
              max={20}
            />
            <Counter
              label={`Children (under ${c.child_age_limit})`}
              value={children}
              onChange={setChildren}
              max={20}
            />
            {c.allow_guests && (
              <Counter
                label="Of these, how many are guests?"
                value={guests}
                onChange={setGuests}
                max={adults + children}
              />
            )}{" "}
            {c.food_enabled && (
              <Counter
                label="Food portions"
                value={food}
                onChange={setFood}
                max={adults + children}
              />
            )}
          </>
        )}
      </div>
      {admin && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide optional details" : "Add family / food details"}
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {adults + children} attendees · Total
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(total / 100)}
          </p>
        </div>
        <Button
          type="submit"
          disabled={
            pending ||
            adults + children < 1 ||
            food > adults + children ||
            guests > adults + children
          }
        >
          {pending ? "Booking…" : "Confirm registration"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Prices are locked when you register. To change your group, cancel and
        book again; paid cancellations require organiser review.
      </p>
    </form>
  );
}
function Counter({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        max={max}
        step={1}
        required
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function BookingCard({
  row: r,
  manager = false,
  pending,
  onAction,
}: {
  row: Registration;
  manager?: boolean;
  pending: boolean;
  onAction: (a: string, v?: string) => Promise<void>;
}) {
  const [reference, setReference] = useState(r.payment_reference);
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(1);
  const admitted =
    r.payment_status === "verified" || r.payment_status === "free";
  async function act(a: string, v?: string) {
    try {
      await onAction(a, v);
    } catch {
      /* parent displays errors */
    }
  }
  return (
    <article className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {manager ? `${r.contact_name} · ${r.flat}` : "My registration"}
          </h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Booking {r.id}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          {r.status === "cancelled" ? "Cancelled · " : ""}
          {paymentLabels[r.payment_status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {r.adults} adults · {r.children} children
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Utensils className="h-4 w-4" />
          {r.food_count} meals
        </span>
        <span className="font-semibold tabular-nums">
          {formatCurrency(r.amount_due / 100)}
        </span>
      </div>
      <p className="text-sm">
        Checked in: {r.checked_in_count}/{r.adults + r.children} · Meals served:{" "}
        {r.food_served_count}/{r.food_count}
      </p>
      {r.status === "active" && !manager && admitted && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" />
          Ready for entry. Show this booking to the volunteer at the gate.
        </p>
      )}
      {r.status === "active" &&
        ["unpaid", "submitted"].includes(r.payment_status) && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act("submit_payment", reference);
            }}
          >
            <Input
              className="flex-1"
              aria-label="UPI or bank transaction reference"
              required
              minLength={3}
              maxLength={120}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI / bank transaction reference"
            />
            <Button type="submit" disabled={pending}>
              Submit payment reference
            </Button>
          </form>
        )}
      {manager && r.payment_reference && (
        <p className="break-all text-sm">
          Payment reference: {r.payment_reference}
        </p>
      )}
      {editing && (
        <form
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void act(
              "edit",
              JSON.stringify({
                contact_name: form.get("name"),
                flat: form.get("flat"),
                adults: Number(form.get("adults")),
                children: Number(form.get("children")),
                guests: Number(form.get("guests")),
                food_count: Number(form.get("food_count")),
              }),
            ).then(() => setEditing(false));
          }}
        >
          <Field label="Name">
            <Input
              name="name"
              defaultValue={r.contact_name}
              required
              minLength={2}
              maxLength={100}
            />
          </Field>
          <Field label="Flat">
            <Input name="flat" defaultValue={r.flat} required maxLength={40} />
          </Field>
          {(["adults", "children", "guests", "food_count"] as const).map(
            (key) => (
              <Field
                key={key}
                label={
                  {
                    adults: "Adults",
                    children: "Children",
                    guests: "Guests (included above)",
                    food_count: "Food portions",
                  }[key]
                }
              >
                <Input
                  name={key}
                  type="number"
                  min={0}
                  max={key === "adults" || key === "children" ? 20 : 40}
                  defaultValue={r[key]}
                  required
                />
              </Field>
            ),
          )}
          <Button type="submit" disabled={pending}>
            Save details
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {manager &&
          r.status === "active" &&
          r.checked_in_count === 0 &&
          ["unpaid", "free"].includes(r.payment_status) && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Close edit" : "Edit details"}
            </Button>
          )}
        {manager &&
          r.status === "active" &&
          r.payment_status === "submitted" && (
            <>
              <Button
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Confirm receipt of ${formatCurrency(r.amount_due / 100)} in your account?`,
                    )
                  )
                    void act("verify");
                }}
              >
                Verify receipt
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void act("reject")}
              >
                Not received
              </Button>
            </>
          )}
        {manager && r.payment_status === "refund_pending" && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Confirm the refund/reconciliation has been completed outside this app?",
                )
              )
                void act("refund");
            }}
          >
            Record refund completed
          </Button>
        )}
        {manager && r.status === "active" && admitted && (
          <>
            <Input
              className="w-20"
              aria-label="Number arriving or collecting meals"
              type="number"
              min={1}
              max={40}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            <Button
              disabled={
                pending ||
                count < 1 ||
                count + r.checked_in_count > r.adults + r.children
              }
              onClick={() =>
                void act("check_in", String(count + r.checked_in_count))
              }
            >
              <CalendarCheck className="h-4 w-4" />
              Check in {count}
            </Button>
            {r.food_count > 0 && (
              <Button
                variant="outline"
                disabled={
                  pending ||
                  count < 1 ||
                  count + r.food_served_count >
                    Math.min(r.food_count, r.checked_in_count)
                }
                onClick={() =>
                  void act("serve_food", String(count + r.food_served_count))
                }
              >
                Serve {count} meals
              </Button>
            )}
          </>
        )}
        {r.status === "active" && r.checked_in_count === 0 && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Cancel this entire booking? Any submitted or verified payment will need refund review.",
                )
              )
                void act("cancel");
            }}
          >
            Cancel booking
          </Button>
        )}
      </div>
    </article>
  );
}
function Summary({ data }: { data: RegistrationPayload }) {
  const s = data.summary;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Attendees", s.attendees],
        ["Checked in", s.checkedIn],
        ["Meals booked", s.food],
        ["Meals served", s.foodServed],
      ].map(([label, value]) => (
        <div className="rounded-xl border bg-card p-4" key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {value ?? 0}
          </p>
        </div>
      ))}
      <p className="col-span-full text-sm">
        Verified: {formatCurrency((s.verifiedAmount ?? 0) / 100)} · Payment
        pending: {formatCurrency((s.pendingAmount ?? 0) / 100)} · Refund review:{" "}
        {formatCurrency((s.refundAmount ?? 0) / 100)}
      </p>
    </section>
  );
}
function ConfigForm({
  config: c,
  pending,
  onSave,
}: {
  config: RegistrationConfig;
  pending: boolean;
  onSave: (c: RegistrationConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(c);
  const set = <K extends keyof RegistrationConfig>(
    key: K,
    value: RegistrationConfig[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await onSave(draft);
    } catch {
      /* parent displays errors */
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border bg-card p-5"
    >
      <div>
        <h2 className="text-xl font-semibold">Registration setup</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Set actual prices before opening registration. Existing bookings keep
          their original prices. All event times are IST.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["enabled", "Open registration"],
            ["self_service", "Allow residents to register themselves"],
            ["allow_guests", "Allow guests with a household"],
            ["food_enabled", "Offer optional food"],
          ] as const
        ).map(([key, label]) => (
          <label className="flex min-h-10 items-center gap-2 text-sm" key={key}>
            <input
              type="checkbox"
              checked={draft[key]}
              onChange={(e) => set(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
        <Field label="Who can register?">
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={draft.audience}
            onChange={(e) =>
              set("audience", e.target.value as "society" | "public")
            }
          >
            <option value="society">Society / event members</option>
            <option value="public">Anyone signed in</option>
          </select>
        </Field>
        {(
          [
            ["adult_price", "Adult entry (₹)"],
            ["child_price", "Child entry (₹)"],
            ["food_price", "Food per person (₹)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Input
              type="number"
              min={0}
              step="0.01"
              max={100000}
              required
              value={draft[key] / 100}
              onChange={(e) =>
                set(key, Math.round(Number(e.target.value) * 100))
              }
            />
          </Field>
        ))}
        <Field label="Child age: under">
          <Input
            type="number"
            min={1}
            max={21}
            required
            value={draft.child_age_limit}
            onChange={(e) => set("child_age_limit", Number(e.target.value))}
          />
        </Field>
        <Field label="Capacity (blank = unlimited)">
          <Input
            type="number"
            min={1}
            value={draft.capacity ?? ""}
            onChange={(e) =>
              set("capacity", e.target.value ? Number(e.target.value) : null)
            }
          />
        </Field>
        <Field label="Registration deadline (IST)">
          <Input
            type="datetime-local"
            value={
              draft.closes_at
                ? new Date(new Date(draft.closes_at).getTime() + 19800000)
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(e) =>
              set(
                "closes_at",
                e.target.value
                  ? new Date(`${e.target.value}:00+05:30`).toISOString()
                  : null,
              )
            }
          />
        </Field>
      </div>
      <Field label="Payment instructions / UPI ID">
        <textarea
          className="min-h-24 w-full rounded-md border bg-background p-3"
          maxLength={1500}
          value={draft.payment_instructions}
          onChange={(e) => set("payment_instructions", e.target.value)}
          placeholder="Account/UPI details, payee name and instructions for residents"
        />
      </Field>
      <Field label="Cancellation and refund policy">
        <textarea
          className="min-h-24 w-full rounded-md border bg-background p-3"
          maxLength={1500}
          value={draft.cancellation_policy}
          onChange={(e) => set("cancellation_policy", e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save registration setup"}
      </Button>
    </form>
  );
}
