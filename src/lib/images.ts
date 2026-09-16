/**
 * Getting a photo off a phone and into a JSON request body.
 *
 * Shared because two features need exactly the same thing for different
 * reasons: an expense bill (`prepareBill` in src/lib/expenses.ts) and a
 * gallery photograph (`prepareGalleryPhoto` below). Both post base64 inside
 * ordinary JSON rather than multipart - see api/uploads.ts for why - and
 * base64 inflates a file by about a third, so what leaves the device has to
 * be small before it is encoded.
 *
 * Phone photos are routinely 3-8MB. Shrinking on the device rather than
 * refusing the upload is the whole point: nobody should have to know what a
 * megabyte is to add a picture of the mandap.
 */

/** Types a browser can decode and we can send untouched. */
export const SENDABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This photo's format can't be opened here. Take a screenshot of it, or choose a JPEG or PNG."));
    image.src = url;
  });
}

/**
 * Re-encodes a photo as a JPEG no longer than `maxEdge` on its long side.
 *
 * Browsers apply the camera's EXIF rotation when drawing, so the result stays
 * upright. The canvas is painted white first because JPEG has no
 * transparency and a transparent PNG would otherwise come out black - that is
 * pixel data, not a theme colour, so it is a literal on purpose.
 */
export async function shrinkImage(file: File, maxEdge: number, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn't prepare the photo. Try a different browser.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("This browser couldn't prepare the photo. Try a different browser.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Long edge of a gallery photograph. Plenty for a full-screen view on any
 *  phone or laptop, and a fraction of what a 12MP camera produces. */
const GALLERY_MAX_EDGE = 1600;
/** What the upload route accepts after base64 inflation. */
const GALLERY_MAX_BYTES = 4 * 1024 * 1024;

export type PreparedPhoto = { file: File; bytes: number; originalBytes: number; shrunk: boolean };

/**
 * Gets a gallery photograph ready to upload.
 *
 * **Always re-encodes**, unlike `prepareBill`, which sends anything already
 * under 1MB untouched. A gallery is many photos from many people looked at on
 * phones over society wifi; there is no reason to keep a 12MP original when
 * nothing on the page ever shows more than about 1600px of it, and the
 * committee is paying for the storage either way. A small photo that is
 * already smaller than the target simply comes back at its own size, because
 * the scale is capped at 1.
 */
export async function prepareGalleryPhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photograph - JPEG, PNG or WEBP.");
  }
  if (!SENDABLE_IMAGE_TYPES.has(file.type) && file.type !== "image/gif") {
    throw new Error("That image format can't be opened here. Choose a JPEG, PNG or WEBP.");
  }

  // An animated GIF would lose its animation on a canvas, so it goes as it is
  // or not at all.
  if (file.type === "image/gif") {
    if (file.size > GALLERY_MAX_BYTES) throw new Error("That GIF is larger than 4MB.");
    return { file, bytes: file.size, originalBytes: file.size, shrunk: false };
  }

  const blob = await shrinkImage(file, GALLERY_MAX_EDGE);
  if (blob.size > GALLERY_MAX_BYTES) {
    throw new Error("That photo is still too large after shrinking it. Try a smaller one.");
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return {
    file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
    bytes: blob.size,
    originalBytes: file.size,
    shrunk: blob.size < file.size,
  };
}
