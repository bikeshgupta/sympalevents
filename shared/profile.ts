/**
 * Cleaning for the editable parts of a person's profile. No imports, so the API and the
 * tests share it.
 */

const squash = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanDisplayName(value: unknown) {
  return squash(value, 80);
}

/** "d-104" -> "D-104": how flats are written everywhere else in the app. */
export function cleanProfileFlat(value: unknown) {
  return squash(value, 40).toUpperCase();
}

/** Digits, spaces, + and - only - nothing else is ever stored in a phone column. */
export function cleanProfilePhone(value: unknown) {
  return String(value ?? "").replace(/[^0-9+\- ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/**
 * A profile photograph has to be one this app stored for **that person**:
 * `.../uploads/profiles/<their id>/<file>`. Any other URL would let somebody point their
 * avatar - which appears beside their name on public pages - at a third party, who would
 * then learn who opens those pages and when; and a path that is somebody else's would
 * borrow their picture.
 */
export function isOwnAvatarUrl(url: string, userId: string, storageOrigin?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  // Where this app's storage lives, when the caller knows it (the API does): the host has to match too.
  if (storageOrigin && !url.startsWith(`${storageOrigin.replace(/\/$/, "")}/storage/v1/object/public/uploads/profiles/`)) return false;
  const prefix = /^https:\/\/[^/]+\/storage\/v1\/object\/public\/uploads\/profiles\/([0-9a-f-]{36})\/[A-Za-z0-9._-]+$/i.exec(url);
  return Boolean(prefix) && prefix![1].toLowerCase() === userId.toLowerCase() && url.length <= 500;
}
