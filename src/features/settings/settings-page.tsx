import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import {
  committeeOpenPageKeys,
  configurablePageKeys,
  pageLabels,
  usePageAccess,
  signInOnlyPageKeys,
  usePageVisibility,
  visibilityHints,
  visibilityLabels,
  visibilityOptionsFor,
  type PageVisibility,
} from "@/lib/page-access";

type AccessLevel = "none" | "view" | "edit";

// Every page is grantable now. Pages used to be dropped from this list when
// they were hardcoded as public; visibility is the admin's call per event, so
// a page they have set back to "restricted" needs a per-member row here.
const grantablePages = configurablePageKeys.map((key) => [key, pageLabels[key]] as const);

const initialPageAccess = Object.fromEntries(grantablePages.map(([key]) => [key, "none"])) as Record<string, AccessLevel>;

type AccessRequest = {
  id: string;
  requested_role: "committee";
  created_at: string;
  app_users: {
    email: string;
    full_name: string | null;
  } | null;
};

type RoleFilter = "all" | "unassigned" | "read_only" | "committee" | "admin";
type EventRole = "read_only" | "committee" | "admin";

const roleLabels: Record<EventRole, string> = {
  admin: "Admin",
  committee: "Committee",
  read_only: "Read-only",
};

const roleBadgeStyles: Record<EventRole, string> = {
  admin: "bg-primary/10 text-primary",
  committee: "bg-sky-100 text-sky-800",
  read_only: "bg-muted text-muted-foreground",
};

/** Admins first, then committee, then read-only. */
function roleRank(role: EventRole | null) {
  return role === "admin" ? 0 : role === "committee" ? 1 : 2;
}

function displayName(user: MemberUser) {
  return user.full_name?.trim() || user.email.split("@")[0];
}

function displayUser(user: MemberUser) {
  return user.full_name ? `${user.full_name} (${user.email})` : user.email;
}

/** "Priya Rao" -> "PR", so a row without a photo still has an anchor. */
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

type MemberUser = {
  id: string;
  email: string;
  full_name: string | null;
  photo_url: string | null;
};

type MemberOption = {
  role: EventRole | null;
  created_at: string | null;
  app_users: MemberUser;
};

type MemberDetails = {
  member: {
    role: EventRole | null;
    app_users: MemberUser;
  };
  permissions: Array<{
    page_key: string;
    access_level: AccessLevel;
  }>;
};

