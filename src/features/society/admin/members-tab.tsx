import { Search, UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSocietyMemberActions, useSocietyMembers, type SocietyMemberRow } from "@/lib/society-admin";
import { cn } from "@/lib/utils";
import {
  matchesFilter,
  matchesSearch,
  societyRoleLabels,
  societyRoles,
  type MemberFilter,
  type SocietyRole,
} from "../../../../shared/society-members";

/**
 * The society's members, for its admins only.
 *
 * Roles are changed from the roster itself - there is no need to type anybody's
 * email to promote a resident who is already here. "Add by email" is separate,
 * for somebody who has signed in once but has not joined with the code.
 *
 * What is shown: name, flat/unit, role, since when. Never an email address or a
 * phone number - this is a roster of roles, not a contact directory.
 *
 * There is no Remove here yet. Removing a member has to revoke their access
 * without erasing the credit they have already earned, and that needs a decision
 * of its own (docs/society-platform-plan-v2.1.txt).
 */

const filters: { key: MemberFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admins" },
  { key: "committee", label: "Committee" },
  { key: "resident", label: "Residents" },
];

const PAGE = 50;

const since = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso))
    : "—";

export function MembersTab({ societyId }: { societyId: string }) {
  const { data, isLoading, error } = useSocietyMembers(societyId);
  const { changeRole, addByEmail } = useSocietyMemberActions(societyId);

  const [filter, setFilter] = useState<MemberFilter>("all");
  const [term, setTerm] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<SocietyRole>("read_only");

  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const counts = useMemo(
    () => ({
      all: members.length,
      admin: members.filter((member) => member.role === "admin").length,
      committee: members.filter((member) => member.role === "committee").length,
      resident: members.filter((member) => member.role === "read_only").length,
    }),
    [members],
  );
  const visible = useMemo(
    () => members.filter((member) => matchesFilter(member.role, filter) && matchesSearch(member, term)),
    [members, filter, term],
  );

  async function setRole(member: SocietyMemberRow, role: SocietyRole) {
    if (role === member.role) return;
    // Admin is the one role worth a second thought in either direction.
    const sentence =
      role === "admin"
        ? `Make ${member.name} a society admin? They will have full access to the society and every event in it.`
        : member.role === "admin"
          ? `Change ${member.name} from Admin to ${societyRoleLabels[role]}? ${member.isYou ? "You will lose society admin access." : "They will lose society admin access."}`
          : null;
    if (sentence && !window.confirm(sentence)) return;

    setBusyId(member.userId);
    setMessage(null);
    try {
      await changeRole.mutateAsync({ userId: member.userId, role });
      setMessage({ tone: "ok", text: `${member.name} is now ${societyRoleLabels[role]}.` });
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Could not change the role" });
    } finally {
      setBusyId(null);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await addByEmail.mutateAsync({ email: email.trim(), role: newRole });
      setMessage({ tone: "ok", text: "Added to the society." });
      setEmail("");
      setAdding(false);
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Could not add that person" });
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the members."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">
          Members <span className="font-normal text-muted-foreground tabular-nums">{isLoading ? "" : counts.all}</span>
        </h2>
        <Button type="button" variant="outline" size="sm" className="ml-auto min-h-10" onClick={() => setAdding((open) => !open)} aria-expanded={adding}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add by email
        </Button>
      </div>

      {adding ? (
        <form onSubmit={add} className="space-y-2 rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">
            For somebody who has signed in to Sympal once but has not joined with the invite code. Everyone else can be
            promoted from the list below.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              inputMode="email"
              aria-label="Email address"
              placeholder="name@example.com"
              value={email}
              onChange={(field) => setEmail(field.target.value)}
              className="min-w-0 flex-1"
              required
            />
            <select
              aria-label="Role"
              className="h-10 rounded-md border bg-background px-2 text-sm"
              value={newRole}
              onChange={(field) => setNewRole(field.target.value as SocietyRole)}
            >
              {societyRoles.map((role) => (
                <option key={role} value={role}>
                  {societyRoleLabels[role]}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={addByEmail.isPending || !email.trim()}>
              {addByEmail.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          aria-label="Search members by name or flat"
          placeholder="Search residents..."
          value={term}
          onChange={(field) => {
            setTerm(field.target.value);
            setShown(PAGE);
          }}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter members">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => {
              setFilter(item.key);
              setShown(PAGE);
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {item.label}
            <span className="tabular-nums opacity-80">{counts[item.key]}</span>
          </button>
        ))}
      </div>

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md p-3 text-sm",
            message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-900",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading members...</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
          {members.length === 0 ? "Nobody has joined this society yet. Share its invite code." : "Nobody matches that search."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {visible.slice(0, shown).map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-snug">
                  {member.name}
                  {member.isYou ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="sr-only">Flat / Unit: </span>
                  {member.flat ?? "Flat / Unit not shared"} · Member since {since(member.joinedAt)}
                </p>
              </div>
              <select
                aria-label={`Role for ${member.name}`}
                className={cn(
                  "h-10 rounded-md border bg-background px-2 text-sm",
                  member.role === "admin" && "border-primary/50 font-medium",
                )}
                value={member.role}
                disabled={busyId === member.userId}
                onChange={(field) => void setRole(member, field.target.value as SocietyRole)}
              >
                {societyRoles.map((role) => (
                  <option key={role} value={role}>
                    {societyRoleLabels[role]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      {visible.length > shown ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => setShown((count) => count + PAGE)}>
          Show more ({visible.length - shown})
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Visible to society admins only. Flats come from each member&rsquo;s own profile; phone numbers and email addresses are
        never shown here.
      </p>
    </div>
  );
}
