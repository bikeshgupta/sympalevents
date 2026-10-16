import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activePeople, activePeopleByDay, cleanSearch, compare, countByDay, daysIn, isUuid, istDayOf, readChoice, readPage,
  societyFacts, tallyStatuses, inWindow, activityLevels, signupCohorts, median, visitLength, tallyLabels, mergeSmall, scrubChanges, maskPersonal,
} from '../shared/platform-metrics.ts';
import { platformWindow } from '../shared/platform-range.ts';

// 15 Oct 2026, 10:30 IST.
const NOW = Date.UTC(2026, 9, 15, 5, 0);
const w7 = platformWindow('7d', NOW); // 9 Oct - 15 Oct IST
const ist = (day, hh = '12:00') => new Date(`${day}T${hh}:00+05:30`).toISOString();

test('a window is exactly its IST days', () => {
  assert.deepEqual(daysIn(w7), ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
  assert.equal(istDayOf(ist('2026-10-09', '00:05')), '2026-10-09');
  assert.equal(istDayOf('not a date'), null);
});

test('counts per day include zero days and drop instants outside the window', () => {
  const series = countByDay([ist('2026-10-09'), ist('2026-10-09'), ist('2026-10-15', '23:59'), ist('2026-10-08', '23:59'), null], w7);
  assert.equal(series.length, 7);
  assert.equal(series[0].value, 2);
  assert.equal(series[6].value, 1);
  assert.equal(series.reduce((t, d) => t + d.value, 0), 3);
});

const visit = (user, start, end = start, event = 'e1') => ({ event_id: event, user_id: user, started_at: start, last_seen_at: end });

test('active people are distinct signed-in users whose visit overlaps the window; guests never count', () => {
  const visits = [
    visit('u1', ist('2026-10-10')), visit('u1', ist('2026-10-11')),             // same person twice
    visit('u2', ist('2026-10-08', '23:00'), ist('2026-10-09', '00:30')),       // starts before, overlaps
    visit('u3', ist('2026-10-08', '10:00'), ist('2026-10-08', '11:00')),       // entirely before
    visit(null, ist('2026-10-12')),                                            // guest
  ];
  assert.deepEqual([...activePeople(visits, w7)].sort(), ['u1', 'u2']);
});

test('daily active people count a visit on every day it touches', () => {
  const visits = [visit('u1', ist('2026-10-12', '23:30'), ist('2026-10-13', '00:20')), visit('u2', ist('2026-10-13'))];
  const byDay = Object.fromEntries(activePeopleByDay(visits, w7).map((d) => [d.day, d.value]));
  assert.equal(byDay['2026-10-12'], 1);
  assert.equal(byDay['2026-10-13'], 2);
  assert.equal(byDay['2026-10-14'], 0);
});

test('a comparison with nothing before it has no percentage', () => {
  assert.deepEqual(compare(10, 0), { current: 10, previous: 0, change: null });
  assert.equal(compare(15, 10).change, 0.5);
});

test('statuses are tallied as given, never re-derived', () => {
  assert.deepEqual(tallyStatuses(['live', 'live', 'draft']), { draft: 1, upcoming: 0, live: 2, completed: 0, cancelled: 0 });
});

test('society labels follow the written rule', () => {
  const day = (d) => ist(d);
  const societies = [
    { id: 'new', created_at: day('2026-10-12') },
    { id: 'active', created_at: day('2026-01-01') },
    { id: 'visited', created_at: day('2026-01-01') },
    { id: 'quiet', created_at: day('2026-01-01') },
    { id: 'dormant', created_at: day('2026-01-01') },
    { id: 'empty', created_at: day('2026-01-01') },
    { id: 'draftonly', created_at: day('2026-01-01') },
  ];
  const ev = (id, org, created, start, end, on = true) => ({ id, organization_id: org, created_at: day(created), startsAt: Date.parse(ist(start, '00:00')), endsAt: Date.parse(ist(end, '23:59')), countsAsOn: on });
  const events = [
    ev('a1', 'active', '2026-09-01', '2026-10-11', '2026-10-19'),     // on during the window
    ev('v1', 'visited', '2026-03-01', '2026-03-10', '2026-03-10'),
    ev('q1', 'quiet', '2026-08-20', '2026-08-25', '2026-08-25'),      // 51 days ago
    ev('d1', 'dormant', '2026-03-01', '2026-03-10', '2026-03-10'),
    ev('x1', 'draftonly', '2026-03-01', '2026-10-12', '2026-10-12', false), // a draft is never "on"
  ];
  const members = (org, n, created = day('2026-02-01')) => Array.from({ length: n }, (_, i) => ({ organization_id: org, user_id: `${org}-${i}`, created_at: created }));
  const memberships = [...members('active', 5), ...members('visited', 5), ...members('quiet', 5), ...members('dormant', 5), ...members('empty', 1), ...members('draftonly', 3)];
  const visits = [visit('someone', ist('2026-10-13'), ist('2026-10-13'), 'v1')];
  const facts = societyFacts(societies, events, memberships, visits, w7, NOW);
  const labels = Object.fromEntries([...facts].map(([id, f]) => [id, f.label]));
  assert.deepEqual(labels, { new: 'new', active: 'active', visited: 'active', quiet: 'quiet', dormant: 'dormant', empty: 'empty', draftonly: 'dormant' });
  assert.equal(facts.get('visited').signedInVisitors, 1);
  assert.equal(facts.get('active').eventsOn, 1);
  assert.equal(facts.get('draftonly').eventsOn, 0);
});

test('request parameters are cleaned before they reach a query', () => {
  assert.equal(cleanSearch('  Kavya*,(or)%iyer  '), 'Kavya or iyer');
  assert.equal(cleanSearch('a'.repeat(100)).length, 60);
  assert.equal(cleanSearch('पुणे'), 'पुणे');
  assert.equal(readPage('3'), 3);
  assert.equal(readPage('-4'), 1);
  assert.equal(readPage('x'), 1);
  assert.equal(readPage('99999'), 1000);
  assert.equal(readChoice('live', ['all', 'live'], 'all'), 'live');
  assert.equal(readChoice('drop table', ['all', 'live'], 'all'), 'all');
  assert.equal(isUuid('6f1c2a90-3b7e-4d1a-9c55-0e2f4a1b7c11'), true);
  assert.equal(isUuid("1' or 1=1"), false);
});

test('DAU, WAU and MAU are distinct people in nested windows, not visit counts', () => {
  const to = w7.to;
  const visits = [
    visit('a', ist('2026-10-15', '09:00')), visit('a', ist('2026-10-15', '10:00')), visit('a', ist('2026-10-15', '10:20')),
    visit('b', ist('2026-10-12')),
    visit('c', ist('2026-10-01')),
    visit(null, ist('2026-10-15', '09:30')),
    visit('d', ist('2026-09-27')),
  ];
  const levels = activityLevels(visits, to);
  assert.equal(levels.dau.current, 1, 'one person visited three times today');
  assert.equal(levels.wau.current, 2);
  assert.equal(levels.mau.current, 4);
  assert.ok(levels.dau.current <= levels.wau.current && levels.wau.current <= levels.mau.current);
  assert.equal(levels.stickiness, 0.25);
  assert.equal(activityLevels([], to).stickiness, null, 'no stickiness without anyone active');
});

test('sign-up cohorts count how many of each month are active, oldest first', () => {
  const users = [
    { id: '1', created_at: ist('2026-08-03') }, { id: '2', created_at: ist('2026-08-20') },
    { id: '3', created_at: ist('2026-09-02') }, { id: '4', created_at: null },
  ];
  const cohorts = signupCohorts(users, new Set(['1', '3']));
  assert.deepEqual(cohorts, [
    { month: '2026-08', people: 2, active: 1, share: 0.5 },
    { month: '2026-09', people: 1, active: 1, share: 1 },
  ]);
  assert.equal(signupCohorts(users, new Set(), 1).length, 1);
});

test('visit length leaves out visits too short to measure and says how many it measured', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const result = visitLength([
    { started_at: ist('2026-10-15', '10:00'), last_seen_at: ist('2026-10-15', '10:02') },
    { started_at: ist('2026-10-15', '10:00'), last_seen_at: ist('2026-10-15', '10:04') },
    { started_at: ist('2026-10-15', '10:00'), last_seen_at: ist('2026-10-15', '10:00') },
    { started_at: ist('2026-10-15', '10:00'), last_seen_at: null },
  ]);
  assert.deepEqual(result, { medianSeconds: 180, measured: 2, total: 4 });
});

