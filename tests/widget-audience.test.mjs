import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseLayout, visibleLayout, hasChosenAudience } from '../src/lib/widgets.ts';

// A resident who can open nothing that needs a role - the case that was reported:
// the committee opened the Financial summary to everyone and residents still did
// not get it, because built-in rules overrode the setting.
const none = new Set(['dashboard']);
const keys = (layout, open, viewer) => visibleLayout(layout, open, viewer).map((e) => e.key);
const base = (audience) =>
  normaliseLayout(
    [
      { key: 'hero', variant: 'basic', isVisible: true },
      { key: 'financial-summary', variant: 'detailed', isVisible: true, ...(audience ? { audience } : {}) },
      { key: 'funding-progress', variant: 'detailed', isVisible: true, ...(audience ? { audience } : {}) },
      { key: 'my-responsibilities', variant: 'basic', isVisible: true, ...(audience ? { audience } : {}) },
    ],
    false,
  );

test('left on automatic, nothing changes: money widgets need an open money page', () => {
  assert.deepEqual(keys(base(), none, 'guest'), ['hero']);
  assert.ok(keys(base(), new Set(['budget']), 'guest').includes('financial-summary'));
});

test('"everyone" shows the money widgets to a signed-out visitor with no pages open', () => {
  const shown = keys(base('everyone'), none, 'guest');
  assert.ok(shown.includes('financial-summary'));
  assert.ok(shown.includes('funding-progress'));
});

test('"signed_in" needs a sign-in; "members" needs a role', () => {
  assert.ok(!keys(base('signed_in'), none, 'guest').includes('financial-summary'));
  assert.ok(keys(base('signed_in'), none, 'signed_in').includes('financial-summary'));
  assert.ok(!keys(base('members'), none, 'signed_in').includes('financial-summary'));
  assert.ok(keys(base('members'), none, 'member').includes('financial-summary'));
});

test('a widget tied to a module still needs that module open, whatever the audience', () => {
  const layout = base('everyone');
  assert.ok(!keys(layout, none, 'guest').includes('my-responsibilities'));
  assert.ok(keys(layout, new Set(['dashboard', 'tasks']), 'guest').includes('my-responsibilities'));
});

test('demo mode (no page filter) is unchanged', () => {
  assert.equal(visibleLayout(base('members'), null, 'guest').length, 4);
});

test('only a real choice is kept when a layout is read back', () => {
  const out = normaliseLayout(
    [
      { key: 'financial-summary', variant: 'basic', isVisible: true, audience: 'everyone' },
      { key: 'funding-progress', variant: 'basic', isVisible: true, audience: 'auto' },
      { key: 'schedule', variant: 'basic', isVisible: true, audience: 'nonsense' },
    ],
    false,
  );
  const by = Object.fromEntries(out.map((e) => [e.key, e]));
  assert.equal(by['financial-summary'].audience, 'everyone');
  assert.equal(by['funding-progress'].audience, undefined);
  assert.equal(by['schedule'].audience, undefined);
  assert.equal(hasChosenAudience(by['financial-summary']), true);
  assert.equal(hasChosenAudience(by['funding-progress']), false);
});
