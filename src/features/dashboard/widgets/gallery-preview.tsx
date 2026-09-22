import type { WidgetVariant } from "@/lib/widgets";
import type { GalleryPhoto } from "@/lib/closing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * The first few celebration photographs, with the rest on the closing page.
 * Same photos and same captions as `/closing` - this is a window onto that
 * gallery, not a second place to manage one.
 */
export function GalleryPreview({
  photos,
  variant = "detailed",
}: {
  photos: GalleryPhoto[];
  variant?: WidgetVariant;
}) {
  // One row of three on a phone-width dashboard, two rows on a roomy one.
  const preview = photos.slice(0, variant === "detailed" ? 6 : 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Gallery</CardTitle>
          {photos.length ? (
            <Link to="/closing#photographs" className="text-sm font-medium text-primary underline underline-offset-2">
              See all {photos.length}
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {preview.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {preview.map((photo) => (
              <Link
                key={photo.id}
                to="/closing#photographs"
                className="group relative overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption || "Celebration photograph"}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                {photo.caption ? (
                  <span className="font-display absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-xs leading-snug text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                    {photo.caption}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md bg-muted p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background">
              <Image className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">No event images yet.</p>
              <p className="text-sm text-muted-foreground">
                Committee members add them on the{" "}
                <Link to="/closing#photographs" className="font-medium text-primary underline underline-offset-2">
                  Closing page
                </Link>
                , with a caption for each.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
