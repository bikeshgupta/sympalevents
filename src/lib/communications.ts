import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { TemplateKey } from "@/lib/message-templates";

/** The communications centre's data. The server is api/_lib/communications.ts. */

export type Segment = { key: string; label: string; count: number | null; flats: string[] };

export type SentMessage = {
  id: string;
  template: string;
  audience: string;
  audienceCount: number;
  body: string;
  channel: "copy" | "share";
  createdAt: string;
  by: string | null;
};

export type CommunicationsPayload = {
  segments: Segment[];
  historyReady: boolean;
  history: SentMessage[];
  context: { paymentInstructions: string; closesAt: string | null };
};

const url = (eventId: string) => `/api/events?resource=communications&eventId=${encodeURIComponent(eventId)}`;

export function useCommunications(eventId?: string) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ["communications", eventId],
    enabled: Boolean(eventId),
    queryFn: () => apiFetch<CommunicationsPayload>(url(eventId ?? "")),
  });

  // Recorded when a message is copied or shared - the intent, not a delivery.
  const record = useMutation({
    mutationFn: (input: { template: TemplateKey; audience: string; body: string; channel: "copy" | "share" }) =>
      apiFetch<{ id: string; audienceCount: number }>(url(eventId ?? ""), { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["communications", eventId] }),
  });

  return { query, record };
}
