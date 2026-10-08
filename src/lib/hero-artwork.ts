/**
 * What an event's hero looks like before anybody has uploaded a photograph.
 *
 * It used to be one bundled photograph of a Ganesh pandal for every event, so a
 * Garba night or a badminton league opened on an idol. Each kind of event now
 * has artwork of its own: a deep gradient and one motif, drawn as an SVG so
 * nothing is fetched and there is no image to license, host or keep in step
 * with the colours.
 *
 * ## Which one an event gets
 *
 * `events.template_key` (024) is the template it was made from - "garba" and
 * "cultural" are both `event_type: cultural` but are different evenings - so it
 * is tried first, then the type, then the neutral one.
 *
 * ## The one exception, and why
 *
 * An event with **no** template key and the type `festival` is one that existed
 * before templates did: the Ganesh Chaturthi this app was built for. Its hero
 * has always been that photograph, and it is production data being read by real
 * people, so `usesBundledPhoto()` keeps it. Everything made from a template -
 * including a new Festival - gets generated artwork instead.
 *
 * ## Legibility
 *
 * The hero prints white text over a scrim weighted to the left edge (see
 * event-hero.tsx). Every gradient here is dark at its left and the motif sits on
 * the right, so the words land on the quiet side and the 4.5:1 floor holds
 * without dimming anything further. A new piece of artwork has to keep both.
 *
 * A plain `.ts` module: the society page and the dashboard hero both read it,
 * and neither should import the other's components.
 */

export type ArtworkKey = "garba" | "festival" | "sports" | "cultural" | "mixed" | "custom";

const artworkKeys = new Set<string>(["garba", "festival", "sports", "cultural", "mixed", "custom"]);

type EventIdentity = { templateKey?: string | null; eventType?: string | null };

export function artworkKeyFor({ templateKey, eventType }: EventIdentity): ArtworkKey {
  if (templateKey && artworkKeys.has(templateKey)) return templateKey as ArtworkKey;
  // "blank" is the Start-blank template; it is the neutral artwork.
  if (eventType && artworkKeys.has(eventType)) return eventType as ArtworkKey;
  return "custom";
}

/** True for the pre-template festival the bundled photograph was made for. */
export function usesBundledPhoto({ templateKey, eventType }: EventIdentity) {
  return !templateKey && (eventType ?? "festival") === "festival";
}

/** `n` points evenly around a circle, as `[x, y, angleInDegrees]`. */
function around(cx: number, cy: number, r: number, n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const angle = offset + (360 / n) * i;
    const rad = (angle * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad), angle] as const;
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

function frame(stops: [string, string, string], body: string, glow = "#ffd27a") {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${stops[0]}"/><stop offset=".55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/>` +
    `</linearGradient>` +
    `<radialGradient id="o" cx=".8" cy=".45" r=".5"><stop offset="0" stop-color="${glow}" stop-opacity=".5"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="1600" height="700" fill="url(#g)"/><rect width="1600" height="700" fill="url(#o)"/>` +
    body +
    `</svg>`
  );
}

/** A mandala: rings, a ring of petals, and a ring of dots. */
function mandala(cx: number, cy: number, tint: string) {
  const rings = [70, 130, 200, 280]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tint}" stroke-opacity="${0.4 - i * 0.07}" stroke-width="${i % 2 ? 2 : 3}"${i === 2 ? ' stroke-dasharray="3 12"' : ""}/>`)
    .join("");
  const petals = around(cx, cy, 165, 16)
    .map(([x, y, a]) => `<ellipse cx="${round(x)}" cy="${round(y)}" rx="14" ry="42" transform="rotate(${round(a + 90)} ${round(x)} ${round(y)})" fill="${tint}" fill-opacity=".28"/>`)
    .join("");
  const dots = around(cx, cy, 240, 32, 5)
    .map(([x, y]) => `<circle cx="${round(x)}" cy="${round(y)}" r="5" fill="${tint}" fill-opacity=".55"/>`)
    .join("");
  return rings + petals + dots;
}

/** Evenly scattered dots, from a fixed sequence so the artwork never changes. */
function scatter(color: string, count: number, seed: number, x0 = 0, x1 = 1600) {
  let value = seed;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const x = x0 + next() * (x1 - x0);
    const y = next() * 700;
    const r = 2 + next() * 5;
    return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}" fill="${color}" fill-opacity="${round(0.25 + next() * 0.4)}"/>`;
  }).join("");
}

