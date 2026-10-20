import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstFilledList, myEventLists, parseInviteInput, KIND_ACCENT, PERSONAL_KINDS } from '../shared/personal-events.ts';
import { isOwnAvatarUrl, isOwnUploadUrl } from '../shared/profile.ts';
import { personalArtworkSvg, personalArtworkUrl } from '../src/lib/personal-artwork.ts';

test('a pasted invitation link opens the invitation it names', () => {
  assert.deepEqual(parseInviteInput('https://sympalevents.vercel.app/i/K7Q4MX'), { kind: 'invitation', code: 'K7Q4MX' });
  assert.deepEqual(parseInviteInput('Join us! https://x.app/i/k7q4mx?ref=wa'), { kind: 'invitation', code: 'K7Q4MX' });
  assert.deepEqual(parseInviteInput('https://x.app/join/AB12CD34'), { kind: 'society', code: 'AB12CD34' });
});

test('a code typed on its own is read as before; anything else is not a code', () => {
  assert.deepEqual(parseInviteInput(' k7q 4mx '), { kind: 'invitation', code: 'K7Q4MX' });
  assert.deepEqual(parseInviteInput('ab12-cd34'), { kind: 'society', code: 'AB12CD34' });
  assert.equal(parseInviteInput('https://example.com/party'), null);
  // a society code in an invitation link, or the other way round, is not trusted
  assert.equal(parseInviteInput('https://x.app/i/AB12CD34'), null);
  assert.equal(parseInviteInput('https://x.app/join/K7Q4MX'), null);
  assert.equal(parseInviteInput(''), null);
});

const ev = (id, startsOn, extra = {}) => ({ id, startsOn, status: 'active', ...extra });

test('My events splits hosting, invited, joined and past', () => {
  const today = '2026-10-19';
  const lists = myEventLists(
    [ev('h1', '2026-11-01'), ev('h0', '2026-10-01'), ev('h2', '2026-10-25')],
    [ev('a', '2026-10-30', { myStatus: 'going' }), ev('b', '2026-11-05', { myStatus: 'declined' }), ev('c', '2026-11-20', { myStatus: 'maybe' }), ev('d', '2026-09-01', { myStatus: 'going' })],
    today,
  );
  assert.deepEqual(lists.hosting.map((e) => e.id), ['h2', 'h1']);
  // a "maybe" is still waiting on an answer, so it comes first
  assert.deepEqual(lists.invited.map((e) => e.id), ['c', 'b']);
  assert.deepEqual(lists.joined.map((e) => e.id), ['a']);
  assert.deepEqual(lists.past.map((p) => p.row.id), ['h0', 'd']);
  assert.equal(firstFilledList(lists), 'hosting');
  assert.equal(firstFilledList({ hosting: [], invited: [], joined: [1], past: [] }), 'joined');
  assert.equal(firstFilledList({ hosting: [], invited: [], joined: [], past: [] }), 'hosting');
});

test('today counts as upcoming, not past', () => {
  const lists = myEventLists([ev('t', '2026-10-19')], [], '2026-10-19');
  assert.equal(lists.hosting.length, 1);
  assert.equal(lists.past.length, 0);
});

test('every kind has an accent from the five presets, and its own artwork', () => {
  for (const kind of PERSONAL_KINDS) {
    assert.ok(['teal', 'marigold', 'indigo', 'rose', 'forest'].includes(KIND_ACCENT[kind.key]), kind.key);
    const svg = personalArtworkSvg(kind.key);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 800 500"/);
    assert.ok(!svg.includes('NaN'), kind.key);
  }
  assert.equal(personalArtworkUrl('nope'), personalArtworkUrl('other'));
  assert.match(personalArtworkUrl('birthday'), /^data:image\/svg\+xml;utf8,/);
});

test('a cover photo has to be in the host\'s own personal folder', () => {
  const me = '11111111-2222-3333-4444-555555555555';
  const other = '99999999-2222-3333-4444-555555555555';
  const origin = 'https://abc.supabase.co';
  const mine = `${origin}/storage/v1/object/public/uploads/personal/${me}/a.jpg`;
  assert.ok(isOwnUploadUrl(mine, me, 'personal', origin));
  assert.ok(!isOwnUploadUrl(mine, other, 'personal', origin));
  assert.ok(!isOwnUploadUrl(mine.replace('/personal/', '/profiles/'), me, 'personal', origin));
  assert.ok(!isOwnUploadUrl(`https://evil.example/storage/v1/object/public/uploads/personal/${me}/a.jpg`, me, 'personal', origin));
  // the profile rule is unchanged
  assert.ok(isOwnAvatarUrl(mine.replace('/personal/', '/profiles/'), me, origin));
  assert.ok(!isOwnAvatarUrl(mine, me, origin));
});
