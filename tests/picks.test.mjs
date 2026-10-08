import test from "node:test";
import assert from "node:assert/strict";
import { itemKey, pickEntries } from "../src/lib/picks.ts";
import { buildIcs } from "../src/lib/calendar.ts";

const items = [
  { id: "a", date: "2026-10-17", activity: "Garba", startTime: "19:00", endTime: "21:00", location: "Lawn" },
  { date: "2026-10-17", activity: "Prize giving", startTime: "21:30", endTime: "", location: "" },
  { id: "c", date: "2026-10-17", activity: "Aarti", startTime: "", endTime: "", location: "" },
];

test("a row with no id is keyed by what a person sees", () => {
  assert.equal(itemKey(items[1]), "2026-10-17|Prize giving");
  assert.equal(itemKey(items[0]), "a");
});

test("only the starred items become reminders, each with an alert", () => {
  const entries = pickEntries(items, ["a", "2026-10-17|Prize giving"], "Garba Night");
  assert.deepEqual(entries.map((e) => e.title), ["Garba · Garba Night", "Prize giving · Garba Night"]);
  const ics = buildIcs(entries, new Date("2026-10-08T00:00:00Z"));
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 2);
  assert.ok(ics.includes("TRIGGER:-PT15M"));
});

test("a starred item with no time is an all-day entry and carries no alert", () => {
  const ics = buildIcs(pickEntries(items, ["c"], "Garba Night"), new Date("2026-10-08T00:00:00Z"));
  assert.ok(!ics.includes("VALARM"));
});

test("nothing starred, nothing exported", () => assert.deepEqual(pickEntries(items, [], "x"), []));
