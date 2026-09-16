import { Images, MessageCircle, Pencil, Trash2, Upload } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoViewer, type PhotoSocialActions } from "@/features/closing/photo-viewer";
import { galleryReactions, groupByAlbum, type GalleryPhoto } from "@/lib/closing";
import { prepareGalleryPhoto, formatFileSize } from "@/lib/images";
import { useImageUpload } from "@/lib/uploads";

type GalleryActions = PhotoSocialActions & {
  add: (input: { imageUrl: string; caption: string; album: string }) => Promise<unknown>;
  update: (input: { photoId: string; caption: string; album: string }) => Promise<unknown>;
  remove: (photoId: string) => Promise<unknown>;
};

/** What one person may add to one event. Mirrors MAX_PHOTOS_PER_PERSON in
 *  api/_lib/closing.ts, which is what actually enforces it. */
const PHOTOS_PER_PERSON = 10;

/**
 * The celebration photographs.
 *
 * A caption is printed over the bottom strip of its own photo rather than
 * underneath it - the committee asked for it to read like a line on the
 * print, not a table cell. It sits on a gradient so the words clear the
 * image whatever the photo is, and it is real text, so it is selectable and
 * a screen reader gets it once (the image itself carries the same words as
 * its alt text only when there is no caption).
 *
 * Albums are free text ("Puja mandap", "Cultural evening", "Our team") -
 * whatever this event's photos happen to be about.
 */
