/**
 * The line that greets somebody on the society's front door.
 *
 * Pure and import-free so it can be checked without rendering anything. It reads the hour the device
 * reports - a greeting is about the person's own morning, so no backend and no event time zone is
 * involved.
 */

/** "Good morning" until noon, "Good afternoon" until 5pm, "Good evening" otherwise. */
export function greetingFor(hour: number) {
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Bikesh Kumar Gupta" -> "Bikesh". Null when there is no usable name, so the caller can drop the name
 *  rather than greet somebody as "undefined" or by an email address. */
export function firstNameOf(name: string | null | undefined) {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return null;
  return first;
}
