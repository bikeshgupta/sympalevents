/**
 * A QR code encoder, written out rather than imported.
 *
 * The gate needs a scannable pass and the app has no QR dependency; the UI
 * rules say to ask before adding one, and the same call was made for the
 * spreadsheet writer (`src/lib/xlsx.ts`). A pass is one short opaque token, so
 * this covers exactly that: **byte mode, error-correction level M, versions
 * 1-10** (up to 213 bytes). Anything longer throws rather than silently
 * truncating - a pass that scans as something else is worse than none.
 *
 * It follows ISO/IEC 18004: Reed-Solomon over GF(256) with the 0x11D
 * polynomial, the eight data masks scored by the four standard penalty rules,
 * format information for level M and (from version 7) version information.
 * It is checked by decoding its own output with an independent decoder - see
 * tests/qr.test.mjs.
 *
 * Level M is the right trade for a phone screen shown to another phone: it
 * survives a scuffed or glared display (15% damage) and still fits a 40-byte
 * token in a 29x29 symbol that scans fast.
 */

// Level M: [total codewords, ec codewords per block, [blocks, data codewords] groups]
const VERSIONS: { total: number; ec: number; groups: [number, number][] }[] = [
  { total: 26, ec: 10, groups: [[1, 16]] },
  { total: 44, ec: 16, groups: [[1, 28]] },
  { total: 70, ec: 26, groups: [[1, 44]] },
  { total: 100, ec: 18, groups: [[2, 32]] },
  { total: 134, ec: 24, groups: [[2, 43]] },
  { total: 172, ec: 16, groups: [[4, 27]] },
  { total: 196, ec: 18, groups: [[4, 31]] },
  { total: 242, ec: 22, groups: [[2, 38], [2, 39]] },
  { total: 292, ec: 22, groups: [[3, 36], [2, 37]] },
  { total: 346, ec: 26, groups: [[4, 43], [1, 44]] },
];

const ALIGNMENT: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const dataCodewords = (v: number) => VERSIONS[v - 1].groups.reduce((sum, [blocks, size]) => sum + blocks * size, 0);

// ---- Reed-Solomon over GF(256) ------------------------------------------------

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(degree: number) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    poly.forEach((coefficient, j) => {
      next[j] ^= coefficient;
      next[j + 1] ^= mul(coefficient, EXP[i]);
    });
    poly = next;
  }
  return poly;
}

function remainder(data: number[], degree: number) {
  const gen = generator(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= mul(gen[i + 1], factor);
  }
  return result;
}

// ---- Bits ----------------------------------------------------------------------

function formatBits(mask: number) {
  // Level M is 0b00; the mask follows it. 15 bits, BCH(15,5), XOR 0x5412.
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i -= 1) if (rem & (1 << (i + 10))) rem ^= 0x537 << i;
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number) {
  // 18 bits, BCH(18,6) with generator 0x1F25.
  let rem = version << 12;
  for (let i = 5; i >= 0; i -= 1) if (rem & (1 << (i + 12))) rem ^= 0x1f25 << i;
  return (version << 12) | rem;
}

// ---- Matrix ----------------------------------------------------------------------

type Grid = { size: number; dark: boolean[][]; reserved: boolean[][] };

function emptyGrid(version: number): Grid {
  const size = 17 + 4 * version;
  return {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunction(grid: Grid, x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return;
  grid.dark[y][x] = dark;
  grid.reserved[y][x] = true;
}

function finder(grid: Grid, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(grid, cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
}

function alignment(grid: Grid, cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const { size } = grid;
  for (let i = 0; i < size; i += 1) {
    setFunction(grid, 6, i, i % 2 === 0);
    setFunction(grid, i, 6, i % 2 === 0);
  }
  finder(grid, 3, 3);
  finder(grid, size - 4, 3);
  finder(grid, 3, size - 4);

  const centres = ALIGNMENT[version - 1];
  centres.forEach((cy, i) =>
    centres.forEach((cx, j) => {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === centres.length - 1) || (i === centres.length - 1 && j === 0);
      if (!onFinder) alignment(grid, cx, cy);
    }),
  );

  // Reserve the format areas (written once the mask is known) and the dark module.
  for (let i = 0; i < 9; i += 1) {
    grid.reserved[8][i] = true;
    grid.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    grid.reserved[8][size - 1 - i] = true;
    grid.reserved[size - 1 - i][8] = true;
  }
  setFunction(grid, 8, size - 8, true);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(grid, a, b, dark);
      setFunction(grid, b, a, dark);
    }
  }
}

