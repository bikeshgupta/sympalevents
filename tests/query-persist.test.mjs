import test from "node:test";
import assert from "node:assert/strict";
import { readStored, selectPersistable } from "../src/lib/query-persist.ts";

const q = (key, data, status = "success") => ({ queryKey: key, state: { status, data, dataUpdatedAt: 1000 } });

test("only the identity-and-access reads are kept, and never demo data", () => {
  const kept = selectPersistable([
    q(["session"], { user: { id: "u" } }),
    q(["event-data", "e1", { includeTasks: true }, "u1"], { source: "supabase" }),
    q(["event-data", "e1", { includeTasks: true }, "guest"], { source: "demo" }),
    q(["expenses", "e1", "u1"], { expenses: [] }),
    q(["registration", "e1"], { mine: {} }),
    q(["profile", "u1"], { profile: { phone: "9" } }),
    q(["my-events", "u1"], { events: [] }, "pending"),
  ]);
  assert.deepEqual(kept.map((x) => x.queryKey[0]), ["session", "event-data"]);
  assert.equal(kept[1].data.source, "supabase");
});

test("a stored copy is used only for the same build and within a day", () => {
  const now = 10_000_000;
  const stored = JSON.stringify({ build: "b1", savedAt: now - 1000, queries: [{ queryKey: ["session"], data: {}, updatedAt: 1 }] });
  assert.equal(readStored(stored, "b1", now).length, 1);
  assert.equal(readStored(stored, "b2", now).length, 0, "a new deploy discards it");
  assert.equal(readStored(stored, "b1", now + 25 * 3600 * 1000).length, 0, "expired");
  assert.equal(readStored("not json", "b1", now).length, 0);
  assert.equal(readStored(null, "b1", now).length, 0);
});

test("a hand-edited store cannot restore a key that is not on the list", () => {
  const raw = JSON.stringify({ build: "b", savedAt: 1, queries: [{ queryKey: ["expenses", "e"], data: {}, updatedAt: 1 }, { queryKey: ["session"], data: {}, updatedAt: 1 }] });
  assert.deepEqual(readStored(raw, "b", 2).map((x) => x.queryKey[0]), ["session"]);
});
