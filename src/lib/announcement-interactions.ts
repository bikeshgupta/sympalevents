import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

/**
 * What residents and organisers do with a poll or an ask-me-anything.
 * The server side is api/_lib/announcement-interactions.ts, on the same
 * `?resource=announcements` route as writing the post.
 *
 * Nothing here loads until its post is on screen: `enabled` is the card's
 * "this slide is showing", so a dashboard with six polls makes one request.
 * Reads are open to anybody who can see the dashboard (`requireAuth: false`);
 * voting, asking and upvoting need a sign-in, which `apiFetch` enforces.
 */

const base = "/api/events?resource=announcements";

export type ResultsRule = "always" | "after_vote" | "after_close";

export type PollPayload = {
  options: { id: string; label: string }[];
  showResults: ResultsRule;
  closesAt: string | null;
};

/** A post's poll definition, read safely out of its payload. */
export function pollPayload(payload: Record<string, unknown> | undefined): PollPayload {
  const options = Array.isArray(payload?.options)
    ? (payload.options as unknown[]).flatMap((entry) => {
        const item = entry as { id?: unknown; label?: unknown };
        return typeof item?.id === "string" && typeof item?.label === "string" ? [{ id: item.id, label: item.label }] : [];
      })
    : [];
  const rule = payload?.showResults;
  return {
    options,
    showResults: rule === "always" || rule === "after_close" ? rule : "after_vote",
    closesAt: typeof payload?.closesAt === "string" ? payload.closesAt : null,
  };
}

export function closesAtOf(payload: Record<string, unknown> | undefined) {
  return typeof payload?.closesAt === "string" ? payload.closesAt : null;
}

export type PollResult = {
  options: { id: string; label: string; votes: number | null }[];
  total: number | null;
  myVote: string | null;
  canSeeResults: boolean;
  showResults: ResultsRule;
  closesAt: string | null;
  closed: boolean;
};

export type Question = {
  id: string;
  body: string;
  status: "pending" | "approved" | "answered";
  answer: string | null;
  answeredAt: string | null;
  askedBy: string | null;
  mine: boolean;
  upvotes: number;
  iUpvoted: boolean;
  createdAt: string;
};

export type QuestionList = {
  questions: Question[];
  canModerate: boolean;
  closesAt: string | null;
  closed: boolean;
  pending: number;
};

function useViewerKey() {
  const { data: session } = useSession();
  return session?.user.appUserId ?? "guest";
}

export function usePoll(postId: string, enabled: boolean) {
  const viewer = useViewerKey();
  const client = useQueryClient();
  const key = ["announcement-poll", postId, viewer];

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: () =>
      apiFetch<PollResult>(`${base}&part=poll&id=${encodeURIComponent(postId)}`, { requireAuth: false }),
  });

  const vote = useMutation({
    mutationFn: (optionId: string) => apiFetch<PollResult>(`${base}&part=vote`, { method: "POST", body: { id: postId, optionId } }),
    // The server answers with the poll as it now stands, so the bars move on
    // the response rather than on a guess.
    onSuccess: (result) => client.setQueryData(key, result),
  });

  return { query, vote };
}

export function useQuestions(postId: string, enabled: boolean) {
  const viewer = useViewerKey();
  const client = useQueryClient();
  const key = ["announcement-questions", postId, viewer];
  const refresh = () => client.invalidateQueries({ queryKey: ["announcement-questions", postId] });

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: () =>
      apiFetch<QuestionList>(`${base}&part=questions&id=${encodeURIComponent(postId)}`, { requireAuth: false }),
  });

  const ask = useMutation({
    mutationFn: (input: { body: string; anonymous: boolean }) =>
      apiFetch<{ id: string; status: string }>(`${base}&part=question`, { method: "POST", body: { id: postId, ...input } }),
    onSuccess: refresh,
  });

  const upvote = useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<{ upvotes: number; iUpvoted: boolean }>(`${base}&part=upvote`, { method: "POST", body: { questionId } }),
    onSuccess: refresh,
  });

  const moderate = useMutation({
    mutationFn: (input: { questionId: string; action: "approve" | "hide" | "answer"; answer?: string }) =>
      apiFetch<{ ok: true }>(`${base}&part=question`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void refresh();
      // The command centre counts what is waiting.
      void client.invalidateQueries({ queryKey: ["command-centre"] });
    },
  });

  return { query, ask, upvote, moderate };
}

/** "closes in 2 days 4 hr" / "closed" - for a poll or an ask. */
export function closesLabel(closesAt: string | null, now = new Date()) {
  if (!closesAt) return null;
  const diff = new Date(closesAt).getTime() - now.getTime();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return "Closed";
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `Closes in ${days} ${days === 1 ? "day" : "days"}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `Closes in ${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return `Closes in ${Math.max(minutes, 1)} min`;
}

export function percent(votes: number, total: number) {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}
