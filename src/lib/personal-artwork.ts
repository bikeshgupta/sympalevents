/**
 * The picture a personal event shows before its host uploads one: a warm, dark gradient and one motif per kind
 * (a cake, two rings, string lights, diyas, a garland, balloons), drawn as SVG so nothing is fetched and there is
 * no photograph to license or host. The same approach as hero-artwork.ts for society events.
 *
 * Two places crop it differently - a square thumbnail on a card, a wide cover behind the title - so the motif
 * sits a little right of centre (still inside a square crop) and the left stays dark enough for white text.
 *
 * Pure and import-free (tests/personal-artwork.test.mjs). The colours here are artwork, like hero-artwork.ts;
 * the interface around it still uses the semantic tokens.
 */

type Palette = { stops: [string, string, string]; glow: string; ink: string };

const palettes: Record<string, Palette> = {
  birthday: { stops: ["#2a1022", "#7a2442", "#d9774a"], glow: "#ffcf7a", ink: "#ffe6c4" },
  anniversary: { stops: ["#141a3d", "#3d3577", "#b0647e"], glow: "#ffd9b8", ink: "#ffe9d6" },
  get_together: { stops: ["#0c2a26", "#1d5b5e", "#c98a3c"], glow: "#ffd58a", ink: "#fff0cf" },
  festival: { stops: ["#2a0f0a", "#7a2c12", "#e0912c"], glow: "#ffbe55", ink: "#ffe3a8" },
  wedding: { stops: ["#2b0f1a", "#86304a", "#e7a05a"], glow: "#ffd2a0", ink: "#ffe7cf" },
  baby_shower: { stops: ["#10283a", "#2f6380", "#d79a7c"], glow: "#ffe0c2", ink: "#fff1e4" },
  naming: { stops: ["#151a36", "#38407a", "#c98f6a"], glow: "#ffe3b8", ink: "#fff1dc" },
  other: { stops: ["#1a1f2c", "#3a3550", "#b07a52"], glow: "#ffd9a0", ink: "#fff0dc" },
};

const r1 = (value: number) => Math.round(value * 10) / 10;

/** Dots from a fixed sequence, so the artwork never changes between renders. */
function sparkle(color: string, count: number, seed: number) {
  let value = seed;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const x = 250 + next() * 550;
    const y = next() * 500;
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1.5 + next() * 3.5)}" fill="${color}" fill-opacity="${r1(0.2 + next() * 0.45)}"/>`;
  }).join("");
}

function balloon(x: number, y: number, fill: string, ink: string) {
  return (
    `<ellipse cx="${x}" cy="${y}" rx="34" ry="42" fill="${fill}" fill-opacity=".85"/>` +
    `<ellipse cx="${x - 11}" cy="${y - 14}" rx="7" ry="11" fill="#fff" fill-opacity=".35"/>` +
    `<path d="M${x} ${y + 42} q -10 40 6 80 t -4 70" fill="none" stroke="${ink}" stroke-opacity=".5" stroke-width="2"/>`
  );
}

function flame(x: number, y: number, size: number) {
  return (
    `<path d="M${x} ${y - size * 2.2} C ${x + size} ${y - size}, ${x + size * 0.8} ${y}, ${x} ${y} C ${x - size * 0.8} ${y}, ${x - size} ${y - size}, ${x} ${y - size * 2.2} Z" fill="#ffd36b"/>` +
    `<path d="M${x} ${y - size * 1.3} C ${x + size * 0.45} ${y - size * 0.6}, ${x + size * 0.35} ${y}, ${x} ${y} C ${x - size * 0.35} ${y}, ${x - size * 0.45} ${y - size * 0.6}, ${x} ${y - size * 1.3} Z" fill="#fff6d8"/>`
  );
}

