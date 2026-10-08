import test from "node:test";
import assert from "node:assert/strict";
import { cleanContact, cleanNote, cleanPerformanceDetails, placesLeft } from "../shared/opportunities.ts";

test("a performance entry is shaped, not trusted", () => {
  const d = cleanPerformanceDetails({ act: "  Group   dance ", minutes: "7.4", performers: "x".repeat(400), extra: "<script>" });
  assert.equal(d.act, "Group dance");
  assert.equal(d.minutes, 7);
  assert.equal(d.performers.length, 200);
  assert.ok(!("extra" in d));
  assert.equal(cleanPerformanceDetails({ minutes: 500 }).minutes, null);
  assert.deepEqual(cleanPerformanceDetails("nonsense"), { act: "", minutes: null, performers: "" });
});

test("a contact column only ever holds something dialable", () => {
  assert.equal(cleanContact("+91 98765-43210 <b>"), "+91 98765-43210");
  assert.equal(cleanContact("call me;drop"), "");
});

test("notes are capped", () => assert.equal(cleanNote("a".repeat(900)).length, 500));

test("places left: volunteers count confirmed, performers count requests too", () => {
  assert.deepEqual(placesLeft("volunteer", 4, 3, 5), { taken: 3, left: 1, full: false });
  assert.deepEqual(placesLeft("performance", 4, 1, 3), { taken: 4, left: 0, full: true });
  assert.deepEqual(placesLeft("volunteer", null, 9, 0), { taken: 9, left: null, full: false });
});