export function GallerySection({
  photos,
  eventId,
  canManage,
  signedIn,
  actions,
  isLoading,
}: {
  photos: GalleryPhoto[];
  eventId?: string;
  canManage: boolean;
  /** Anybody signed in may add a photograph - this is the society's album,
   *  not the committee's noticeboard. */
  signedIn: boolean;
  actions: GalleryActions;
  isLoading: boolean;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<GalleryPhoto | null>(null);
  const [viewing, setViewing] = useState<GalleryPhoto | null>(null);
  const albums = groupByAlbum(photos);
  const knownAlbums = [...new Set(photos.map((photo) => photo.album.trim()).filter(Boolean))];
  const mine = photos.filter((photo) => photo.mine).length;
  const roomLeft = PHOTOS_PER_PERSON - mine;
  const socialReady = photos.length === 0 || photos[0].social;

  // The viewer keeps its own copy in state, so it has to follow the list when
  // a reaction or comment lands and the gallery refetches.
  const viewingLive = viewing ? (photos.find((photo) => photo.id === viewing.id) ?? viewing) : null;

  return (
    // The dashboard's gallery preview links straight here with #photographs.
    <Card id="photographs" tabIndex={-1} className="scroll-mt-20 focus-visible:outline-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Images className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle>Photographs</CardTitle>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {photos.length ? `${photos.length} from the celebration.` : "Moments from the celebration."}
              {signedIn ? ` You have added ${mine} of ${PHOTOS_PER_PERSON}.` : ""}
            </p>
          </div>
          {signedIn ? (
            <Button size="sm" onClick={() => setUploadOpen(true)} disabled={roomLeft <= 0}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {roomLeft > 0 ? "Add photo" : "Limit reached"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!socialReady ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Reactions and comments need <code>supabase/migrations/021_gallery_social.sql</code> to be run in Supabase.
            The photographs below are unaffected.
          </p>
        ) : null}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="aspect-[4/3] animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : photos.length ? (
          albums.map((group) => (
            <section key={group.album} className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.album}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((photo) => (
                  <figure key={photo.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                    <button
                      type="button"
                      onClick={() => setViewing(photo)}
                      className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={photo.caption ? `Open photo: ${photo.caption}` : "Open photo"}
                    >
                      <img
                        src={photo.image_url}
                        alt={photo.caption || `${group.album} photograph`}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                      {photo.caption ? (
                        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2.5 pt-8 text-left">
                          <span className="font-display block text-sm leading-snug text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                            {photo.caption}
                          </span>
                        </figcaption>
                      ) : null}
                    </button>
                    {canManage || photo.mine ? (
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 sm:opacity-70">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9"
                          aria-label="Edit caption"
                          onClick={() => setEditing(photo)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9"
                          aria-label="Remove photo"
                          onClick={async () => {
                            if (!window.confirm("Remove this photo from the closing page? Its comments go with it."))
                              return;
                            await actions.remove(photo.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                    <PhotoTally photo={photo} />
                  </figure>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            No photographs yet.{" "}
            {signedIn
              ? "Add yours with a short caption - the mandap, the cultural evening, the team behind it."
              : "Sign in to add yours."}
          </div>
        )}
      </CardContent>

      {signedIn ? (
        <PhotoUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          eventId={eventId}
          knownAlbums={knownAlbums}
          roomLeft={roomLeft}
          onSave={actions.add}
        />
      ) : null}

      {editing ? (
        <PhotoCaptionDialog
          photo={editing}
          knownAlbums={knownAlbums}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={actions.update}
        />
      ) : null}

      {viewingLive ? (
        <PhotoViewer
          photo={viewingLive}
          signedIn={signedIn}
          actions={actions}
          onOpenChange={(open) => !open && setViewing(null)}
        />
      ) : null}
    </Card>
  );
}

/**
 * The strip under a tile: how it went down, at a glance.
 *
 * Deliberately not the full picker - that is in the viewer. A four-button
 * reaction row on every tile in a three-across grid is a wall of controls,
 * and tapping the photograph is the thing people already do.
 */
function PhotoTally({ photo }: { photo: GalleryPhoto }) {
  if (!photo.social) return null;
  const total = Object.values(photo.reactions).reduce((sum, count) => sum + count, 0);
  if (!total && !photo.commentCount) return null;

  const picked = galleryReactions.filter((reaction) => (photo.reactions[reaction.key] ?? 0) > 0);

  return (
    <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
      {total ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
          <span aria-hidden="true">{picked.map((reaction) => reaction.glyph).join("")}</span>
          <span className="tabular-nums">{total}</span>
          <span className="sr-only">reactions</span>
        </span>
      ) : null}
      {photo.commentCount ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{photo.commentCount}</span>
          <span className="sr-only">comments</span>
        </span>
      ) : null}
    </div>
  );
}

function AlbumField({ defaultValue, knownAlbums }: { defaultValue?: string; knownAlbums: string[] }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="album">Album</Label>
      <Input
        id="album"
        name="album"
        list="closing-albums"
        defaultValue={defaultValue}
        placeholder="Puja mandap, Cultural evening, Our team..."
      />
      <datalist id="closing-albums">
        {knownAlbums.map((album) => (
          <option key={album} value={album} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * Adding a photograph.
 *
 * The file is **always re-encoded on the device** before it goes anywhere -
 * see `prepareGalleryPhoto`. A phone camera produces 3-8MB; nothing on this
 * page ever shows more than about 1600px of it, and everybody looking at the
 * gallery would be downloading the difference. The dialog says what it did,
 * because a silently altered file is a surprise.
 */
function PhotoUploadDialog({
  open,
  onOpenChange,
  eventId,
  knownAlbums,
  roomLeft,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string;
  knownAlbums: string[];
  roomLeft: number;
  onSave: GalleryActions["add"];
}) {
  const upload = useImageUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ file: File; bytes: number; originalBytes: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setPrepared(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pick(file: File | undefined) {
    setPrepared(null);
    setPreview(null);
    setError(null);
    if (!file) return;

    try {
      const ready = await prepareGalleryPhoto(file);
      setPrepared(ready);
      setPreview(URL.createObjectURL(ready.file));
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Couldn't read that photo");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pastedUrl = String(formData.get("imageUrl") ?? "").trim();

    if (!prepared && !pastedUrl) {
      setError("Choose a photo to upload, or paste an image URL");
      return;
    }
    if (prepared && !eventId) {
      setError("Pick an event before uploading");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const imageUrl = prepared
        ? await upload.mutateAsync({ file: prepared.file, eventId: eventId!, folder: "closing" })
        : pastedUrl;
      await onSave({
        imageUrl,
        caption: String(formData.get("caption") ?? "").trim(),
        album: String(formData.get("album") ?? "").trim(),
      });
      reset();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add this photo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a photograph</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="photo-file">Photo</Label>
            <Input
              id="photo-file"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="h-auto py-2"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WEBP. Large photos are shrunk on your phone before they are sent, so the gallery stays quick
              for everybody. You can add {roomLeft} more. Or paste a URL below.
            </p>
          </div>
          {preview ? (
            <>
              <img src={preview} alt="" className="max-h-48 w-full rounded-md border object-contain" />
              {prepared && prepared.bytes < prepared.originalBytes ? (
                <p className="text-xs text-muted-foreground">
                  Shrunk from {formatFileSize(prepared.originalBytes)} to {formatFileSize(prepared.bytes)}.
                </p>
              ) : null}
            </>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input id="imageUrl" name="imageUrl" placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caption">Caption</Label>
            <Input id="caption" name="caption" placeholder="Sthapana morning at the mandap" maxLength={160} />
          </div>
          <AlbumField knownAlbums={knownAlbums} />
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding..." : "Add photo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoCaptionDialog({
  photo,
  knownAlbums,
  onOpenChange,
  onSave,
}: {
  photo: GalleryPhoto;
  knownAlbums: string[];
  onOpenChange: (open: boolean) => void;
  onSave: GalleryActions["update"];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        photoId: photo.id,
        caption: String(formData.get("caption") ?? "").trim(),
        album: String(formData.get("album") ?? "").trim(),
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update this photo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit caption</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <img src={photo.image_url} alt="" className="max-h-48 w-full rounded-md border object-contain" />
          <div className="space-y-2">
            <Label htmlFor="caption">Caption</Label>
            <Input id="caption" name="caption" defaultValue={photo.caption} maxLength={160} />
          </div>
          <AlbumField defaultValue={photo.album} knownAlbums={knownAlbums} />
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
