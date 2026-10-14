import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { BlockRow, ListGroup, ListRow, Segmented } from "@/features/settings/ios-list";
import { fieldInput } from "@/features/settings/ios-styles";
import { useSettingsDirty } from "@/features/settings/settings-dirty-state";
import { usePageAccess } from "@/lib/page-access";
import {
  grantablePages,
  initialPageAccess,
  displayName,
  initials,
  roleLabels,
  useAccessRequests,
  useRoster,
  type AccessLevel,
  type EventRole,
  type MemberDetails,
  type MemberOption,
  type MemberUser,
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
  // A society admin outranks an event admin and is the only one who may grant
  // or revoke event admin. The server is the authority; this is read only so
  // the form does not offer what would be refused.
  const isSocietyAdmin = societies.some(
    (society) => society.id === selectedEvent?.societyId && society.role === "admin",
  );
  const [params, setParams] = useSearchParams();
  const personParam = params.get("person");
  const viewingNew = personParam === "new";
  const viewingId = personParam && !viewingNew ? personParam : null;
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<EventRole>("read_only");

  const { data: accessRequests = [] } = useAccessRequests();

  const { data: memberOptions = [] } = useQuery({
    queryKey: ["event-members", selectedEventId, "unassigned"],
    enabled: Boolean(access.canEdit && selectedEventId),
    queryFn: async () => {
      const data = await apiFetch<{ members: MemberOption[] }>(
        `/api/event-members?eventId=${selectedEventId}&role=unassigned`,
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

  // The person page is addressed (`?section=team&person=<id>`), so the browser's Back button and a shared link work.
  // Opening somebody else starts from their stored role and grants; going back to the list and returning to the
  // same person keeps what was typed, exactly as switching sections does.
  useEffect(() => {
    if (!viewingId || viewingId === selectedUserId) return;
    setSelectedUserId(viewingId);
    setSelectedRole("read_only");
    setPageAccess(initialPageAccess);
    setAccessMessage(null);
  }, [viewingId, selectedUserId]);

  function setPageAccessLevel(pageKey: string, accessLevel: AccessLevel) {
    setPageAccess((current) => ({
      ...current,
      [pageKey]: accessLevel,
    }));
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
      setParams({ section: "team" });
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

  const teamHref = "?section=team";
  const backToTeam = (
    <Link
      to={teamHref}
      className="-ml-1 mb-3 hidden min-h-10 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Team
    </Link>
  );

  // ---- Add a person: people who have signed in but hold no role yet --------------------------------------------
  if (viewingNew) {
    const needle = search.trim().toLowerCase();
    const matches = memberOptions.filter(
      (member) =>
        !needle || displayName(member.app_users).toLowerCase().includes(needle) || member.app_users.email.toLowerCase().includes(needle),
    );
    return (
      <div className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
        {backToTeam}
        <ListGroup>
          <BlockRow>
            <input
              className={`${fieldInput} w-full text-left`}
              value={search}
              onChange={(item) => setSearch(item.target.value)}
              placeholder="Search by name or email"
              aria-label="Search people"
              autoComplete="off"
            />
          </BlockRow>
        </ListGroup>
        <ListGroup
          header="People without a role"
          footer="Everybody here has signed in to this app but has no role on this event yet. Pick one to give them a role and the pages they may open."
        >
          {matches.length ? (
            matches.map((member) => (
              <ListRow
                key={member.app_users.id}
                lead={<Avatar user={member.app_users} />}
                title={displayName(member.app_users)}
                sub={member.app_users.email}
                onClick={() => setParams({ section: "team", person: member.app_users.id })}
              />
            ))
          ) : (
            <ListRow title={<span className="text-muted-foreground">{memberOptions.length ? "Nobody matches" : "No users found"}</span>} />
          )}
        </ListGroup>
      </div>
    );
  }

  // ---- One person: name, role, the pages they may open ---------------------------------------------------------
  if (viewingId) {
    const detail = selectedMember?.member.app_users.id === viewingId ? selectedMember : null;
    const user = detail?.member.app_users ?? roster.find((member) => member.app_users.id === viewingId)?.app_users ?? null;
    const name = user ? displayName(user) : "";
    const hasRole = Boolean(detail?.member.role);
    const roles: { value: EventRole; label: string; note: string }[] = [
      { value: "read_only", label: roleLabels.read_only, note: "Can open the pages they are given, and edit none unless granted." },
      { value: "committee", label: roleLabels.committee, note: "Part of the committee; edits the pages they are granted." },
      // Granting event admin is the society's call - see api/_lib/authority.ts. The server refuses it either way;
      // this only avoids offering a control that would just 403.
      ...(isSocietyAdmin || selectedRole === "admin" ? [{ value: "admin" as EventRole, label: roleLabels.admin, note: "Runs the event, including who has access." }] : []),
    ];
    return (
      <form onSubmit={grantAccess} className="animate-in fade-in-0 slide-in-from-left-4 duration-300">
        {backToTeam}
        {user ? (
          <div className="mb-2 mt-1 flex items-center gap-4 px-1">
            <Avatar user={user} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold leading-tight">{name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">Loading...</p>
        )}

        {detail && user ? (
          <>
            {hasRole ? (
              <ListGroup
                header="Name"
                footer="Names start from the person's Google account and can be corrected here. They can also change their own from the account menu."
              >
                <ListRow
                  title="Name"
                  value={name}
                  disabled={!access.canEdit}
                  onClick={() => void renameMember({ role: detail.member.role, created_at: null, app_users: user })}
                />
              </ListGroup>
            ) : null}

            <ListGroup
              header="Role"
              footer={isSocietyAdmin ? undefined : "Only a society admin can make somebody an event admin."}
            >
              {roles.map((role) => (
                <ListRow
                  key={role.value}
                  title={role.label}
                  sub={role.note}
                  subWrap
                  chevron={false}
                  checked={selectedRole === role.value}
                  disabled={role.value === "admin" && !isSocietyAdmin}
                  onClick={() => setSelectedRole(role.value)}
                />
              ))}
            </ListGroup>

            <ListGroup
              header="Pages they can open"
              footer="None: the page stays closed to them unless the committee has opened it to everybody. Read: they can open it. Edit: they can also change what is on it."
            >
              {grantablePages.map(([key, label]) => (
                <ListRow
                  key={key}
                  title={label}
                  trailing={
                    <Segmented<AccessLevel>
                      label={`${label} access`}
                      value={pageAccess[key] ?? "none"}
                      onChange={(level) => setPageAccessLevel(key, level)}
                      options={[
                        { value: "none", label: "None" },
                        { value: "view", label: "Read" },
                        { value: "edit", label: "Edit" },
                      ]}
                    />
                  }
                />
              ))}
            </ListGroup>

            <div className="mt-6 px-1">
              <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={!access.canEdit || !selectedEventId || !selectedUserId}>
                Save access
              </Button>
              {accessMessage ? <p className="mt-2 text-center text-sm text-muted-foreground">{accessMessage}</p> : null}
            </div>

            {hasRole ? (
              <ListGroup
                footer="Removing somebody takes their role and every page grant with it. Anything they recorded stays. The event's last admin cannot be removed."
              >
                <ListRow title="Remove from event" destructive chevron={false} disabled={!access.canEdit} onClick={() => void revokeAccess()} />
              </ListGroup>
            ) : null}
          </>
        ) : null}
      </form>
    );
  }

  // ---- The list ----------------------------------------------------------------------------------------------
  return (
    <div>
      <ListGroup header="Committee requests" footer={requestMessage ?? undefined}>
        {accessRequests.length ? (
          accessRequests.map((item) => (
            <ListRow
              key={item.id}
              title={item.app_users?.full_name ?? item.app_users?.email ?? "Member"}
              sub={item.app_users?.email}
              trailing={
                <span className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" className="h-8 rounded-full px-3.5" onClick={() => void reviewAccessRequest(item.id, "approve")}>
                    Approve
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-full px-3.5" onClick={() => void reviewAccessRequest(item.id, "reject")}>
                    Reject
                  </Button>
                </span>
              }
            />
          ))
        ) : (
          <ListRow title={<span className="text-muted-foreground">No pending committee requests</span>} />
        )}
      </ListGroup>

      <ListGroup
        header="Members"
        footer={
          <>
            {rosterMessage ? <span className="mb-1 block">{rosterMessage}</span> : null}
            Everyone with a role on this event. Tap a person to rename them, change their role or choose the pages they
            can open. Approving a request adds somebody here.
          </>
        }
      >
        {roster.length ? (
          roster.map((member) => {
            const memberName = displayName(member.app_users);
            const isYou = member.app_users.id === session?.user.appUserId;
            return (
              <ListRow
                key={member.app_users.id}
                lead={<Avatar user={member.app_users} />}
                title={memberName}
                sub={isYou ? `You · ${member.app_users.email}` : member.app_users.email}
                value={member.role ? roleLabels[member.role] : undefined}
                onClick={() => setParams({ section: "team", person: member.app_users.id })}
              />
            );
          })
        ) : (
          <ListRow title={<span className="text-muted-foreground">{isRosterLoading ? "Loading members..." : "Nobody has a role on this event yet"}</span>} />
        )}
      </ListGroup>

      <ListGroup>
        <ListRow icon={UserPlus} tone="green" title="Add a person" onClick={() => setParams({ section: "team", person: "new" })} />
      </ListGroup>
    </div>
  );
}

function Avatar({ user, size = "md" }: { user: MemberUser; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 text-lg" : "h-9 w-9 text-xs";
  return user.photo_url ? (
    <img src={user.photo_url} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${box} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`} aria-hidden="true">
      {initials(displayName(user))}
    </span>
  );
}
