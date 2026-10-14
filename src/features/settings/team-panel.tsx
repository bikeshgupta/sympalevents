import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { usePageAccess } from "@/lib/page-access";
import {
  grantablePages,
  initialPageAccess,
  displayName,
  displayUser,
  initials,
  roleBadgeStyles,
  roleLabels,
  useAccessRequests,
  useRoster,
  type AccessLevel,
  type EventRole,
  type MemberDetails,
  type MemberOption,
  type RoleFilter,
} from "@/features/settings/team-data";

/**
 * Who is on this event and what they may do: pending committee requests, the roster, and the Member Access form.
 * Moved out of the Settings page unchanged - the same queries, the same calls, the same confirmations - so the
 * shell can place it in the "Team & permissions" section.
 */
export function TeamPanel() {
  const { data: session } = useSession();
  const access = usePageAccess("settings");
  const { selectedEventId, selectedEvent, societies } = useEventContext();
  const queryClient = useQueryClient();
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<Record<string, AccessLevel>>(initialPageAccess);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  // A society admin outranks an event admin and is the only one who may grant
  // or revoke event admin. The server is the authority; this is read only so
  // the form does not offer what would be refused.
  const isSocietyAdmin = societies.some(
    (society) => society.id === selectedEvent?.societyId && society.role === "admin",
  );
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<EventRole>("read_only");

  const { data: accessRequests = [] } = useAccessRequests();

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
  const { data: roster = [], isLoading: isRosterLoading } = useRoster();

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

  /**
   * Correct somebody's name.
   *
   * Names on this event go out over the committee's name - the credits on the
   * closing page, the duty roster, the prasad list - and Google's idea of
   * somebody's name is often an initial or the wrong order. The person can
   * always set it back themselves from the header menu.
   */
  async function renameMember(member: MemberOption) {
    const current = displayName(member.app_users);
    const next = window.prompt(`Name for ${member.app_users.email}`, current);
    if (next === null) return;
    const trimmed = next.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed === current) return;

    setRosterMessage(`Renaming ${current}...`);
    try {
      await apiFetch("/api/event-members", {
        method: "PATCH",
        body: { eventId: selectedEventId, userId: member.app_users.id, fullName: trimmed },
      });
      await queryClient.invalidateQueries({ queryKey: ["event-members"] });
      await queryClient.invalidateQueries({ queryKey: ["event-member"] });
      await queryClient.invalidateQueries({ queryKey: ["event-closing"] });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setRosterMessage(`Now shown as ${trimmed}.`);
    } catch (error) {
      setRosterMessage(error instanceof Error ? error.message : "Unable to rename this member");
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

  // The Member Access form holds unsaved changes when what is selected no longer matches what is stored for them.
  const storedRole = selectedMember?.member.role ?? "read_only";
  const storedAccess: Record<string, AccessLevel> = {
    ...initialPageAccess,
    ...Object.fromEntries((selectedMember?.permissions ?? []).map((permission) => [permission.page_key, permission.access_level])),
  };
  const accessDirty =
    Boolean(selectedMember) &&
    (selectedRole !== storedRole || Object.keys(storedAccess).some((key) => (pageAccess[key] ?? "none") !== storedAccess[key]));
  useSettingsDirty("member-access", accessDirty);

  return (
    <>
        {access.canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Committee Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accessRequests.length ? (
                accessRequests.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
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
              <ul className="border-y">
                {roster.map((member) => {
                  const name = displayName(member.app_users);
                  const isYou = member.app_users.id === session?.user.appUserId;
                  return (
                    <li
                      key={member.app_users.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0"
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!access.canEdit}
                          onClick={() => void renameMember(member)}
                        >
                          Rename
                        </Button>
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
              Names start from the person's Google account and can be corrected here - they can also change their own
              from the account menu in the header. Removing somebody takes their role and every page grant with it.
              Anything they recorded stays. The event's last admin cannot be removed - make somebody else an admin
              first.
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
                    {/* Granting event admin is the society's call - see
                        api/_lib/authority.ts. The server refuses it either
                        way; this only avoids offering a control that would
                        just 403. */}
                    {isSocietyAdmin ? <option value="admin">Admin</option> : null}
                  </select>
                  {isSocietyAdmin ? null : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only a society admin can make somebody an event admin.
                    </p>
                  )}
                </div>
              </div>
              <div className="border-y">
                <div className="grid grid-cols-[1fr_6rem_7rem] border-b py-2 text-xs font-medium text-muted-foreground">
                  <span>Page</span>
                  <span>Read</span>
                  <span>Read/write</span>
                </div>
                <div className="divide-y">
                  {grantablePages.map(([key, label]) => (
                    <div key={key} className="grid grid-cols-[1fr_6rem_7rem] items-center gap-3 py-2.5">
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
    </>
  );
}
