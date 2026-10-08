import { qrSvg } from "@/lib/qr";

/**
 * A booking's pass.
 *
 * The QR carries one thing: `SYMPAL1:` and the booking's opaque token
 * (migration 037) - not its id, its flat, its amount or its payment reference.
 * Anybody who photographs a pass learns exactly what it already shows on its
 * face, and the token alone is useless to anyone but whoever stands at the gate
 * with it, which is the point of a pass.
 */

export const passPayload = (token: string) => `SYMPAL1:${token}`;

export function passSvg(token: string, label: string) {
  return qrSvg(passPayload(token), { label });
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** The pass as a PNG with its caption underneath, for sharing or saving. */
export async function passImage(token: string, caption: string[]): Promise<Blob> {
  const image = new Image();
  image.src = svgDataUrl(passSvg(token, "Entry pass"));
  await image.decode();

  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + 40 + caption.length * 40;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the pass");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);
  context.fillStyle = "#111";
  context.textAlign = "center";
  caption.forEach((line, index) => {
    context.font = index === 0 ? "600 30px system-ui, sans-serif" : "26px system-ui, sans-serif";
    context.fillText(line, size / 2, size + 40 + index * 40);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the image"))), "image/png"),
  );
}
