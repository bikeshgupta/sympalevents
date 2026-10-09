import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `?resource=<name>` the browser calls must be routed by some function under api/.
 *
 * `/api/events` falls through to "create an event" (POST only) for a resource it does not
 * recognise, so a dropped branch shows up in the app as "Method not allowed" on an unrelated
 * save - that is how Settings -> Event details broke. This keeps that from happening quietly.
 */

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const clientSource = walk("src").filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
const apiSource = readdirSync("api").filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join("api", f), "utf8")).join("\n");

test("every resource the app calls is handled by an api route", () => {
  const called = [...new Set([...clientSource.matchAll(/resource=([a-z][a-z-]*)/g)].map((m) => m[1]))];
  assert.ok(called.length > 20, "found the calls");
  const missing = called.filter((name) => !apiSource.includes(`"${name}"`));
  assert.deepEqual(missing, [], `no api route handles: ${missing.join(", ")}`);
});