function lights(ink: string) {
  const bulbs = Array.from({ length: 12 }, (_, i) => {
    const x = 220 + i * 50;
    const y = 40 + Math.sin(i / 1.8) * 22 + 20;
    return `<circle cx="${x}" cy="${r1(y)}" r="7" fill="${["#ffd36b", "#ffb36b", "#fff1c2"][i % 3]}" fill-opacity=".9"/><circle cx="${x}" cy="${r1(y)}" r="18" fill="#ffd36b" fill-opacity=".14"/>`;
  }).join("");
  return `<path d="M200 50 Q 480 120 800 40" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="2"/>` + bulbs;
}

const motifs: Record<string, (p: Palette) => string> = {
  birthday: (p) =>
    balloon(660, 150, "#ef6f8e", p.ink) +
    balloon(730, 110, "#ffc15e", p.ink) +
    balloon(600, 95, "#7fc8c2", p.ink) +
    // a two-tier cake
    `<rect x="430" y="330" width="220" height="90" rx="14" fill="${p.ink}" fill-opacity=".92"/>` +
    `<rect x="470" y="270" width="140" height="66" rx="12" fill="${p.ink}" fill-opacity=".8"/>` +
    `<path d="M430 352 q 27 18 55 0 t 55 0 t 55 0 t 55 0" fill="none" stroke="#ef6f8e" stroke-opacity=".7" stroke-width="6"/>` +
    [500, 540, 580].map((x) => `<rect x="${x - 4}" y="236" width="8" height="34" rx="3" fill="#ffffff" fill-opacity=".85"/>` + flame(x, 236, 9)).join("") +
    `<rect x="400" y="420" width="280" height="10" rx="5" fill="${p.ink}" fill-opacity=".45"/>`,
  anniversary: (p) =>
    `<circle cx="520" cy="270" r="78" fill="none" stroke="${p.ink}" stroke-opacity=".9" stroke-width="16"/>` +
    `<circle cx="615" cy="270" r="78" fill="none" stroke="#ffd36b" stroke-opacity=".85" stroke-width="16"/>` +
    `<path d="M615 170 l 18 -26 h 30 l 14 20 l -32 34 z" fill="#ffffff" fill-opacity=".8"/>` +
    [[420, 140], [720, 380], [690, 120]]
      .map(([x, y]) => `<path d="M${x} ${y + 14} c -22 -16 -22 -36 -6 -40 c 8 -2 6 6 6 6 c 0 0 -2 -8 6 -6 c 16 4 16 24 -6 40 z" fill="#ef8fa6" fill-opacity=".7"/>`)
      .join(""),
  get_together: (p) =>
    lights(p.ink) +
    // three glasses raised together
    [[480, -14], [570, 0], [660, 14]]
      .map(
        ([x, tilt]) =>
          `<g transform="rotate(${tilt} ${x} 330)"><path d="M${x - 30} 220 h 60 l -8 90 a 22 22 0 0 1 -44 0 z" fill="${p.ink}" fill-opacity=".85"/><path d="M${x - 26} 250 h 52 l -5 58 a 21 21 0 0 1 -42 0 z" fill="#ffc15e" fill-opacity=".85"/><rect x="${x - 3}" y="330" width="6" height="70" fill="${p.ink}" fill-opacity=".8"/><rect x="${x - 26}" y="398" width="52" height="8" rx="4" fill="${p.ink}" fill-opacity=".8"/></g>`,
      )
      .join(""),
  festival: (p) =>
    lights(p.ink) +
    [440, 540, 640, 740]
      .map((x, i) => {
        const y = 360 + (i % 2) * 24;
        return `<path d="M${x - 46} ${y} q 46 52 92 0 z" fill="#c2552a"/><path d="M${x - 46} ${y} h 92" stroke="${p.ink}" stroke-opacity=".7" stroke-width="4"/>` + flame(x, y - 4, 16) + `<circle cx="${x}" cy="${y - 20}" r="44" fill="#ffc15e" fill-opacity=".14"/>`;
      })
      .join(""),
  wedding: (p) =>
    // a garland arch of marigolds and a pair of hearts
    Array.from({ length: 19 }, (_, i) => {
      const a = Math.PI - (Math.PI * i) / 18;
      const x = 580 + Math.cos(a) * 190;
      const y = 330 - Math.sin(a) * 210;
      return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${i % 2 ? 15 : 19}" fill="${i % 3 === 0 ? "#ffd36b" : "#f2994a"}" fill-opacity=".9"/>`;
    }).join("") +
    [390, 770].map((x) => `<rect x="${x - 6}" y="330" width="12" height="150" rx="6" fill="${p.ink}" fill-opacity=".5"/>`).join("") +
    `<path d="M580 330 c -36 -28 -36 -64 -8 -70 c 14 -3 8 10 8 10 c 0 0 -6 -13 8 -10 c 28 6 28 42 -8 70 z" fill="#ef8fa6" fill-opacity=".85"/>`,
  baby_shower: (p) =>
    balloon(470, 170, "#9fd3e8", p.ink) +
    balloon(560, 130, "#f7c6d0", p.ink) +
    balloon(650, 180, "#fbe3a8", p.ink) +
    // a cloud and a crescent
    `<path d="M430 400 a 50 50 0 0 1 80 -40 a 60 60 0 0 1 110 10 a 44 44 0 0 1 40 70 h -220 a 36 36 0 0 1 -10 -40 z" fill="${p.ink}" fill-opacity=".85"/>` +
    `<path d="M720 80 a 46 46 0 1 0 40 72 a 36 36 0 1 1 -40 -72 z" fill="#ffe3a8" fill-opacity=".85"/>`,
  naming: (p) =>
    `<path d="M600 120 a 92 92 0 1 0 80 140 a 72 72 0 1 1 -80 -140 z" fill="#ffe3a8" fill-opacity=".85"/>` +
    [[470, 140, 14], [720, 320, 10], [520, 360, 9], [430, 260, 7]]
      .map(([x, y, s]) => `<path d="M${x} ${y - s * 2} L ${x + s * 0.6} ${y - s * 0.6} L ${x + s * 2} ${y} L ${x + s * 0.6} ${y + s * 0.6} L ${x} ${y + s * 2} L ${x - s * 0.6} ${y + s * 0.6} L ${x - s * 2} ${y} L ${x - s * 0.6} ${y - s * 0.6} Z" fill="${p.ink}" fill-opacity=".85"/>`)
      .join(""),
  other: (p) =>
    Array.from({ length: 26 }, (_, i) => {
      const x = 330 + ((i * 97) % 460);
      const y = 40 + ((i * 61) % 420);
      return `<rect x="${x}" y="${y}" width="16" height="8" rx="3" transform="rotate(${(i * 37) % 180} ${x} ${y})" fill="${["#ffd36b", "#ef8fa6", "#7fc8c2", p.ink][i % 4]}" fill-opacity=".75"/>`;
    }).join(""),
};

export function personalArtworkSvg(kind: string) {
  const palette = palettes[kind] ?? palettes.other;
  const motif = (motifs[kind] ?? motifs.other)(palette);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.stops[0]}"/><stop offset=".6" stop-color="${palette.stops[1]}"/><stop offset="1" stop-color="${palette.stops[2]}"/></linearGradient>` +
    `<radialGradient id="o" cx=".7" cy=".5" r=".55"><stop offset="0" stop-color="${palette.glow}" stop-opacity=".45"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="800" height="500" fill="url(#g)"/><rect width="800" height="500" fill="url(#o)"/>` +
    sparkle(palette.ink, 28, kind.length * 7 + 3) +
    motif +
    `</svg>`
  );
}

const cache = new Map<string, string>();

/** The artwork as a data URL, for an `<img src>` or a CSS background. Built once per kind. */
export function personalArtworkUrl(kind: string) {
  const key = palettes[kind] ? kind : "other";
  let url = cache.get(key);
  if (!url) {
    url = `data:image/svg+xml;utf8,${encodeURIComponent(personalArtworkSvg(key))}`;
    cache.set(key, url);
  }
  return url;
}
