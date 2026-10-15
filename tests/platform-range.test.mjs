import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istDay, istDayStart, platformWindow, readPlatformRange } from '../shared/platform-range.ts';

// 15 Oct 2026, 10:30 IST = 05:00 UTC.
const NOW = Date.UTC(2026, 9, 15, 5, 0);

test('days are IST calendar days, not UTC ones', () => {
  // 00:10 IST on 15 Oct is still 14 Oct in UTC.
  const justAfterMidnightIst = Date.UTC(2026, 9, 14, 18, 40);
  assert.equal(istDay(justAfterMidnightIst), '2026-10-15');
  assert.equal(new Date(istDayStart(justAfterMidnightIst)).toISOString(), '2026-10-14T18:30:00.000Z');
});

test('the last 30 days end at the end of today in IST and include today', () => {
  const w = platformWindow('30d', NOW);
  assert.equal(w.days, 30);
  assert.equal(w.lastDay, '2026-10-15');
  assert.equal(w.firstDay, '2026-09-16');
  assert.equal(w.to, '2026-10-15T18:30:00.000Z');
  assert.equal(w.from, '2026-09-15T18:30:00.000Z');
});

test('the previous window is the same length and ends where the current one starts', () => {
  for (const preset of ['7d', '30d', '90d', '12m']) {
    const w = platformWindow(preset, NOW);
    assert.equal(w.previous.to, w.from);
    assert.equal(Date.parse(w.from) - Date.parse(w.previous.from), Date.parse(w.to) - Date.parse(w.from));
  }
});

test('12 months is 365 IST days', () => {
  const w = platformWindow('12m', NOW);
  assert.equal(w.days, 365);
  assert.equal((Date.parse(w.to) - Date.parse(w.from)) / 86400000, 365);
});

test('an unknown range falls back to 30 days', () => {
  assert.equal(readPlatformRange('30d'), '30d');
  assert.equal(readPlatformRange('9999d'), '30d');
  assert.equal(readPlatformRange(undefined), '30d');
  assert.equal(readPlatformRange(['7d']), '30d');
});