const sources: Record<ArtworkKey, () => string> = {
  // Concentric mandala with two crossed dandiya sticks, in indigo into magenta
  // into ember - the colours of a Navratri night.
  garba: () =>
    frame(
      ["#1f0f52", "#7d2470", "#d2603a"],
      mandala(1240, 340, "#ffd9a0") +
        `<g transform="translate(1240 340)" fill="#ffe3b0" fill-opacity=".55">` +
        `<rect x="-14" y="-190" width="28" height="380" rx="14" transform="rotate(38)"/>` +
        `<rect x="-14" y="-190" width="28" height="380" rx="14" transform="rotate(-38)"/>` +
        `</g>` +
        scatter("#ffd27a", 40, 7, 700),
    ),

  // Marigold and maroon, with a rangoli of petals and a string of marigolds
  // hung along the top: toran, the doorway garland.
  festival: () =>
    frame(
      ["#4a1620", "#a4441f", "#e39a2b"],
      mandala(1260, 350, "#ffe2a3") +
        Array.from({ length: 22 }, (_, i) => `<circle cx="${60 + i * 74}" cy="${14 + (i % 2) * 22}" r="${i % 2 ? 11 : 15}" fill="#ffc247" fill-opacity=".7"/>`).join("") +
        scatter("#ffe2a3", 26, 11, 800),
      "#ffb84d",
    ),

  // Track lanes bending round the right-hand side, a ball, and diagonal
  // floodlight beams: a ground at night.
  sports: () =>
    frame(
      ["#052f3a", "#0b6358", "#27a56f"],
      [150, 215, 280, 345, 410]
        .map((r, i) => `<ellipse cx="1330" cy="460" rx="${r * 1.55}" ry="${r}" fill="none" stroke="#e9fff4" stroke-opacity="${0.42 - i * 0.05}" stroke-width="3"/>`)
        .join("") +
        `<circle cx="1180" cy="190" r="62" fill="#f4fff9" fill-opacity=".85"/>` +
        around(1180, 190, 38, 5, -90)
          .map(([x, y]) => `<circle cx="${round(x)}" cy="${round(y)}" r="9" fill="#0b6358" fill-opacity=".55"/>`)
          .join("") +
        `<circle cx="1180" cy="190" r="12" fill="#0b6358" fill-opacity=".6"/>` +
        [700, 860, 1020]
          .map((x) => `<polygon points="${x},0 ${x + 90},0 ${x + 330},700 ${x + 130},700" fill="#e9fff4" fill-opacity=".06"/>`)
          .join(""),
      "#9bf0c2",
    ),

  // Stage lights and curtain arcs over a music staff, indigo into rose.
  cultural: () =>
    frame(
      ["#161a4a", "#4a2a8c", "#c0488a"],
      [820, 1040, 1260]
        .map((x) => `<polygon points="${x},0 ${x + 40},0 ${x + 260},700 ${x - 220},700" fill="#fff" fill-opacity=".07"/>`)
        .join("") +
        [560, 600, 640, 680, 720]
          .map((y, i) => `<path d="M700 ${y - 360} C 900 ${y - 420 + i * 6}, 1100 ${y - 300}, 1600 ${y - 380}" fill="none" stroke="#ffd3ec" stroke-opacity=".3" stroke-width="2"/>`)
          .join("") +
        around(1330, 330, 150, 12)
          .map(([x, y]) => `<circle cx="${round(x)}" cy="${round(y)}" r="16" fill="#ffd3ec" fill-opacity=".32"/>`)
          .join("") +
        `<circle cx="1330" cy="330" r="64" fill="#ffd3ec" fill-opacity=".4"/>` +
        scatter("#ffd3ec", 36, 5, 600),
      "#ffd3ec",
    ),

  // Bunting across the top and confetti: a society-wide celebration.
  mixed: () =>
    frame(
      ["#0e335f", "#2b68ad", "#ef9f47"],
      Array.from({ length: 16 }, (_, i) => {
        const x = 40 + i * 100;
        const colour = ["#ffd166", "#ef476f", "#06d6a0", "#ffffff"][i % 4];
        return `<polygon points="${x},0 ${x + 80},0 ${x + 40},${70 + (i % 3) * 14}" fill="${colour}" fill-opacity=".55"/>`;
      }).join("") +
        mandala(1250, 400, "#ffe9c2") +
        scatter("#ffffff", 44, 3, 650),
      "#ffd9a0",
    ),

  // Quiet and neutral: a grid of dots on slate.
  custom: () =>
    frame(
      ["#1c2432", "#2c3646", "#46526a"],
      Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 22 }, (_, col) => `<circle cx="${60 + col * 74}" cy="${50 + row * 56}" r="3" fill="#ffffff" fill-opacity="${col > 11 ? 0.22 : 0.08}"/>`).join(""),
      ).join(""),
      "#c7d2e8",
    ),
};

const cache = new Map<ArtworkKey, string>();

/** The artwork as a CSS `url(...)` value. Built once per key. */
export function heroArtworkUrl(key: ArtworkKey) {
  let url = cache.get(key);
  if (!url) {
    url = `url("data:image/svg+xml;utf8,${encodeURIComponent(sources[key]())}")`;
    cache.set(key, url);
  }
  return url;
}
