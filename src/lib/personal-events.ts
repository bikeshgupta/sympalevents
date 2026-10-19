import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { RsvpCounts, RsvpStatus } from "../../shared/personal-events";

/**
 * Personal events in the browser: one read per screen, writes that refresh what they change.
 * Rules in shared/personal-events.ts; the API in api/_lib/personal-events.ts.
 *
 * Every key starts "personal", which is deliberately **not** in query-persist's `persistedRoots`: a guest
 * list carries phone numbers, and an invitation is somebody else's private event.
 */

export type PersonalEvent = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  color: string;
  startsOn: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  address: string | null;
  /** The host's own photograph (uploads/personal/<host>/...), or null for the kind's artwork. */
  coverUrl: string | null;
  code: string;
  guestsSeeList: boolean;
  allowPlusOnes: boolean;
  status: "active" | "cancelled";
};

export type MinePersonal = {
  ready: boolean;
  migration?: string;
  hosting: (PersonalEvent & { counts: RsvpCounts })[];
  invited: (PersonalEvent & { counts: RsvpCounts; myStatus: RsvpStatus | null })[];
};

export type Invitation = {
  ready: boolean;
  event: PersonalEvent;
  host: { firstName: string };
  isHost: boolean;
  repliesOpen: boolean;
  counts: RsvpCounts;
  wishes: { name: string; wish: string }[];
  guests: string[] | null;
  mine: { name: string; status: RsvpStatus; people: number; wish: string | null } | null;
};

export type HostedEvent = {
  event: PersonalEvent;
  counts: RsvpCounts;
  rsvps: { id: string; name: string; status: RsvpStatus; people: number; phone: string | null; wish: string | null; signedIn: boolean; updatedAt: string }[];
};

export type PersonalEventInput = {
  kind: string;
  title: string;
  description: string;
  color: string;
  startsOn: string;
  startTime: string;
  endTime: string;
  venue: string;
  address: string;
  coverUrl: string;
  guestsSeeList: boolean;
  allowPlusOnes: boolean;
};

const TOKEN_KEY = "sympal:guest-token";
let memoryToken: string | null = null;

/**
 * The random token that lets somebody without an account change their own reply from this browser. The
 * server keeps only its hash. Storage can throw (a private window); then it lives for this page only.
 */
export function guestToken() {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && /^[A-Za-z0-9_-]{24,128}$/.test(stored)) return stored;
  } catch {
    if (memoryToken) return memoryToken;
  }
  if (memoryToken) return memoryToken;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Kept in memory instead.
  }
  return token;
}

const guestHeaders = () => ({ "x-guest-token": guestToken() });

export function useMyPersonalEvents(enabled = true) {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["personal", "mine", session?.user.appUserId ?? "guest"],
    enabled: enabled && Boolean(session),
    queryFn: () => apiFetch<MinePersonal>("/api/events?resource=personal&part=mine"),
  });
}

export function useInvitation(code: string | undefined) {
  const { data: session, isLoading } = useSession();
  return useQuery({
    queryKey: ["personal", "invite", code ?? "", session?.user.appUserId ?? "guest"],
    enabled: Boolean(code) && !isLoading,
    queryFn: () =>
      apiFetch<Invitation>(`/api/events?resource=personal&part=invite&code=${encodeURIComponent(code ?? "")}`, {
        requireAuth: false,
        headers: guestHeaders(),
      }),
  });
}

export function useHostedEvent(id: string | undefined) {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["personal", "event", id ?? ""],
    enabled: Boolean(id && session),
    queryFn: () => apiFetch<HostedEvent>(`/api/events?resource=personal&part=event&id=${encodeURIComponent(id ?? "")}`),
  });
}

export function usePersonalEventMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["personal"] });

  const create = useMutation({
    mutationFn: (input: PersonalEventInput) =>
      apiFetch<{ event: PersonalEvent }>("/api/events?resource=personal&part=create", { method: "POST", body: input }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (input: Partial<PersonalEventInput> & { id: string; action?: "cancel" | "reopen" | "new-code" }) =>
      apiFetch<{ event: PersonalEvent }>("/api/events?resource=personal&part=event", { method: "PATCH", body: input }),
    onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: (input: { code: string; status: RsvpStatus; name: string; people: number; phone: string; wish: string }) =>
      apiFetch<{ mine: Invitation["mine"]; counts: RsvpCounts }>("/api/events?resource=personal&part=rsvp", {
        method: "POST",
        body: input,
        requireAuth: false,
        headers: guestHeaders(),
      }),
    onSuccess: refresh,
  });
  return { create, update, reply };
}

/** The address an invitation is shared at. */
export function invitationUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/i/${code}`;
}

/** "Sun, 1 Nov 2026" read in India, whatever the device's zone. */
export function formatPersonalDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(
    new Date(`${date}T00:00:00+05:30`),
  );
}

/** "16:00" -> "4:00 pm". */
export function formatPersonalTime(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function whenLine(event: Pick<PersonalEvent, "startsOn" | "startTime" | "endTime">) {
  const start = formatPersonalTime(event.startTime);
  const end = formatPersonalTime(event.endTime);
  return [formatPersonalDate(event.startsOn), start ? (end ? `${start} – ${end}` : start) : null].filter(Boolean).join(" · ");
}

/** "In 13 days", "Tomorrow", "Today" - or nothing once it has passed. */
export function daysToGo(startsOn: string, today: string) {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };
  const n = Math.round(day(startsOn) - day(today));
  if (n < 0) return null;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}
