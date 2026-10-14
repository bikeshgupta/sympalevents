/**
 * The rules for who may be what in a society - pure, so the client, the API and
 * the tests all read the same ones.
 *
 * A society role is stored as `organization_members.role`, which reuses the
 * event_role enum, so the stored value for a plain resident is `read_only`. The
 * product word for it is "Resident"; do not show the stored value to anybody.
 *
 *   admin      Society Admin - full authority over the society and every event in it
 *   committee  Society Committee - may create events directly and see drafts
 *   read_only  Resident - a member; may propose an event (Phase D)
 */

export type SocietyRole = "admin" | "committee" | "read_only";

export const societyRoles: SocietyRole[] = ["admin", "committee", "read_only"];

export const societyRoleLabels: Record<SocietyRole, string> = {
  admin: "Admin",
  committee: "Committee",
  read_only: "Resident",
};

export const isSocietyRole = (value: unknown): value is SocietyRole =>
  typeof value === "string" && (societyRoles as string[]).includes(value);

export type MemberLike = { userId: string; role: SocietyRole };

/** The sentence shown when a change would leave a society with nobody in charge. */
export const lastAdminMessage =
  "A society must keep at least one admin. Make somebody else an admin first.";

/**
 * Would this change leave the society with no admin?
 *
 * `nextRole` of null means the member is being removed. Changing somebody who is
 * not an admin can never do it. This is the API's check; migration 042's trigger
 * is the database's, and exists because two admins acting in the same instant
 * can both pass a check made before either has written.
 */
export function wouldLeaveNoAdmin(members: MemberLike[], userId: string, nextRole: SocietyRole | null) {
  const target = members.find((member) => member.userId === userId);
  if (!target || target.role !== "admin") return false;
  if (nextRole === "admin") return false;
  const otherAdmins = members.filter((member) => member.role === "admin" && member.userId !== userId);
  return otherAdmins.length === 0;
}

export type MemberFilter = "all" | "admin" | "committee" | "resident";

export function matchesFilter(role: SocietyRole, filter: MemberFilter) {
  if (filter === "all") return true;
  if (filter === "resident") return role === "read_only";
  return role === filter;
}

/** Name or flat/unit, case-insensitive, ignoring spaces and dashes in the flat. */
export function matchesSearch(member: { name: string; flat: string | null }, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  if (member.name.toLowerCase().includes(query)) return true;
  const squash = (value: string) => value.toLowerCase().replace(/[\s-]+/g, "");
  return Boolean(member.flat && squash(member.flat).includes(squash(query)));
}
