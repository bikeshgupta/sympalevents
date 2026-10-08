import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { injectMeta, describeDates, describeEventForPreview, escapeHtml } from "../api/_lib/og-meta.ts";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const meta = {
  title: 'Garba & "Dandiya" <Night>',
  description: "17 Oct 2026 · Clubhouse lawn",
  url: "https://x.test/e/1",
  image: "https://x.test/icon-512.png",
  imageAlt: "SymPal Events",
};

test("injectMeta replaces the app's tags and keeps the rest of the page", () => {
  const out = injectMeta(html, meta);
  assert.equal((out.match(/<title>/g) ?? []).length, 1);
  assert.equal((out.match(/property="og:title"/g) ?? []).length, 1);
  assert.equal((out.match(/name="description"/g) ?? []).length, 1);
  assert.ok(!out.includes(`content="https://sympalevents.vercel.app/og-image.jpg"`), "the Ganesh photograph must not leak onto another event");
  assert.ok(!out.includes("og:image:width"), "stale dimensions would mislead the crawler");
  assert.ok(out.includes('<div id="root"></div>'));
  assert.ok(out.includes('rel="manifest"'));
  assert.ok(out.includes('property="og:image" content="https://x.test/icon-512.png"'));
});

test("injectMeta escapes what an organiser typed", () => {
  const out = injectMeta(html, meta);
  assert.ok(out.includes("Garba &amp; &quot;Dandiya&quot; &lt;Night&gt;"));
  assert.ok(!out.includes("<Night>"));
  assert.equal(escapeHtml(`a"b`), "a&quot;b");
});

test("dates read the way people say them", () => {
  assert.equal(describeDates("2026-10-17", "2026-10-17"), "17 Oct 2026");
  assert.equal(describeDates("2026-10-17", "2026-10-19"), "17–19 Oct 2026");
  assert.equal(describeDates("2026-09-30", "2026-10-02"), "30 Sep – 2 Oct 2026");
  assert.equal(describeDates("", ""), "");
});

test("the description never claims more than it knows", () => {
  assert.equal(describeEventForPreview({ name: "x", start: "2026-10-17", end: "2026-10-17", location: "Clubhouse", society: "TRU" }), "17 Oct 2026 · Clubhouse. Hosted by TRU");
  assert.equal(describeEventForPreview({ name: "x", start: "", end: "", location: "", society: "" }), "See what is happening, register and follow updates.");
});
