/**
 * The pure half of the link-preview route (api/_lib/og.ts): turning an event's
 * facts into tags. It imports nothing, so a test can load it without a
 * database, and the handler stays about who may be named, not about markup.
 */

export type OgMeta = {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
};

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Replace the page's title, description, og:* and twitter:* tags with `meta`. Pure. */
export function injectMeta(html: string, meta: OgMeta) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s[^>]*?(?:property="og:[^"]*"|name="(?:twitter:[^"]*|description)")[^>]*>/gi, "");
  const e = escapeHtml;
  const block = [
    `<title>${e(meta.title)}</title>`,
    `<meta name="description" content="${e(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="SymPal Events" />`,
    `<meta property="og:title" content="${e(meta.title)}" />`,
    `<meta property="og:description" content="${e(meta.description)}" />`,
    `<meta property="og:url" content="${e(meta.url)}" />`,
    `<meta property="og:image" content="${e(meta.image)}" />`,
    `<meta property="og:image:alt" content="${e(meta.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(meta.title)}" />`,
    `<meta name="twitter:description" content="${e(meta.description)}" />`,
    `<meta name="twitter:image" content="${e(meta.image)}" />`,
  ].join("\n    ");
  return stripped.includes("</head>") ? stripped.replace("</head>", `    ${block}\n  </head>`) : `${block}\n${stripped}`;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string) {
  const match = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { y: match[1], m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

/** "17 Oct 2026", or "17–19 Oct 2026" / "30 Sep – 2 Oct 2026". Pure. */
export function describeDates(start: string, end: string) {
  const a = day(start);
  if (!a) return "";
  const b = day(end);
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return `${a.d} ${months[a.m]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${months[a.m]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${months[a.m]} – ${b.d} ${months[b.m]} ${a.y}`;
  return `${a.d} ${months[a.m]} ${a.y} – ${b.d} ${months[b.m]} ${b.y}`;
}

export function describeEventForPreview(input: { name: string; start: string; end: string; location: string; society: string }) {
  const parts = [describeDates(input.start, input.end), input.location].filter(Boolean);
  const line = parts.join(" · ");
  const host = input.society ? `Hosted by ${input.society}` : "";
  return [line, host].filter(Boolean).join(". ") || "See what is happening, register and follow updates.";
}
