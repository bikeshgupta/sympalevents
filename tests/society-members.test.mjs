import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wouldLeaveNoAdmin, matchesFilter, matchesSearch, isSocietyRole, societyRoleLabels, lastAdminMessage } from '../shared/society-members.ts';
import { getEventStatus } from '../shared/event-status.ts';

const m = (userId, role) => ({ userId, role });

test('the only admin cannot be demoted or removed - including by themselves', () => {
  const members = [m('a', 'admin'), m('b', 'committee'), m('c', 'read_only')];
  assert.equal(wouldLeaveNoAdmin(members, 'a', 'committee'), true);
  assert.equal(wouldLeaveNoAdmin(members, 'a', 'read_only'), true);
  assert.equal(wouldLeaveNoAdmin(members, 'a', null), true);
  assert.ok(lastAdminMessage.length > 10);
});

test('with a second admin, either may step down or be removed', () => {
  const members = [m('a', 'admin'), m('b', 'admin'), m('c', 'read_only')];
  assert.equal(wouldLeaveNoAdmin(members, 'a', 'committee'), false);
  assert.equal(wouldLeaveNoAdmin(members, 'b', null), false);
});

test('two admins cannot both leave: the check holds one change at a time', () => {
  // After the first demotion lands, the second is the only admin again.
  const after = [m('a', 'committee'), m('b', 'admin')];
  assert.equal(wouldLeaveNoAdmin(after, 'b', 'committee'), true);
});

test('changing a non-admin, or keeping admin, can never leave the society without one', () => {
  const members = [m('a', 'admin'), m('c', 'read_only')];
  assert.equal(wouldLeaveNoAdmin(members, 'c', 'admin'), false);
  assert.equal(wouldLeaveNoAdmin(members, 'c', null), false);
  assert.equal(wouldLeaveNoAdmin(members, 'a', 'admin'), false);
  assert.equal(wouldLeaveNoAdmin(members, 'nobody', 'committee'), false);
});

test('roles read as Admin, Committee and Resident - the stored word never shows', () => {
  assert.deepEqual(societyRoleLabels, { admin: 'Admin', committee: 'Committee', read_only: 'Resident' });
  assert.equal(isSocietyRole('read_only'), true);
  assert.equal(isSocietyRole('owner'), false);
});

test('filters and search: by role, by name, and by flat ignoring spaces and dashes', () => {
  assert.equal(matchesFilter('read_only', 'resident'), true);
  assert.equal(matchesFilter('admin', 'resident'), false);
  assert.equal(matchesFilter('committee', 'all'), true);
  const person = { name: 'Bikesh Kumar Gupta', flat: 'D-104' };
  assert.equal(matchesSearch(person, 'bikesh'), true);
  assert.equal(matchesSearch(person, 'd104'), true);
  assert.equal(matchesSearch(person, 'D 104'), true);
  assert.equal(matchesSearch(person, 'c-2'), false);
  assert.equal(matchesSearch({ name: 'No Flat', flat: null }, 'd104'), false);
  assert.equal(matchesSearch(person, '   '), true);
});

test('the event phase rules the overview counts with are the shared ones', () => {
  const now = new Date('2026-10-17T12:00:00+05:30');
  const base = { startDate: '2026-10-17', endDate: '2026-10-17' };
  assert.equal(getEventStatus({ ...base, statusOverride: 'draft' }, now), 'draft');
  assert.equal(getEventStatus({ ...base, statusOverride: 'cancelled' }, now), 'cancelled');
  assert.equal(getEventStatus({ startDate: '2026-11-01', endDate: '2026-11-02' }, now), 'upcoming');
  assert.equal(getEventStatus({ startDate: '2026-09-01', endDate: '2026-09-02' }, now), 'completed');
  assert.equal(getEventStatus({ ...base, isClosed: true }, now), 'completed');
  assert.equal(getEventStatus(base, now), 'live');
});
