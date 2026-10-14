import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor, firstNameOf } from '../src/features/society/greeting.ts';
import { buildCommunityFeed as build, futureKinds } from '../src/features/society/community-feed.ts';
import { getEventStatus } from '../shared/event-status.ts';
const buildCommunityFeed = (events, now, limit) => build(events, now, getEventStatus, limit);

test('the greeting follows the hour', () => {
  assert.equal(greetingFor(4), 'Good morning');
  assert.equal(greetingFor(11), 'Good morning');
  assert.equal(greetingFor(12), 'Good afternoon');
  assert.equal(greetingFor(16), 'Good afternoon');
  assert.equal(greetingFor(17), 'Good evening');
  assert.equal(greetingFor(23), 'Good evening');
  assert.equal(greetingFor(2), 'Good evening');
});

test('a first name is the first word, never an email address or nothing', () => {
  assert.equal(firstNameOf('Bikesh Kumar Gupta'), 'Bikesh');
  assert.equal(firstNameOf('  Priya  '), 'Priya');
  assert.equal(firstNameOf('bikesh@test.local'), null);
  assert.equal(firstNameOf(''), null);
  assert.equal(firstNameOf(null), null);
  assert.equal(firstNameOf(undefined), null);
});

const now = new Date('2026-10-14T10:00:00+05:30');
const ev = (o) => ({ id: o.id, name: o.name, startDate: o.s, endDate: o.e, startTime: null, endTime: null, statusOverride: null, modules: o.modules ?? ['closing'], coverPhotoUrl: o.cover ?? null, metrics: { photoCount: 0, reviewCount: 0, averageRating: null, ...(o.metrics ?? {}) } });

test('the community feed tells only memories that really exist', () => {
  const feed = buildCommunityFeed([
    ev({ id: 'g', name: 'Garba', s: '2026-10-17', e: '2026-10-17', metrics: { photoCount: 9 } }),            // upcoming: not a memory
    ev({ id: 'a', name: 'Ganesh', s: '2026-09-14', e: '2026-09-16', metrics: { photoCount: 1, reviewCount: 4, averageRating: 5 } }),
    ev({ id: 'b', name: 'Bare', s: '2026-08-01', e: '2026-08-01' }),                                         // over, nothing left behind
    ev({ id: 'c', name: 'Closed to this viewer', s: '2026-07-01', e: '2026-07-01', modules: ['dashboard'], metrics: { photoCount: 5 } }),
    ev({ id: 'd', name: 'Rated only', s: '2026-06-01', e: '2026-06-01', metrics: { reviewCount: 2 } }),
  ], now);
  assert.deepEqual(feed.map((e) => e.eventId), ['a', 'd']);
  assert.deepEqual(feed[0].facts, ['1 photo', '★ 5.0 from 4 reviews']);
  assert.deepEqual(feed[1].facts, ['2 reviews']);
  assert.equal(feed[0].to, '/e/a/closing');
});

test('the feed is capped, newest first, and empty when there is nothing', () => {
  const many = ['1', '2', '3', '4'].map((n) => ev({ id: n, name: n, s: `2026-0${n}-01`, e: `2026-0${n}-01`, metrics: { photoCount: 1 } }));
  assert.deepEqual(buildCommunityFeed(many, now).map((e) => e.eventId), ['4', '3', '2']);
  assert.deepEqual(buildCommunityFeed([], now), []);
});

test('activity that needs data the payload lacks is documented, not invented', () => {
  assert.ok(Object.keys(futureKinds).length >= 4);
  const kinds = new Set(buildCommunityFeed([ev({ id: 'a', name: 'A', s: '2026-09-01', e: '2026-09-01', metrics: { photoCount: 1 } })], now).map((e) => e.kind));
  assert.deepEqual([...kinds], ['memory']);
});
