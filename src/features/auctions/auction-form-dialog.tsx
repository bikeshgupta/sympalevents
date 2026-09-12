import { Gavel, ImageIcon, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import type { Auction, AuctionInput, useAuctions } from "@/lib/auctions";
import { useImageUpload } from "@/lib/uploads";

/** ISO string -> the local "yyyy-MM-ddTHH:mm" a datetime-local input needs. */
function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultOpensAt() {
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
  return toLocalInputValue(inOneHour.toISOString());
}

function defaultClosesAt() {
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return toLocalInputValue(inThreeDays.toISOString());
}

/**
 * Create or edit an auction. Every field here is what makes an auction real
 * instead of hardcoded - there is no default title, prize, or image; a
 * committee member fills all of it in themselves.
 */
export function AuctionFormDialog({
  open,
  onOpenChange,
  eventId,
  auction,
  create,
  update,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** Present when editing; absent when creating a new auction. */
  auction?: Auction;
  create: ReturnType<typeof useAuctions>["create"];
  update: ReturnType<typeof useAuctions>["update"];
}) {
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(auction?.image_url ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useImageUpload();
  const isEditing = Boolean(auction);
  const pending = create.isPending || update.isPending;

  // The image field is uploaded-or-pasted, not a plain form field, so it
  // needs to be reset by hand whenever the dialog re-opens for a different
  // auction (or a fresh create) - a defaultValue alone would not do that
  // for state that can also be set programmatically after an upload.
  useEffect(() => {
    if (open) setImageUrl(auction?.image_url ?? "");
  }, [open, auction]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const url = await upload.mutateAsync({ file, eventId, folder: "auctions" });
      setImageUrl(url);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to upload image");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const opensAtLocal = String(formData.get("opensAt") ?? "");
    const closesAtLocal = String(formData.get("closesAt") ?? "");
    const opensAt = opensAtLocal ? new Date(opensAtLocal).toISOString() : "";
    const closesAt = closesAtLocal ? new Date(closesAtLocal).toISOString() : "";

    const input: AuctionInput = {
      title: String(formData.get("title") ?? "").trim(),
      tag: String(formData.get("tag") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      prize: String(formData.get("prize") ?? "").trim(),
      imageUrl: imageUrl.trim(),
      startingBid: Number(formData.get("startingBid")),
      minIncrement: Number(formData.get("minIncrement")),
      opensAt,
      closesAt,
    };

    try {
      if (auction) {
        await update.mutateAsync({ auctionId: auction.id, ...input });
      } else {
        await create.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (item) {
      setError(item instanceof Error ? item.message : "Unable to save auction");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit auction" : "Create an auction"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Fill in every detail yourself - there is no default item, prize, or image.
          </p>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Title" name="title" defaultValue={auction?.title} required />
            <FormField label="Tag" name="tag" defaultValue={auction?.tag ?? "Auction"} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="auction-description">
              Description
            </label>
            <textarea
              id="auction-description"
              name="description"
              rows={2}
              defaultValue={auction?.description}
              placeholder="What is this auction for?"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <FormField label="Prize (optional)" name="prize" defaultValue={auction?.prize ?? ""} />

          <div className="space-y-2">
            <span className="text-sm font-medium">Image (optional)</span>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void handleFileChange(event)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={upload.isPending}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    {upload.isPending ? "Uploading..." : imageUrl ? "Replace image" : "Upload image"}
                  </Button>
                  {imageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove image"
                      onClick={() => setImageUrl("")}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="Or paste an image URL"
                  className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">JPEG, PNG, WEBP, or GIF, up to 4MB.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Starting bid (₹)"
              name="startingBid"
              type="number"
              defaultValue={auction?.starting_bid}
              required
            />
            <FormField
              label="Minimum increment (₹)"
              name="minIncrement"
              type="number"
              defaultValue={auction?.min_increment}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Bidding opens"
              name="opensAt"
              type="datetime-local"
              defaultValue={auction ? toLocalInputValue(auction.opens_at) : defaultOpensAt()}
              required
            />
            <FormField
              label="Bidding closes"
              name="closesAt"
              type="datetime-local"
              defaultValue={auction ? toLocalInputValue(auction.closes_at) : defaultClosesAt()}
              required
            />
          </div>

          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || upload.isPending}>
              <Gavel className="h-4 w-4" aria-hidden="true" />
              {pending ? "Saving..." : isEditing ? "Save changes" : "Create auction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
