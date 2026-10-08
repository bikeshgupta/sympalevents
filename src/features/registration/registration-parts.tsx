import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useEventPath } from "@/lib/event-path";
import { CalendarCheck, Check, Users, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  paymentLabels,
  quoteBooking,
  type Registration,
  type RegistrationConfig,
} from "../../../shared/registration";

/**
 * The booking form and the booking card, shared by the resident's page and the
 * organiser's registrations screen. They were private to registration-page.tsx
 * until the organiser's screen needed them too; moving them here avoids that
 * page and the new one importing each other.
 */

export function BookingForm({
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
export function Counter({
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
export function Field({
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
export function BookingCard({
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
  const path = useEventPath();
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
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-primary">
            <Check className="h-4 w-4" />
            Ready for entry. Show your pass to the volunteer at the gate.
          </p>
          <Button asChild>
            <Link to={path("/pass")}>Show my pass</Link>
          </Button>
        </div>
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
