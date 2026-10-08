/**
 * Who has joined, by tower - the number a resident compares their own block to.
 *
 * Shared by the API (which computes it) and the tests; no imports, so either can
 * load it.
 *
 * ## Privacy: nothing smaller than three households is ever named
 *
 * A block with one registration would say "A: 1" - which, on a public page,
 * tells the whole society that exactly one household in A has signed up, and
 * with a flat number elsewhere it is one guess from naming them. So a block
 * counts only when at least `MIN_GROUP` households are in it; the smaller ones
 * are folded into "Other", and if that is still smaller than the floor it is
 * left out rather than shown. The total is reported separately and is unaffected.
 * It is the same floor aggregate reports use, and it is cheap.
 */

export const MIN_GROUP = 3;

/** "D-104" / "d104" / "Tower B 201" -> "D" / "D" / "B". A flat with no letter prefix has none. */
export function blockOf(flat: string): string | null {
  const text = String(flat ?? "").trim();
  const prefixed = text.match(/^(?:tower|block|wing)?\s*([A-Za-z]{1,3})\s*[-/ ]?\s*\d/i);
  if (prefixed) return prefixed[1].toUpperCase();
  const suffixed = text.match(/^\d+\s*[-/ ]?\s*([A-Za-z]{1,3})$/);
  return suffixed ? suffixed[1].toUpperCase() : null;
}

export type BlockCount = { block: string; households: number };

export function groupByBlock(flats: string[], minGroup = MIN_GROUP): BlockCount[] {
  const counts = new Map<string, number>();
  let other = 0;
  for (const flat of flats) {
    const block = blockOf(flat);
    if (block) counts.set(block, (counts.get(block) ?? 0) + 1);
    else other += 1;
  }
  const out: BlockCount[] = [];
  for (const [block, households] of counts) {
    if (households >= minGroup) out.push({ block, households });
    else other += households;
  }
  out.sort((a, b) => b.households - a.households || a.block.localeCompare(b.block));
  if (other >= minGroup) out.push({ block: "Other", households: other });
  return out;
}
