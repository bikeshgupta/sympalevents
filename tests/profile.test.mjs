import test from "node:test";
import assert from "node:assert/strict";
import { cleanDisplayName, cleanProfileFlat, cleanProfilePhone, isOwnAvatarUrl } from "../shared/profile.ts";

const me = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const base = "https://abc.supabase.co/storage/v1/object/public/uploads/profiles";

test("the host has to be this app's storage when it is known", () => {
  assert.ok(isOwnAvatarUrl(`${base}/${me}/a.jpg`, me, "https://abc.supabase.co"));
  assert.ok(!isOwnAvatarUrl(`https://evil.example/storage/v1/object/public/uploads/profiles/${me}/a.jpg`, me, "https://abc.supabase.co"));
});

test("name, flat and phone are shaped, not trusted", () => {
  assert.equal(cleanDisplayName("  Asha   Rao "), "Asha Rao");
  assert.equal(cleanDisplayName("x".repeat(200)).length, 80);
  assert.equal(cleanProfileFlat(" d-104 "), "D-104");
  assert.equal(cleanProfilePhone("+91 98765-43210 <b>"), "+91 98765-43210");
  assert.equal(cleanProfilePhone("call; drop"), "");
});

test("an avatar must be this person's own upload", () => {
  assert.ok(isOwnAvatarUrl(`${base}/${me}/abc.jpg`, me));
  assert.ok(!isOwnAvatarUrl(`${base}/${other}/abc.jpg`, me), "somebody else's folder");
  assert.ok(!isOwnAvatarUrl(`https://evil.example/storage/v1/object/public/uploads/profiles/${me}/a.jpg`.replace("https://evil.example", "http://evil.example"), me), "not https");
  assert.ok(!isOwnAvatarUrl(`https://tracker.example/pixel.png`, me), "a third party");
  assert.ok(!isOwnAvatarUrl(`${base}/${me}/../x.jpg`, me), "path tricks");
  assert.ok(!isOwnAvatarUrl(`${base}/${me}/abc.jpg`, "not-a-uuid"));
});
