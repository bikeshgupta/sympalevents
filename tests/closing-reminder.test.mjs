import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysSinceEnd, finishedLabel, reminderMayShow } from '../src/lib/closing-reminder.ts';
import { getDateInEventZone, getEventStatus } from '../shared/event-status.ts';

const event = { startDate: '2026-11-08', endDate: '2026-11-10', startTime: null, endTime: null, statusOverride: null };
const gateAt = (now, overrides = {}) => {
  const ev = { ...event, ...(overrides.event ?? {}) };
  return {
    eventRole: 'admin', isResidentView: false, onClosingPage: false, lastShownDay: null,
    ...overrides,
    status: getEventStatus({ ...ev, isClosed: false }, now),
    today: getDateInEventZone(now),
  };
};
const after = new Date('2026-11-12T10:00:00+05:30');

test('an event admin is reminded once the event is over', () => {
  assert.equal(reminderMayShow(gateAt(after)), true);
});

test('nobody but the event admin is asked - not committee, not a society admin with no role here', () => {
  for (const eventRole of ['committee', 'read_only', null, undefined]) {
    assert.equal(reminderMayShow(gateAt(after, { eventRole })), false, String(eventRole));
  }
});

test('not before the event is over, and never for a draft or cancelled event', () => {
  assert.equal(reminderMayShow(gateAt(new Date('2026-11-10T20:00:00+05:30'))), false);
  assert.equal(reminderMayShow(gateAt(after, { event: { statusOverride: 'draft' } })), false);
  assert.equal(reminderMayShow(gateAt(after, { event: { statusOverride: 'cancelled' } })), false);
});

test('an end time is respected: over at 22:00 means a reminder at 23:00 that day', () => {
  const late = { event: { endTime: '22:00' } };
  assert.equal(reminderMayShow(gateAt(new Date('2026-11-10T21:00:00+05:30'), late)), false);
  assert.equal(reminderMayShow(gateAt(new Date('2026-11-10T23:00:00+05:30'), late)), true);
});

test('once a day, India time: shown today means quiet until tomorrow', () => {
  assert.equal(reminderMayShow(gateAt(after, { lastShownDay: '2026-11-12' })), false);
  assert.equal(reminderMayShow(gateAt(after, { lastShownDay: '2026-11-11' })), true);
  // 00:30 IST on the 13th is a new day in India while it is still the 12th in UTC.
  assert.equal(reminderMayShow(gateAt(new Date('2026-11-13T00:30:00+05:30'), { lastShownDay: '2026-11-12' })), true);
});

test('never in the resident preview or on the closing page itself', () => {
  assert.equal(reminderMayShow(gateAt(after, { isResidentView: true })), false);
  assert.equal(reminderMayShow(gateAt(after, { onClosingPage: true })), false);
});

test('how long ago it finished reads naturally', () => {
  assert.equal(daysSinceEnd('2026-11-10', '2026-11-12'), 2);
  assert.equal(finishedLabel('2026-11-10', '2026-11-12'), 'Finished 2 days ago');
  assert.equal(finishedLabel('2026-11-11', '2026-11-12'), 'Finished yesterday');
  assert.equal(finishedLabel('2026-11-12', '2026-11-12'), 'Finished today');
});
