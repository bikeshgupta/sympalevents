import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, LIMITS, cleanParagraphs, cleanPhone, cleanText, firstName, isColor, isIsoDate, isKind, isTime,
  kindOf, newInviteCode, normaliseCode, peopleFor, repliesOpen, rsvpCounts,
} from '../shared/personal-events.ts';

test('an invite code is six characters from an alphabet with no look-alikes', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = newInviteCode();
    assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
  }
  for (const ch of 'ILO01') assert.ok(!CODE_ALPHABET.includes(ch));
});

test('a typed code is tidied, and anything that cannot be a code is refused', () => {
  assert.equal(normaliseCode(' k7q 4mx '), 'K7Q4MX');
  assert.equal(normaliseCode('k7q-4mx'), 'K7Q4MX');
  assert.equal(normaliseCode('K7Q4M'), null);
  assert.equal(normaliseCode('K7Q4M0'), null); // 0 is not in the alphabet
  assert.equal(normaliseCode(null), null);
});

test('kinds and colours accept only the listed values', () => {
  assert.ok(isKind('birthday'));
  assert.ok(!isKind('concert'));
  assert.equal(kindOf('nope').key, 'other');
  assert.ok(isColor('rose'));
  assert.ok(!isColor('#ff00aa'));
});

test('text is collapsed and capped; empty becomes null', () => {
  assert.equal(cleanText('  Aarav   turns 5 ', 100), 'Aarav turns 5');
  assert.equal(cleanText('   ', 100), null);
  assert.equal(cleanText('x'.repeat(200), LIMITS.title).length, 100);
  assert.equal(cleanParagraphs('Line one\r\n\r\n\r\n\r\nLine   two', 500), 'Line one\n\nLine two');
});

test('only something shaped like a phone number is kept', () => {
  assert.equal(cleanPhone('+91 98765 43210'), '+91 98765 43210');
  assert.equal(cleanPhone('call me maybe'), null);
  assert.equal(cleanPhone(''), null);
});

test('dates and times are checked for shape', () => {
  assert.ok(isIsoDate('2026-11-01'));
  assert.ok(!isIsoDate('01/11/2026'));
  assert.ok(isTime('16:00'));
  assert.ok(!isTime('25:00'));
});

test('a reply brings the right number of people', () => {
  assert.equal(peopleFor('declined', 4, true), 0);
  assert.equal(peopleFor('going', 4, false), 1);
  assert.equal(peopleFor('going', 4, true), 4);
  assert.equal(peopleFor('going', 99, true), LIMITS.people);
  assert.equal(peopleFor('maybe', 0, true), 1);
});

test('counts add up people coming, and replies by kind', () => {
  assert.deepEqual(
    rsvpCounts([{ status: 'going', people: 3 }, { status: 'going', people: 1 }, { status: 'maybe', people: 2 }, { status: 'declined', people: 0 }]),
    { goingPeople: 4, goingReplies: 2, maybe: 1, declined: 1 },
  );
});

test('a wish is signed with a first name only', () => {
  assert.equal(firstName('Priya Sharma'), 'Priya');
  assert.equal(firstName('  '), 'A guest');
});

test('replies close after the day, or when the event is cancelled', () => {
  assert.ok(repliesOpen('2026-11-01', '2026-11-01', 'active'));
  assert.ok(!repliesOpen('2026-10-31', '2026-11-01', 'active'));
  assert.ok(!repliesOpen('2026-11-05', '2026-11-01', 'cancelled'));
});

test('one code box tells an invitation from a society code', async () => {
  const { classifyCode } = await import('../shared/personal-events.ts');
  assert.deepEqual(classifyCode('k7q 4mx'), { kind: 'invitation', code: 'K7Q4MX' });
  assert.deepEqual(classifyCode('ab12-cd34'), { kind: 'society', code: 'AB12CD34' });
  assert.equal(classifyCode('hello'), null);
  assert.equal(classifyCode(''), null);
});
