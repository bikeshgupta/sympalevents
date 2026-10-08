import { FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookingCard, BookingForm, Field } from "@/features/registration/registration-parts";
import { RegistrationsManager } from "@/features/registration/registrations-manager";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEventContext } from "@/lib/event-context";
import { useRegistration, type RegistrationFilter } from "@/lib/registration";
import { formatCurrency } from "@/lib/utils";
import { type RegistrationConfig } from "../../../shared/registration";

export function RegistrationPage() {
  const { selectedEventId } = useEventContext();
  const [page, setPage] = useState(0);
  const [, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<RegistrationFilter>("all");
  const { query, mutation } = useRegistration(selectedEventId, page, term, filter);
  const location = useLocation();
  const [chosenTab, setTab] = useState<"mine" | "manage" | "setup" | null>(
    null,
  );
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
        <RegistrationsManager
          eventId={selectedEventId}
          data={data}
          config={data.config}
          filter={filter}
          onFilter={(next) => {
            setPage(0);
            setFilter(next);
          }}
          search={term}
          onSearch={(text) => {
            setPage(0);
            setSearch(text);
            setTerm(text);
          }}
          page={page}
          onPage={setPage}
          isFetching={query.isFetching}
          pending={mutation.isPending}
          onAction={(row, action, value) =>
            save("PATCH", { id: row.id, version: row.version, action, value })
          }
          onSave={(body) => save("POST", body)}
        />
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