function drawFormat(grid: Grid, mask: number) {
  const bits = formatBits(mask);
  const { size } = grid;
  const bit = (i: number) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) grid.dark[i][8] = bit(i);
  grid.dark[7][8] = bit(6);
  grid.dark[8][8] = bit(7);
  grid.dark[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) grid.dark[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) grid.dark[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) grid.dark[size - 15 + i][8] = bit(i);
  grid.dark[size - 8][8] = true;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function placeData(grid: Grid, bits: number[]) {
  const { size } = grid;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!grid.reserved[y][x] && index < bits.length) {
          grid.dark[y][x] = bits[index] === 1;
          index += 1;
        }
      }
    }
  }
}

function penalty(dark: boolean[][]) {
  const size = dark.length;
  let score = 0;

  // Rule 1: runs of five or more of one colour, in rows and columns.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        const same = (pass === 0 ? dark[a][b] === dark[a][b - 1] : dark[b][a] === dark[b - 1][a]);
        if (same) run += 1;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      if (dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
  const pattern = [true, false, true, true, true, false, true];
  for (let pass = 0; pass < 2; pass += 1) {
    for (let a = 0; a < size; a += 1) {
      for (let b = 0; b + 7 <= size; b += 1) {
        const at = (k: number) => (pass === 0 ? dark[a][b + k] : dark[b + k][a]);
        if (!pattern.every((value, k) => at(k) === value)) continue;
        const lightBefore = [1, 2, 3, 4].every((k) => b - k < 0 || !(pass === 0 ? dark[a][b - k] : dark[b - k][a]));
        const lightAfter = [0, 1, 2, 3].every((k) => b + 7 + k >= size || !(pass === 0 ? dark[a][b + 7 + k] : dark[b + 7 + k][a]));
        if (lightBefore || lightAfter) score += 40;
      }
    }
  }

  // Rule 4: how far the proportion of dark modules strays from half.
  const total = size * size;
  const darkCount = dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((darkCount * 100) / total - 50) / 5) * 10;
  return score;
}

/** The symbol for `text`, as rows of dark (true) and light (false) modules. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  let version = 0;
  for (let v = 1; v <= VERSIONS.length; v += 1) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(v) * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error("That is too long to put in a QR code");

  // Data bits: mode (0100 = bytes), the length, the bytes, a terminator, padding.
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // Split into blocks, add each block's error correction, then interleave.
  const spec = VERSIONS[version - 1];
  const blocks: { data: number[]; ec: number[] }[] = [];
  let cursor = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i += 1) {
      const data = codewords.slice(cursor, cursor + size);
      cursor += size;
      blocks.push({ data, ec: remainder(data, spec.ec) });
    }
  }
  const interleaved: number[] = [];
  const longest = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < longest; i += 1) blocks.forEach((block) => i < block.data.length && interleaved.push(block.data[i]));
  for (let i = 0; i < spec.ec; i += 1) blocks.forEach((block) => interleaved.push(block.ec[i]));

  const stream: number[] = [];
  interleaved.forEach((byte) => push2(stream, byte));
  // Remainder bits: seven for versions 2-6, none otherwise.
  for (let i = 0; i < (version >= 2 && version <= 6 ? 7 : 0); i += 1) stream.push(0);

  // Draw once, then try every mask on a copy and keep the one that scores lowest.
  const base = emptyGrid(version);
  drawFunctionPatterns(base, version);
  placeData(base, stream);

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate: Grid = {
      size: base.size,
      reserved: base.reserved,
      dark: base.dark.map((row) => [...row]),
    };
    for (let y = 0; y < candidate.size; y += 1) {
      for (let x = 0; x < candidate.size; x += 1) {
        if (!candidate.reserved[y][x] && MASKS[mask](x, y)) candidate.dark[y][x] = !candidate.dark[y][x];
      }
    }
    drawFormat(candidate, mask);
    const score = penalty(candidate.dark);
    if (score < bestScore) {
      bestScore = score;
      best = candidate.dark;
    }
  }
  return best as boolean[][];
}

function push2(stream: number[], byte: number) {
  for (let i = 7; i >= 0; i -= 1) stream.push((byte >> i) & 1);
}

/**
 * The symbol as an SVG string: one path of dark squares on a white quiet zone.
 *
 * Square, high-contrast black on white whatever the event's colour theme -
 * a themed or inverted code is a code that some scanners will not read - and
 * with the four-module quiet zone the standard asks for, because a pass is
 * held up against a busy lanyard, a screen edge or a hand.
 */
export function qrSvg(text: string, options: { margin?: number; label?: string } = {}) {
  const matrix = qrMatrix(text);
  const margin = options.margin ?? 4;
  const size = matrix.length + margin * 2;
  let path = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }),
  );
  const label = (options.label ?? "QR code").replace(/[<>&"]/g, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