export function SettingsPage() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const access = usePageAccess("settings");
  const { selectedEventId, setSelectedEventId } = useEventContext();
  const queryClient = useQueryClient();
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<Record<string, AccessLevel>>(initialPageAccess);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<EventRole>("read_only");

  const { data: accessRequests = [] } = useQuery({
    queryKey: ["access-requests", selectedEventId],
    enabled: Boolean(access.canEdit && selectedEventId),
    queryFn: async () => {
      const data = await apiFetch<{ requests: AccessRequest[] }>(`/api/access-requests?eventId=${selectedEventId}`);
      return data.requests;
    },
  });

  const { data: memberOptions = [] } = useQuery({
    queryKey: ["event-members", selectedEventId, roleFilter],
    enabled: Boolean(access.canEdit && selectedEventId),
    queryFn: async () => {
      const data = await apiFetch<{ members: MemberOption[] }>(
        `/api/event-members?eventId=${selectedEventId}&role=${roleFilter}`,
      );
      return data.members;
    },
  });

  // Everybody who actually holds a role on this event, as opposed to the
  // dropdown below, which lists every person who has ever signed in.
  const { data: roster = [], isLoading: isRosterLoading } = useQuery({
    queryKey: ["event-members", selectedEventId, "assigned"],
    enabled: Boolean(access.canEdit && selectedEventId),
    queryFn: async () => {
      const data = await apiFetch<{ members: MemberOption[] }>(
        `/api/event-members?eventId=${selectedEventId}&role=assigned`,
      );
      return [...data.members].sort(
        (left, right) =>
          roleRank(left.role) - roleRank(right.role) ||
          displayName(left.app_users).localeCompare(displayName(right.app_users)),
      );
    },
  });

  const { data: selectedMember } = useQuery({
    queryKey: ["event-member", selectedEventId, selectedUserId],
    enabled: Boolean(access.canEdit && selectedEventId && selectedUserId),
    queryFn: () => apiFetch<MemberDetails>(`/api/event-members?eventId=${selectedEventId}&userId=${selectedUserId}`),
  });

  useEffect(() => {
    if (!selectedMember) return;

    setSelectedRole(selectedMember.member.role ?? "read_only");
    setPageAccess({
      ...initialPageAccess,
      ...Object.fromEntries(
        selectedMember.permissions.map((permission) => [permission.page_key, permission.access_level]),
      ),
    });
  }, [selectedMember]);

  useEffect(() => {
    if (!selectedUserId && memberOptions.length) {
      setSelectedUserId(memberOptions[0].app_users.id);
    }
  }, [memberOptions, selectedUserId]);

  function setPageAccessLevel(pageKey: string, accessLevel: AccessLevel) {
    setPageAccess((current) => ({
      ...current,
      [pageKey]: accessLevel,
    }));
  }


  /**
   * Take somebody off this event.
   *
   * Deletes their `event_members` row and every per-page grant with it, which
   * is what "no longer on the committee" has to mean - leaving the grants
   * behind would hand a removed member view access to pages an admin had
   * opened up for them. Nothing they recorded is touched: their
   * contributions, expenses, tasks and comments are the event's history, not
   * their membership.
   *
   * The server refuses to remove the last remaining admin, whatever this
   * button does.
   */
  async function removeMember(member: MemberOption) {
    const name = displayName(member.app_users);
    const role = member.role ? roleLabels[member.role].toLowerCase() : "member";
    if (
      !window.confirm(
        `Remove ${name} from this event? They lose their ${role} role and every page grant with it, and go back to being an ordinary signed-in visitor. Anything they recorded stays.`,
      )
    ) {
      return;
    }

    setRosterMessage(`Removing ${name}...`);
    try {
      await apiFetch("/api/event-members", {
        method: "DELETE",
        body: { eventId: selectedEventId, userId: member.app_users.id },
      });

      await queryClient.invalidateQueries({ queryKey: ["event-members"] });
      await queryClient.invalidateQueries({ queryKey: ["event-member"] });
      await queryClient.invalidateQueries({ queryKey: ["event-access"] });
      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      setRosterMessage(`${name} removed.`);
    } catch (error) {
      setRosterMessage(error instanceof Error ? error.message : "Unable to remove this member");
    }
  }

  /** Load somebody into the Member Access form below, role and grants and all. */
  function manageMember(member: MemberOption) {
    setRoleFilter("all");
    setSelectedUserId(member.app_users.id);
    setRosterMessage(null);
    document.getElementById("member-access")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function reviewAccessRequest(requestId: string, action: "approve" | "reject") {
    setRequestMessage(action === "approve" ? "Approving request..." : "Rejecting request...");

    try {
      await apiFetch("/api/access-requests", {
        method: "PATCH",
        body: { requestId, action },
      });

      await queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["event-access"] });
      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      setRequestMessage(action === "approve" ? "Request approved." : "Request rejected.");
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : "Unable to update request");
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const formData = new FormData(event.currentTarget);
    setEventMessage("Creating event...");

    try {
      const { eventId } = await apiFetch<{ eventId: string }>("/api/events", {
        method: "POST",
        body: {
          eventName: String(formData.get("eventName")),
          startDate: String(formData.get("startDate")),
          endDate: String(formData.get("endDate")),
          location: String(formData.get("location") ?? ""),
          description: String(formData.get("description") ?? ""),
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: ["event-data"] });
      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      setSelectedEventId(eventId);
      setEventMessage("Event created. You are the event admin.");
      event.currentTarget.reset();
    } catch (error) {
      setEventMessage(error instanceof Error ? error.message : "Unable to create event");
      return;
    }
  }

  async function grantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId || !selectedUserId) return;
    setAccessMessage("Saving access...");

    try {
      await apiFetch("/api/event-members", {
        method: "POST",
        body: {
          eventId: selectedEventId,
          userId: selectedUserId,
          role: selectedRole,
          permissions: Object.entries(pageAccess).map(([pageKey, accessLevel]) => ({
            pageKey,
            accessLevel,
          })),
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      await queryClient.invalidateQueries({ queryKey: ["event-access"] });
      await queryClient.invalidateQueries({ queryKey: ["event-members"] });
      await queryClient.invalidateQueries({ queryKey: ["event-member"] });
      setAccessMessage("Access saved.");
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Unable to save access");
      return;
    }
  }

  async function revokeAccess() {
    if (!selectedEventId || !selectedUserId) return;
    const name = selectedMember ? displayName(selectedMember.member.app_users) : "this member";
    if (!window.confirm(`Remove ${name} from this event? Their role and every page grant go with it.`)) return;
    setAccessMessage("Removing...");

    try {
      await apiFetch("/api/event-members", {
        method: "DELETE",
        body: {
          eventId: selectedEventId,
          userId: selectedUserId,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["page-access"] });
      await queryClient.invalidateQueries({ queryKey: ["event-access"] });
      await queryClient.invalidateQueries({ queryKey: ["event-members"] });
      await queryClient.invalidateQueries({ queryKey: ["event-member"] });
      setSelectedRole("read_only");
      setPageAccess(initialPageAccess);
      setAccessMessage(`${name} removed from this event.`);
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Unable to remove this member");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">Create events and manage member access for the active event.</p>
        </div>
        <DataSourceBadge source={data.source} reason={data.fallbackReason} />
      </div>

      {!session ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">Sign in with Google to create events and manage access.</CardContent>
        </Card>
      ) : null}

      {session && !access.canEdit ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            You are signed in, but only an event admin can create events or manage member access.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Event</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createEvent}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Event Name" name="eventName" required />
                <FormField label="Location" name="location" />
                <FormField label="Start Date" name="startDate" type="date" required />
                <FormField label="End Date" name="endDate" type="date" required />
                <FormField label="Description" name="description" />
              </div>
              {eventMessage ? <p className="text-sm text-muted-foreground">{eventMessage}</p> : null}
              <Button type="submit" disabled={!session}>Create Event</Button>
            </form>
          </CardContent>
        </Card>

        {access.canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Committee Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accessRequests.length ? (
                accessRequests.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.app_users?.full_name ?? item.app_users?.email ?? "Member"}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.app_users?.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void reviewAccessRequest(item.id, "approve")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void reviewAccessRequest(item.id, "reject")}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No pending committee requests.</p>
              )}
              {requestMessage ? <p className="text-sm text-muted-foreground">{requestMessage}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Committee &amp; members</CardTitle>
            <p className="text-sm text-muted-foreground">
              Everyone with a role on this event. Approving a request adds somebody here; removing them here is how
              they come off it.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {roster.length ? (
              <ul className="overflow-hidden rounded-md border">
                {roster.map((member) => {
                  const name = displayName(member.app_users);
                  const isYou = member.app_users.id === session?.user.appUserId;
                  return (
                    <li
                      key={member.app_users.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0"
                    >
                      {member.app_users.photo_url ? (
                        <img
                          src={member.app_users.photo_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initials(name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {name}
                          {isYou ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.app_users.email}</p>
                      </div>
                      {member.role ? (
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                            roleBadgeStyles[member.role]
                          }`}
                        >
                          {roleLabels[member.role]}
                        </span>
                      ) : null}
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => manageMember(member)}>
                          Manage
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!access.canEdit}
                          onClick={() => void removeMember(member)}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isRosterLoading ? "Loading members..." : "Nobody has a role on this event yet."}
              </p>
            )}
            {rosterMessage ? <p className="text-sm text-muted-foreground">{rosterMessage}</p> : null}
            <p className="text-xs text-muted-foreground">
              Removing somebody takes their role and every page grant with it. Anything they recorded stays. The
              event's last admin cannot be removed - make somebody else an admin first.
            </p>
          </CardContent>
        </Card>

        <Card id="member-access">
          <CardHeader>
            <CardTitle>Member Access</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add somebody to the event, change their role, and grant them individual pages.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={grantAccess}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="roleFilter">Filter</label>
                  <select
                    id="roleFilter"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={roleFilter}
                    onChange={(item) => {
                      setRoleFilter(item.target.value as RoleFilter);
                      setSelectedUserId("");
                    }}
                  >
                    <option value="all">All users</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="read_only">Read-only</option>
                    <option value="committee">Committee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="memberUser">User</label>
                  <select
                    id="memberUser"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedUserId}
                    onChange={(item) => setSelectedUserId(item.target.value)}
                    required
                  >
                    {memberOptions.length ? (
                      memberOptions.map((member) => (
                        <option key={member.app_users.id} value={member.app_users.id}>
                          {displayUser(member.app_users)}
                        </option>
                      ))
                    ) : (
                      <option value="">No users found</option>
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="role">Role</label>
                  <select
                    id="role"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedRole}
                    onChange={(item) => setSelectedRole(item.target.value as EventRole)}
                  >
                    <option value="read_only">Read-only</option>
                    <option value="committee">Committee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[1fr_6rem_7rem] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Page</span>
                  <span>Read</span>
                  <span>Read/write</span>
                </div>
                <div className="divide-y">
                  {grantablePages.map(([key, label]) => (
                    <div key={key} className="grid grid-cols-[1fr_6rem_7rem] items-center gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-sm">{label}</span>
                      <div className="flex items-center">
                        <input
                          aria-label={`${label} read access`}
                          className="h-4 w-4"
                          type="checkbox"
                          checked={pageAccess[key] === "view" || pageAccess[key] === "edit"}
                          onChange={(item) => setPageAccessLevel(key, item.target.checked ? "view" : "none")}
                        />
                      </div>
                      <div className="flex items-center">
                        <input
                          aria-label={`${label} read/write access`}
                          className="h-4 w-4"
                          type="checkbox"
                          checked={pageAccess[key] === "edit"}
                          onChange={(item) => setPageAccessLevel(key, item.target.checked ? "edit" : "view")}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {accessMessage ? <p className="text-sm text-muted-foreground">{accessMessage}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!access.canEdit || !selectedEventId || !selectedUserId}>
                  Save Access
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!access.canEdit || !selectedEventId || !selectedUserId || !selectedMember?.member.role}
                  onClick={() => void revokeAccess()}
                >
                  Remove from event
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {access.canEdit ? <PageVisibilityCard /> : null}
      </div>
    </div>
  );
}

/**
 * Who can see each page of this event, set by the admin. Separate from Member
 * Access below it on purpose: this is the blanket rule for everyone, that one
 * is the exception list for a named person.
 */
function PageVisibilityCard() {
  const { selectedEventId } = useEventContext();
  const { query, save } = usePageVisibility();
  const [draft, setDraft] = useState<Record<string, PageVisibility> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stored = query.data?.visibility;
  // The server's map is the baseline; the draft only exists once the admin
  // has actually changed something, so a refetch never stomps on typing.
  const current = draft ?? stored ?? null;

  function setVisibility(pageKey: string, visibility: PageVisibility) {
    setDraft({ ...(current ?? {}), [pageKey]: visibility });
    setMessage(null);
  }

  async function handleSave() {
    if (!current || !selectedEventId) return;
    setMessage("Saving page visibility...");
    try {
      await save.mutateAsync(current);
      setDraft(null);
      setMessage("Page visibility saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save page visibility");
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Page Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Decide who can open each page of this event. Editing is never widened by this - it still comes from the role
          and the per-member grants in Member Access.
        </p>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading page visibility...</p>
        ) : !current ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Page visibility could not be loaded. Check that migration 015_event_page_visibility.sql has been run.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <div className="divide-y">
                {configurablePageKeys.map((pageKey) => {
                  const value = current[pageKey] ?? "restricted";
                  return (
                    <div
                      key={pageKey}
                      className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{pageLabels[pageKey]}</p>
                        <p className="text-xs text-muted-foreground">
                          {signInOnlyPageKeys.has(pageKey)
                            ? `Always needs a sign-in. ${visibilityHints[value]}`
                            : visibilityHints[value]}
                          {committeeOpenPageKeys.has(pageKey) && value === "restricted"
                            ? " Committee members can still open it to add their own expenses and see only those."
                            : null}
                        </p>
                      </div>
                      <select
                        aria-label={`${pageLabels[pageKey]} visibility`}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:w-64 sm:shrink-0"
                        value={value}
                        onChange={(item) => setVisibility(pageKey, item.target.value as PageVisibility)}
                      >
                        {visibilityOptionsFor(pageKey).map((level) => (
                          <option key={level} value={level}>
                            {visibilityLabels[level]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Settings</span> is always admin-only and cannot be opened
                up - it is the screen that controls all the others.
              </p>
              <p>
                A page set to <span className="font-medium text-foreground">Anyone with the link</span> is genuinely
                public. Keep contact details and payment references off those pages.
              </p>
            </div>

            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={!draft || save.isPending}>
                {save.isPending ? "Saving..." : "Save Visibility"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={!draft}>
                Reset
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
