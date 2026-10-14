import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { configurablePageKeys, pageLabels, usePageAccess } from "@/lib/page-access";

/**
 * What the Team section reads: the people, their roles, pending requests and the page grants. Shared by the panel
 * itself and by the Settings index, whose one-line summary reads the same cached queries (no extra requests).
 */

export type AccessLevel = "none" | "view" | "edit";

// Every page is grantable now. Pages used to be dropped from this list when
// they were hardcoded as public; visibility is the admin's call per event, so
// a page they have set back to "restricted" needs a per-member row here.
export const grantablePages = configurablePageKeys.map((key) => [key, pageLabels[key]] as const);

export const initialPageAccess = Object.fromEntries(grantablePages.map(([key]) => [key, "none"])) as Record<string, AccessLevel>;

export type AccessRequest = {
  id: string;
  requested_role: "committee";
  created_at: string;
  app_users: {
    email: string;
    full_name: string | null;
  } | null;
};

export type RoleFilter = "all" | "unassigned" | "read_only" | "committee" | "admin";
export type EventRole = "read_only" | "committee" | "admin";

export const roleLabels: Record<EventRole, string> = {
  admin: "Admin",
  committee: "Committee",
  read_only: "Read-only",
};

export const roleBadgeStyles: Record<EventRole, string> = {
  admin: "bg-primary/10 text-primary",
  committee: "bg-sky-100 text-sky-800",
  read_only: "bg-muted text-muted-foreground",
};

/** Admins first, then committee, then read-only. */
export function roleRank(role: EventRole | null) {
  return role === "admin" ? 0 : role === "committee" ? 1 : 2;
}

export function displayName(user: MemberUser) {
  return user.full_name?.trim() || user.email.split("@")[0];
}

export function displayUser(user: MemberUser) {
  return user.full_name ? `${user.full_name} (${user.email})` : user.email;
}

/** "Priya Rao" -> "PR", so a row without a photo still has an anchor. */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export type MemberUser = {
  id: string;
  email: string;
  full_name: string | null;
  photo_url: string | null;
};

export type MemberOption = {
  role: EventRole | null;
  created_at: string | null;
  app_users: MemberUser;
};

export type MemberDetails = {
  member: {
    role: EventRole | null;
    app_users: MemberUser;
  };
  permissions: Array<{
    page_key: string;
    access_level: AccessLevel;
  }>;
};

/** Pending committee requests for the selected event. Shared with the Settings index so its summary reads the same cache. */
export function useAccessRequests() {
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  return useQuery({
    queryKey: ["access-requests", selectedEventId],
    enabled: Boolean(access.canEdit && selectedEventId),
    queryFn: async () => {
      const data = await apiFetch<{ requests: AccessRequest[] }>(`/api/access-requests?eventId=${selectedEventId}`);
      return data.requests;
    },
  });
}

/** Everybody who holds a role on the selected event, admins first. */
export function useRoster() {
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  return useQuery({
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
}

