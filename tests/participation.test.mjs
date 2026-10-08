import test from "node:test";
import assert from "node:assert/strict";
import { blockOf, groupByBlock } from "../shared/participation.ts";

test("blocks are read from the way flats are written", () => {
  assert.equal(blockOf("D104"), "D");
  assert.equal(blockOf("b-402"), "B");
  assert.equal(blockOf("Tower C 12"), "C");
  assert.equal(blockOf("402-B"), "B");
  assert.equal(blockOf("1204"), null);
  assert.equal(blockOf(""), null);
});

test("a block under three households is never named", () => {
  const flats = ["A101", "A102", "A103", "A104", "B201", "B202", "C301"];
  // B and C are small; together they clear the floor as "Other", singly they would not.
  assert.deepEqual(groupByBlock(flats), [{ block: "A", households: 4 }, { block: "Other", households: 3 }]);
  assert.deepEqual(groupByBlock(["A101", "A102", "A103", "A104", "B201", "C301"]), [{ block: "A", households: 4 }]);
});

test("small blocks fold into Other, which only shows once it clears the floor", () => {
  const flats = ["A1", "A2", "A3", "B1", "B2", "C1", "D1", "99"];
  const out = groupByBlock(flats);
  assert.deepEqual(out, [{ block: "A", households: 3 }, { block: "Other", households: 5 }]);
});

test("ordering is largest first, ties alphabetical", () => {
  const flats = ["B1", "B2", "B3", "A1", "A2", "A3", "C1", "C2", "C3", "C4"];
  assert.deepEqual(groupByBlock(flats).map((b) => b.block), ["C", "A", "B"]);
});