test('small groups are folded into Other so nobody is shown alone', () => {
  const counts = tallyLabels(['iPhone', 'iPhone', 'iPhone', 'iPhone', 'iPhone', 'Android', 'Android', 'Android', 'Android', 'Android', 'Android', 'Pixel', 'Nokia', '', null]);
  assert.equal(counts.Unknown, 2);
  assert.deepEqual(mergeSmall(counts), [
    { label: 'Android', count: 6 }, { label: 'iPhone', count: 5 }, { label: 'Other', count: 4 },
  ]);
  assert.deepEqual(mergeSmall({ a: 9 }), [{ label: 'a', count: 9 }], 'no Other when nothing is small');
});

test('audit values never show contact details, flats, references, tokens or addresses', () => {
  const { value, hidden } = scrubChanges({
    amount: { from: 5000, to: 500 },
    phone: '9876543210',
    flat_no: 'B-402',
    payment_reference: 'UTR123',
    share_token: '[redacted]',
    contact: { name: 'x' },
    note: 'call me on +91 98765 43210 or a@b.co',
    nested: { deep: { deeper: { deepest: { too: 'far' } } } },
    items: Array.from({ length: 30 }, (_, index) => index),
    long: 'x'.repeat(500),
  });
  assert.deepEqual(value.amount, { from: 5000, to: 500 });
  for (const key of ['phone', 'flat_no', 'payment_reference', 'share_token', 'contact']) assert.equal(value[key], '[hidden]', key);
  assert.equal(value.note, 'call me on [hidden] or [hidden]');
  assert.equal(value.items.length, 20);
  assert.equal(value.long.length, 201);
  assert.equal(value.nested.deep.deeper.deepest, '…');
  assert.equal(hidden, 6, 'five hidden fields and one masked text value');
  assert.equal(maskPersonal('plain words'), 'plain words');
  assert.equal(scrubChanges(null).value, null);
});

test('windows compare instants, so the database and window spellings of one moment agree', () => {
  const edge = { from: '2026-10-08T18:30:00.000Z', to: '2026-10-15T18:30:00.000Z' };
  assert.equal(inWindow('2026-10-08T18:30:00+00:00', edge), true, 'a row exactly on the start is inside');
  assert.equal(inWindow('2026-10-15T18:30:00+00:00', edge), false, 'a row exactly on the end is outside');
  assert.equal(inWindow('2026-10-08T18:29:59.999999+00:00', edge), false);
  assert.equal(inWindow(null, edge), false);
  assert.equal(inWindow('garbage', edge), false);
  const seen = activePeople([{ event_id: 'e', user_id: 'u', started_at: '2026-10-08T17:00:00+00:00', last_seen_at: '2026-10-08T18:30:00+00:00' }], edge);
  assert.equal(seen.size, 1, 'a visit that ended exactly at the start still overlaps');
});
