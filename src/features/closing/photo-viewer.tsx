import { Send, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatEventTimestamp } from "@/features/dashboard/dashboard-utils";
import { galleryReactions, initials, useGalleryComments, type GalleryPhoto } from "@/lib/closing";
import { cn } from "@/lib/utils";

export type PhotoSocialActions = {
  react: (input: { photoId: string; emoji: string }) => Promise<unknown>;
  comment: (input: { photoId: string; body: string }) => Promise<unknown>;
  deleteComment: (input: { commentId: string; photoId: string }) => Promise<unknown>;
};

/**
 * One photograph, full size, with what people made of it.
 *
 * The thread loads with the dialog rather than with the gallery - fifty
 * collapsed photographs make no comment request at all, only this one does.
 *
 * Reacting and commenting need a sign-in, because a reaction nobody can be
 * held to is just a counter and a comment without an author is not one.
 * Reading both is public, like the rest of the closing page.
 */
export function PhotoViewer({
  photo,
  signedIn,
  actions,
  onOpenChange,
}: {
  photo: GalleryPhoto;
  signedIn: boolean;
  actions: PhotoSocialActions;
  onOpenChange: (open: boolean) => void;
}) {
  const thread = useGalleryComments(photo.id, true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function react(emoji: string) {
    setError(null);
    try {
      // Tapping the one you already picked takes it back.
      await actions.react({ photoId: photo.id, emoji: photo.myReaction === emoji ? "" : emoji });
    } catch (reactError) {
      setError(reactError instanceof Error ? reactError.message : "Couldn't save that reaction");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await actions.comment({ photoId: photo.id, body: text });
      setBody("");
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Couldn't post that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{photo.caption || "Photograph"}</DialogTitle>
        </DialogHeader>

        <figure className="relative">
          <img
            src={photo.image_url}
            alt={photo.caption || "Celebration photograph"}
            className="max-h-[60vh] w-full rounded-lg object-contain"
          />
          {photo.caption ? (
            <figcaption className="font-display absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10 text-base text-white">
              {photo.caption}
            </figcaption>
          ) : null}
        </figure>

        {photo.uploader ? <p className="text-xs text-muted-foreground">Added by {photo.uploader}</p> : null}

        {photo.social ? (
          <>
            <div className="flex flex-wrap gap-2">
              {galleryReactions.map((reaction) => {
                const count = photo.reactions[reaction.key] ?? 0;
                const picked = photo.myReaction === reaction.key;
                return (
                  <button
                    key={reaction.key}
                    type="button"
                    disabled={!signedIn}
                    aria-pressed={picked}
                    aria-label={`${reaction.label}${count ? ` (${count})` : ""}`}
                    onClick={() => void react(reaction.key)}
                    className={cn(
                      "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      picked ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-muted",
                      signedIn ? "" : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span aria-hidden="true">{reaction.glyph}</span>
                    {count ? <span className="tabular-nums">{count}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {thread.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading comments…</p>
              ) : thread.data?.comments.length ? (
                <ul className="space-y-3">
                  {thread.data.comments.map((comment) => (
                    <li key={comment.id} className="flex items-start gap-2.5">
                      {comment.author.photoUrl ? (
                        <img src={comment.author.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initials(comment.author.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium">{comment.author.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatEventTimestamp(comment.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                      </div>
                      {comment.mine ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Delete your comment"
                          onClick={async () => {
                            if (!window.confirm("Delete your comment?")) return;
                            await actions.deleteComment({ commentId: comment.id, photoId: photo.id });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing said about this one yet.</p>
              )}

              {signedIn ? (
                <form className="flex gap-2" onSubmit={submit}>
                  <Input
                    value={body}
                    maxLength={600}
                    placeholder="Say something about this photo"
                    aria-label="Your comment"
                    onChange={(event) => setBody(event.target.value)}
                  />
                  <Button type="submit" disabled={busy || !body.trim()} className="shrink-0">
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Post
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link to="/login" className="font-medium text-primary underline underline-offset-2">
                    Sign in
                  </Link>{" "}
                  to react or leave a comment.
                </p>
              )}

              {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
