import { Download, Share2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { passImage, passSvg, svgDataUrl } from "@/lib/pass";
import { useRegistration } from "@/lib/registration";
import { cn } from "@/lib/utils";
import { paymentLabels, type Registration } from "../../../shared/registration";

/**
 * A resident's entry pass: the thing they hold up at the gate.
 *
 * It shows a QR code only once the booking is paid for (or free): an unpaid
 * pass would just be turned back at the gate, so this says what is outstanding
 * instead and points at where to settle it. What it shows beyond the code is
 * what the volunteer needs and nothing private - the name, the flat, the head
 * count and the payment *status*. Never the payment reference, which is why it is
 * safe to share a picture of it.
 *
 * ## For a bad signal
 *
 * Venues are crowded and phones are slow. The last pass the server returned is
 * kept on the device, and if the next fetch fails that copy is shown with a
 * plain "offline copy, last updated" line rather than an error: a pass that
 * worked an hour ago works now, and a stale one says it is stale. Storage can be
 * blocked (a private window), so every access is wrapped and the page simply
 * behaves as though there were no copy.
 */

const cacheKey = (eventId: string) => `sympal:pass:${eventId}`;

type Saved = { savedAt: string; booking: Registration & { pass_token?: string } };

function readSaved(eventId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(eventId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(eventId: string, booking: Registration & { pass_token?: string }) {
  try {
    window.localStorage.setItem(cacheKey(eventId), JSON.stringify({ savedAt: new Date().toISOString(), booking }));
  } catch {
    /* no storage: no offline copy, nothing else changes */
  }
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function PassPage() {
  const { selectedEventId } = useEventContext();
  const { data: eventData } = useEventData({ includeTasks: false });
  const path = useEventPath();
  const location = useLocation();
  const { query } = useRegistration(selectedEventId);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const live = query.data?.mine as (Registration & { pass_token?: string }) | null | undefined;
  const signedIn = query.data?.signedIn ?? false;

  useEffect(() => {
    if (selectedEventId && live?.pass_token) writeSaved(selectedEventId, live);
  }, [selectedEventId, live]);

  // The server's answer wins. The saved copy is only for when there is none.
  const saved = !live && query.isError && selectedEventId ? readSaved(selectedEventId) : null;
  const booking = live ?? saved?.booking ?? null;
  const token = booking?.pass_token;
  const confirmed = booking?.payment_status === "verified" || booking?.payment_status === "free";
  const active = booking?.status === "active";

  const svg = useMemo(() => (token ? passSvg(token, "Your entry pass") : null), [token]);
  const code = booking ? booking.id.slice(0, 8).toUpperCase() : "";
  const people = booking ? booking.adults + booking.children : 0;

  async function share() {
    if (!token || !booking) return;
    setShareMessage(null);
    try {
      const blob = await passImage(token, [eventData.event.name, `${booking.contact_name} · Flat ${booking.flat}`, `Booking ${code}`]);
      const file = new File([blob], `pass-${code}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${eventData.event.name} pass` });
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(link.href);
        setShareMessage("Saved to your downloads.");
      }
    } catch (error) {
      // Closing the share sheet is not a failure.
      if ((error as Error).name !== "AbortError") setShareMessage("Could not share the pass. Take a screenshot instead.");
    }
  }

  if (query.isLoading) return <p role="status">Loading your pass…</p>;

  if (!booking) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-semibold">My pass</h1>
        {!signedIn && !query.isError ? (
          <>
            <p className="text-muted-foreground">Sign in to see your entry pass.</p>
            <Button asChild>
              <Link to="/login" state={{ from: location.pathname }}>
                Sign in
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {query.isError ? "Could not reach the server, and there is no saved pass on this phone." : "You do not have a booking for this event yet."}
            </p>
            {!query.isError ? (
              <Button asChild>
                <Link to={path("/registration")}>Go to registration</Link>
              </Button>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">My pass</h1>
        <p className="text-sm text-muted-foreground">{eventData.event.name}</p>
      </header>

      {saved ? (
        <p role="status" className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Offline copy, last updated {when(saved.savedAt)}. Your payment status may have changed since.</span>
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          Up to date{query.dataUpdatedAt ? ` · ${when(new Date(query.dataUpdatedAt).toISOString())}` : ""}
        </p>
      )}

      <section className="rounded-2xl border bg-card p-5 text-center shadow-sm">
        <span
          className={cn(
            "inline-block rounded-full px-3 py-1 text-xs font-semibold",
            !active ? "bg-muted text-muted-foreground" : confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900",
          )}
        >
          {!active ? "Cancelled" : paymentLabels[booking.payment_status]}
        </span>
        <h2 className="mt-2 text-xl font-semibold">{booking.contact_name}</h2>
        <p className="text-sm text-muted-foreground">
          Flat {booking.flat} · {people} {people === 1 ? "attendee" : "attendees"}
        </p>

        {active && confirmed && svg ? (
          <>
            <img
              src={svgDataUrl(svg)}
              alt={`Entry pass QR code for booking ${code}`}
              className="mx-auto mt-4 aspect-square w-full max-w-[18rem] rounded-lg border bg-white"
            />
            <p className="mt-2 font-mono text-lg font-semibold tracking-widest">{code}</p>
            <p className="mt-1 text-xs text-muted-foreground">Turn your screen brightness up when you reach the gate.</p>
          </>
        ) : active ? (
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Your pass appears here once your payment is confirmed.{" "}
            <Link to={path("/registration")} className="font-medium underline">
              Pay or submit your reference
            </Link>
            .
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">This booking was cancelled, so it has no pass.</p>
        )}
      </section>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Adults", booking.adults],
          ["Children", booking.children],
          ["Meals", booking.food_count],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card px-2 py-2.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {active && confirmed && token ? (
        <div className="space-y-2">
          <Button type="button" className="h-12 w-full" onClick={() => void share()}>
            {typeof navigator.canShare === "function" ? <Share2 className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {typeof navigator.canShare === "function" ? "Share pass" : "Save pass as image"}
          </Button>
          {shareMessage ? (
            <p role="status" className="text-center text-sm text-muted-foreground">
              {shareMessage}
            </p>
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            The picture carries the pass and your booking code - not how you paid.
          </p>
        </div>
      ) : null}
    </div>
  );
}
