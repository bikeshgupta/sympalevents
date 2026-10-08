import { Eye, EyeOff, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Announcement, AnnouncementTone } from "@/data/announcements";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import { useAnnouncementPosts, type AnnouncementInput } from "@/lib/announcement-posts";
import { cn } from "@/lib/utils";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Draft = AnnouncementInput;

const blank: Draft = {
  title: "",
  body: "",
  tag: "Update",
  tone: "info",
  date: "",
  time: "",
  location: "",
  pinned: false,
};

function draftFrom(post: Announcement): Draft {
  return {
    title: post.title,
    body: post.body,
    tag: post.tag,
    tone: post.tone,
    // A post saved with a "Day 3" rather than a date keeps it: the form only
    // edits what it shows, and PATCH leaves the rest of the row alone.
    date: post.date ?? "",
    time: post.time ?? "",
    location: post.location ?? "",
    pinned: post.pinned === true,
  };
}

/**
 * Where an organiser writes, publishes and takes down the event's announcements.
 *
 * It is a dialog opened from the announcements card rather than a page of its
 * own: the card is where a notice appears, so it is where somebody looks to
 * change one. The card shows the door only to a person who can edit the
 * dashboard, so a resident's view is exactly what it was.
 *
 * Drafts are listed here and nowhere else. A post is not on the dashboard or
 * in the bell until it is published, and saying so on each row with a word -
 * "Draft" / "Published" - means the state is never carried by colour alone.
 */
export function AnnouncementsManager({
  eventId,
  posts,
  open,
  onOpenChange,
}: {
  eventId?: string;
  /** Every post the server sent this editor, drafts included. */
  posts: Announcement[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update, remove } = useAnnouncementPosts(eventId);
  // `null` is the list; `"new"` is a blank form; a post is that post being edited.
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending || remove.isPending;

  function close(next: boolean) {
    if (!next) {
      setEditing(null);
      setError(null);
    }
    onOpenChange(next);
  }

  function startNew() {
    setDraft(blank);
    setError(null);
    setEditing("new");
  }

  function startEdit(post: Announcement) {
    setDraft(draftFrom(post));
    setError(null);
    setEditing(post);
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the announcement");
    }
  }

  function save(status: "draft" | "published") {
    if (!draft.title.trim()) {
      setError("Give the announcement a title");
      return;
    }
    if (editing === "new") {
      void run(() => create.mutateAsync({ ...draft, status }), () => setEditing(null));
    } else if (editing) {
      const id = editing.id;
      // Saving a published post keeps it published; "Publish" on a draft sends
      // the status along with the text so it is one write, not two.
      const publishing = status === "published" && editing.status === "draft";
      void run(
        () => update.mutateAsync({ id, ...draft, ...(publishing ? { status: "published" as const } : {}) }),
        () => setEditing(null),
      );
    }
  }

  const heading =
    editing === "new" ? "New announcement" : editing ? "Edit announcement" : "Announcements";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          {!editing ? (
            <p className="text-sm text-muted-foreground">
              What residents see in the News &amp; Announcements card and the bell. A draft stays here until you
              publish it.
            </p>
          ) : null}
        </DialogHeader>

        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              // Enter saves without changing whether it is live.
              save(editing === "new" || editing.status === "draft" ? "draft" : "published");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={draft.title}
                maxLength={120}
                required
                onChange={(event) => set("title", event.target.value)}
                placeholder="Dandiya sticks are available at the venue"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-body">Message</Label>
              <textarea
                id="ann-body"
                className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={draft.body}
                maxLength={1500}
                onChange={(event) => set("body", event.target.value)}
                placeholder="Optional. Say what residents need to know or do."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-tag">Label</Label>
                <Input
                  id="ann-tag"
                  value={draft.tag}
                  maxLength={30}
                  onChange={(event) => set("tag", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">The small badge: Update, Reminder, Notice…</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-tone">Style</Label>
                <select
                  id="ann-tone"
                  className={selectClass}
                  value={draft.tone === "spotlight" ? "spotlight" : "info"}
                  onChange={(event) => set("tone", event.target.value as AnnouncementTone)}
                >
                  <option value="info">Normal</option>
                  <option value="spotlight">Spotlight</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Spotlight glows. Use it for one notice at a time, or none of them stands out.
                </p>
              </div>
            </div>

            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">About a particular time? (optional)</legend>
              <p className="text-xs text-muted-foreground">
                With a date it counts down ("in 2 days"), reads as live at the time, and drops out of the bell once it
                has passed. Without one it stays until you unpublish it.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="ann-date">Date</Label>
                  <Input id="ann-date" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ann-time">Time</Label>
                  <Input id="ann-time" type="time" value={draft.time} onChange={(e) => set("time", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ann-location">Where</Label>
                  <Input
                    id="ann-location"
                    value={draft.location}
                    maxLength={120}
                    onChange={(e) => set("location", e.target.value)}
                  />
                </div>
              </div>
            </fieldset>

            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              Show first, ahead of newer announcements
            </label>

            {error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                Back
              </Button>
              {editing === "new" || editing.status === "draft" ? (
                <>
                  <Button type="submit" variant="outline" disabled={busy}>
                    {busy ? "Saving…" : "Save draft"}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => save("published")}>
                    Publish
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

            {posts.length ? (
              <ul className="space-y-2">
                {posts.map((post) => {
                  const isDraft = post.status === "draft";
                  return (
                    <li key={post.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            isDraft ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800",
                          )}
                        >
                          {isDraft ? "Draft" : "Published"}
                        </span>
                        {post.pinned ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Pin className="h-3 w-3" aria-hidden="true" />
                            Shown first
                          </span>
                        ) : null}
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{post.tag}</span>
                      </div>
                      <p className="mt-1.5 font-medium leading-snug">{post.title}</p>
                      {post.date || post.time ? (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {[post.date ? formatEventDate(post.date) : null, post.time ? formatEventTime(post.time) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-10" disabled={busy} onClick={() => startEdit(post)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              update.mutateAsync({ id: post.id, status: isDraft ? "published" : "draft" }),
                            )
                          }
                        >
                          {isDraft ? (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          )}
                          {isDraft ? "Publish" : "Unpublish"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 text-destructive"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete "${post.title}"? This cannot be undone.`)) {
                              void run(() => remove.mutateAsync(post.id));
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Nothing posted yet. Write one to tell residents what is happening.
              </p>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={startNew} disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New announcement
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
