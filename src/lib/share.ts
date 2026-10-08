/**
 * Share a link the way the person's phone shares things, falling back to
 * copying it.
 *
 * Most of this app's audience arrives from a WhatsApp group, so "tell your
 * neighbours" is the one growth loop it has. `navigator.share` opens the
 * phone's own sheet (WhatsApp first on most phones); on a desktop browser it
 * is missing and the link is copied instead, and the caller is told which
 * happened so it can say so. Closing the sheet is not a failure.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareLink(input: { title: string; text?: string; url: string }): Promise<ShareOutcome> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(input);
      return "shared";
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return "cancelled";
    // Anything else (a policy refusal, say) falls through to copying.
  }
  try {
    await navigator.clipboard.writeText(input.url);
    return "copied";
  } catch {
    return "failed";
  }
}
