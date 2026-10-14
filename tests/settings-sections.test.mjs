import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionDefs,
  isSectionKey,
  isPanelKey,
  dateRangeLabel,
  plural,
  readinessTarget,
  readinessHeadline,
  dirtySectionKeys,
  sectionOfDirtyId,
  defaultSection,
} from '../src/features/settings/settings-sections.ts';

test('the eight sections are the agreed groups, in order, with no duplicates', () => {
  assert.deepEqual(
    sectionDefs.map((section) => section.key),
    ['basics', 'schedule', 'pages', 'team', 'registration', 'appearance', 'notifications', 'advanced'],
  );
  assert.equal(new Set(sectionDefs.map((section) => section.key)).size, sectionDefs.length);
});

test('only panels can be opened in place; links fall back to the index', () => {
  assert.equal(isSectionKey('team'), true);
  assert.equal(isSectionKey('nonsense'), false);
  assert.equal(isSectionKey(null), false);
  assert.equal(isPanelKey('team'), true);
  assert.equal(isPanelKey('registration'), false);
  assert.equal(isPanelKey('notifications'), false);
  assert.equal(isPanelKey('?'), false);
  assert.equal(isPanelKey(defaultSection), true);
});

test('link sections point at existing pages and carry no settings of their own', () => {
  const links = sectionDefs.filter((section) => section.kind === 'link');
  assert.deepEqual(links.map((section) => [section.key, section.page]), [
    ['registration', 'registration'],
    ['notifications', 'communications'],
  ]);
});

test('date ranges and plurals', () => {
  const fmt = (date) => date.slice(5);
  assert.equal(dateRangeLabel('2026-09-14', '2026-09-14', fmt), '09-14');
  assert.equal(dateRangeLabel('2026-09-14', '2026-09-16', fmt), '09-14 - 09-16');
  assert.equal(dateRangeLabel('', '', fmt), '');
  assert.equal(plural(1, 'person', 'people'), '1 person');
  assert.equal(plural(3, 'person', 'people'), '3 people');
  assert.equal(plural(0, 'page'), '0 pages');
});

test('a readiness gap lands on the section that holds its control, or on its own page', () => {
  assert.deepEqual(readinessTarget({ key: 'details', label: 'Event details', status: 'missing', page: 'settings' }), { kind: 'section', section: 'schedule' });
  assert.deepEqual(readinessTarget({ key: 'hero', label: 'Hero', status: 'missing', page: 'settings' }), { kind: 'section', section: 'appearance' });
  assert.deepEqual(readinessTarget({ key: 'programme', label: 'Programme', status: 'missing', page: 'event-plan' }), { kind: 'page', page: 'event-plan' });
  assert.equal(readinessTarget({ key: 'x', label: 'X', status: 'missing' }), null);
});

test('the readiness line only says what the real checklist says', () => {
  const item = (status) => ({ key: 'k', label: 'L', status });
  assert.deepEqual(readinessHeadline(undefined, true), { tone: 'none', text: '' });
  assert.deepEqual(readinessHeadline([item('complete'), item('optional')], true), { tone: 'ready', text: 'Ready to publish' });
  // "Ready to publish" is only ever said of a draft.
  assert.deepEqual(readinessHeadline([item('complete')], false), { tone: 'none', text: '' });
  assert.deepEqual(readinessHeadline([item('missing')], true), { tone: 'attention', text: '1 item needs attention' });
  assert.deepEqual(readinessHeadline([item('missing'), item('missing'), item('missing'), item('complete')], false), { tone: 'attention', text: '3 items need attention' });
  // Optional items are never counted against an event.
  assert.deepEqual(readinessHeadline([item('optional'), item('optional')], true), { tone: 'ready', text: 'Ready to publish' });
});

test('unsaved changes are credited to the section that holds the card', () => {
  assert.equal(sectionOfDirtyId('details:basics'), 'basics');
  assert.equal(sectionOfDirtyId('details:schedule'), 'schedule');
  assert.equal(sectionOfDirtyId('good-to-know'), 'schedule');
  assert.equal(sectionOfDirtyId('modules'), 'pages');
  assert.equal(sectionOfDirtyId('address'), 'pages');
  assert.equal(sectionOfDirtyId('member-access'), 'team');
  assert.equal(sectionOfDirtyId('hero-options'), 'appearance');
  assert.equal(sectionOfDirtyId('duplicate'), 'advanced');
  assert.equal(sectionOfDirtyId('unknown'), null);
  assert.deepEqual([...dirtySectionKeys(['details:schedule', 'good-to-know', 'modules', 'unknown'])].sort(), ['pages', 'schedule']);
  assert.equal(dirtySectionKeys([]).size, 0);
});
