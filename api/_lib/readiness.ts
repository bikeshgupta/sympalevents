import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAnnouncements } from "./announcements.js";
import { fetchEventModules } from "./page-visibility.js";
import { selectDegrading } from "./schema-compat.js";

/**
 * Is this event ready for residents?
 *
 * One answer, used twice: the command centre draws it as a checklist, and
 * publishing is **checked against it on the server**. The checklist alone would
 * be advice; a button that publishes an event with no venue and a paid
 * registration with nowhere to send the money is how a first-time organiser
 * embarrasses themselves in front of the whole society.
 *
 * ## Two kinds of gap
 *
 * - **Blocking** - things residents cannot work around: the venue, or a paid
 *   registration with no payment instructions. Publishing refuses.
 * - **Everything else** - registration switched off though the module is on, no
 *   programme yet. Publishing asks the organiser to confirm, because plenty of
 *   events legitimately publish before their programme is final.
 *
 * It reads straight from the tables rather than through the viewer's page
 * access: only an event or society admin can publish, and the checklist is
 * about the event, not about what one person happens to be allowed to open.
 *
 * Every read stands on its own, so an unmigrated database (no registration
 * tables yet) reports what it can rather than failing.
 */

export type ReadinessItem = {
  key: string;
  label: string;
  status: "complete" | "missing" | "optional";
  detail?: string;
  page?: string;
  /** Publishing refuses while this is missing. */
  blocking?: boolean;
};

export type Readiness = { items: ReadinessItem[]; percent: number };

async function safe<T>(read: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function readEventReadiness(supabase: SupabaseClient, eventId: string): Promise<Readiness> {
  const eventResult = await selectDegrading(
    "events",
    ["id", "name", "start_date", "end_date", "location", "hero_image_url"],
    ["id", "name", "start_date", "end_date", "location"],
    (select) => supabase.from("events").select(select).eq("id", eventId).maybeSingle(),
  );
  if (eventResult.error) throw eventResult.error;
  const event = (eventResult.data ?? {}) as unknown as Record<string, unknown>;

  const modules = await fetchEventModules(eventId);
  const has = (pageKey: string) => modules[pageKey]?.isEnabled === true;

  const config = has("registration")
    ? await safe(async () => {
        const { data, error } = await supabase.from("event_registration_settings").select("*").eq("event_id", eventId).maybeSingle();
        if (error) throw error;
        return (data ?? null) as Record<string, unknown> | null;
      })
    : null;

  const programme = has("event-plan")
    ? await safe(async () => {
        const { count, error } = await supabase.from("event_schedule").select("id", { count: "exact", head: true }).eq("event_id", eventId);
        if (error) throw error;
        return count ?? 0;
      })
    : null;

  const posts = await loadAnnouncements(supabase, eventId, false);

  const items: ReadinessItem[] = [];
  const venue = String(event.location ?? "").trim();

  items.push({
    key: "details",
    label: "Event details",
    status: venue && event.start_date && event.end_date ? "complete" : "missing",
    detail: venue ? undefined : "Add the venue",
    page: "settings",
    blocking: true,
  });

  items.push({
    key: "hero",
    label: "Hero",
    status: "complete",
    detail: event.hero_image_url ? "Your own photograph" : "Using artwork for this kind of event",
    page: "settings",
  });

  if (has("registration")) {
    const enabled = config?.enabled === true;
    items.push({
      key: "registration",
      label: "Registration",
      status: enabled ? "complete" : "missing",
      detail: enabled ? undefined : "Registration is switched off",
      page: "registration",
    });

    const paid =
      Number(config?.adult_price ?? 0) > 0 ||
      Number(config?.child_price ?? 0) > 0 ||
      (config?.food_enabled === true && Number(config?.food_price ?? 0) > 0);
    if (enabled && paid) {
      const instructions = String(config?.payment_instructions ?? "").trim();
      items.push({
        key: "payment",
        label: "Payment instructions",
        status: instructions.length >= 5 ? "complete" : "missing",
        detail: instructions.length >= 5 ? undefined : "Residents will not know how to pay",
        page: "registration",
        blocking: true,
      });
    }
  }

  if (programme !== null) {
    items.push({
      key: "programme",
      label: "Programme",
      status: programme > 0 ? "complete" : "missing",
      detail: programme > 0 ? `${programme} ${programme === 1 ? "item" : "items"}` : "Nothing scheduled yet",
      page: "event-plan",
    });
  }

  const published = posts.length;
  items.push({
    key: "announcements",
    label: "Announcements",
    status: published > 0 ? "complete" : "optional",
    detail: published > 0 ? `${published} published` : "None yet",
    page: "dashboard",
  });

  const counted = items.filter((item) => item.status !== "optional");
  const complete = counted.filter((item) => item.status === "complete").length;
  return { items, percent: counted.length ? Math.round((complete / counted.length) * 100) : 100 };
}

/** What stops publishing outright, and what only needs a second look. */
export function publishGaps(readiness: Readiness) {
  const missing = readiness.items.filter((item) => item.status === "missing");
  return {
    blocking: missing.filter((item) => item.blocking),
    warnings: missing.filter((item) => !item.blocking),
  };
}
