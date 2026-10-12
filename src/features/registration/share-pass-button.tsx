import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { passImage, sharePassImage } from "@/lib/pass";
import type { Registration } from "../../../shared/registration";

/**
 * "Share pass" on an organiser's row: the household's QR as a picture, sent
 * through the phone's share sheet (WhatsApp) or saved on a desktop.
 *
 * The pass token is fetched at the moment of sharing, one booking at a time -
 * the list never carries it - and the server logs each one. It is offered only
 * for a booking that is paid or free and still on, the same rule as the
 * resident's own pass; otherwise the button says why it is off rather than
 * disappearing. The picture carries the event, the flat and the head count,
 * and never the payment reference, so it is safe to forward.
 */
function canSharePass(row: Registration) {
  return row.status === "active" && (row.payment_status === "verified" || row.payment_status === "free");
}

export function SharePassButton({
  eventId,
  eventName,
  row,
  onMessage,
}: {
  eventId: string;
  eventName: string;
  row: Registration;
  onMessage: (message: { tone: "ok" | "error"; text: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const allowed = canSharePass(row);

  async function share() {
    setBusy(true);
    try {
      const { pass } = await apiFetch<{
        pass: { token: string; code: string; name: string; flat: string; people: number };
      }>(`/api/events?resource=registration&eventId=${encodeURIComponent(eventId)}&passFor=${encodeURIComponent(row.id)}`);
      const people = `${pass.people} ${pass.people === 1 ? "person" : "people"}`;
      const blob = await passImage(pass.token, [eventName, `Flat ${pass.flat} · ${people}`, `Booking ${pass.code}`]);
      const outcome = await sharePassImage(
        blob,
        `${eventName} - ${pass.flat} pass.png`.replace(/[\\/:*?"<>|]/g, ""),
        `Your pass for ${eventName}. Show this QR at the gate.`,
      );
      if (outcome === "downloaded") {
        onMessage({ tone: "ok", text: `Saved the pass for ${pass.name} · ${pass.flat}. Send the picture on WhatsApp.` });
      } else if (outcome === "shared") {
        onMessage({ tone: "ok", text: `Shared the pass for ${pass.name} · ${pass.flat}.` });
      }
    } catch (error) {
      onMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-10 shrink-0"
      disabled={!allowed || busy}
      title={allowed ? undefined : "A pass is issued once the booking is paid or free"}
      aria-label={`Share pass for ${row.contact_name}, ${row.flat}`}
      onClick={() => void share()}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {busy ? "Preparing..." : "Share pass"}
    </Button>
  );
}
