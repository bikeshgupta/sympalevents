import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, googleCalendarUrl } from '../src/lib/calendar.ts';

const now = new Date('2026-10-08T12:00:00Z');
const garba = { title: 'Garba & Dandiya Night', startDate: '2026-10-17', endDate: '2026-10-17', startTime: '19:00', endTime: '23:00', location: 'Clubhouse lawn, TRU WindChimes', description: 'Bring your own sticks; food at 8.', url: 'https://x.test/e/1' };

test('an event with hours is converted from IST to UTC and carries an alert when asked', () => {
  const ics = buildIcs([{ ...garba, alarmMinutes: 30 }], now);
  assert.ok(ics.includes('DTSTART:20261017T133000Z'));   // 19:00 IST
  assert.ok(ics.includes('DTEND:20261017T173000Z'));     // 23:00 IST
  assert.ok(ics.includes('TRIGGER:-PT30M'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  // Text with commas, semicolons and newlines is escaped, not broken.
  assert.ok(ics.includes('LOCATION:Clubhouse lawn\\, TRU WindChimes'));
  assert.ok(ics.includes('Bring your own sticks\\; food at 8.\\nhttps://x.test/e/1'));
});

test('an event with no hours is all-day, and a date range ends the day after', () => {
  const ics = buildIcs([{ title: 'Ganesh Chaturthi', startDate: '2026-09-14', endDate: '2026-09-16' }], now);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260914'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260917'));   // exclusive
  assert.ok(!ics.includes('VALARM'));
  // Midnight rollover when the UTC day differs from the IST day.
  assert.ok(buildIcs([{ ...garba, startTime: '02:00', endTime: '03:00' }], now).includes('DTSTART:20261016T203000Z'));
});

test('a start with no end becomes a two-hour block, and long lines are folded', () => {
  const ics = buildIcs([{ title: 'Prize giving', startDate: '2026-10-17', endDate: '2026-10-17', startTime: '21:00' }], now);
  assert.ok(ics.includes('DTEND:20261017T173000Z'));       // 23:00 IST
  const folded = buildIcs([{ ...garba, description: 'x'.repeat(200) }], now);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line.length);
});

test('the Google Calendar link carries the same instants', () => {
  const url = new URL(googleCalendarUrl(garba));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261017T133000Z/20261017T173000Z');
  assert.equal(url.searchParams.get('text'), 'Garba & Dandiya Night');
  assert.equal(new URL(googleCalendarUrl({ title: 'x', startDate: '2026-10-17', endDate: '2026-10-18' })).searchParams.get('dates'), '20261017/20261019');
});
