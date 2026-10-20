import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeView, societyTabLabel, showsSocietyChooser } from '../src/features/society/home-view.ts';
import { upcomingFestivals, FESTIVALS } from '../src/features/society/festivals.ts';

test('the society tab opens by default for a member, My space for somebody with no society', () => {
  assert.equal(homeView(null, { societyCount: 1, hasSlug: false }), 'society');
  assert.equal(homeView(null, { societyCount: 0, hasSlug: false }), 'space');
  assert.equal(homeView('space', { societyCount: 2, hasSlug: true }), 'space');
});

test('an empty society hands the default over to My space, once that is known', () => {
  assert.equal(homeView(null, { societyCount: 1, hasSlug: false, societyEmpty: true }), 'space');
  assert.equal(homeView(null, { societyCount: 1, hasSlug: false, societyEmpty: false }), 'society');
  assert.equal(homeView(null, { societyCount: 1, hasSlug: false, societyEmpty: null }), 'society');
  // Chosen by address, it opens even when empty.
  assert.equal(homeView(null, { societyCount: 2, hasSlug: true, societyEmpty: true }), 'society');
});

test('a society named in the address opens on that society', () => {
  assert.equal(homeView(null, { societyCount: 0, hasSlug: true }), 'society');
});

test('a signed-out visitor gets the same home: My space unless a society is in the address', () => {
  assert.equal(homeView(null, { societyCount: 0, hasSlug: false }), 'space');
  assert.equal(homeView(null, { societyCount: 0, hasSlug: true }), 'society');
});

test('?view=society opens the society tab even with no society, so the tab is never a dead link', () => {
  assert.equal(homeView('society', { societyCount: 0, hasSlug: false }), 'society');
});

test('the tab is named after the one society, and says Societies once there are more', () => {
  assert.equal(societyTabLabel([{ name: 'TRU WindChimes' }]), 'TRU WindChimes');
  assert.equal(societyTabLabel([{ name: 'TRU WindChimes' }, { name: 'Green Meadows' }]), 'Societies');
  assert.equal(societyTabLabel([]), 'Societies');
  assert.equal(showsSocietyChooser(1), false);
  assert.equal(showsSocietyChooser(2), true);
});

test('festivals come nearest first, from 3 to 75 days away', () => {
  const ideas = upcomingFestivals('2026-10-19', []);
  assert.deepEqual(ideas.map((f) => f.name), ['Karwa Chauth', 'Diwali', 'Chhath Puja', 'Guru Nanak Jayanti']);
  assert.equal(ideas[0].days, 10);
  // Dussehra is tomorrow: too late to organise, so it is left out.
  assert.ok(!ideas.some((f) => f.name === 'Dussehra'));
});

test('a festival the society already has an event for is marked planned', () => {
  const ideas = upcomingFestivals('2026-10-19', [{ id: 'e1', name: 'Diwali Mela 2026', startDate: '2026-11-07' }]);
  const diwali = ideas.find((f) => f.name === 'Diwali');
  assert.deepEqual(diwali.planned, { id: 'e1', name: 'Diwali Mela 2026' });
  assert.equal(ideas.find((f) => f.name === 'Chhath Puja').planned, null);
});

test('last year\'s Diwali does not count as this year\'s', () => {
  const ideas = upcomingFestivals('2026-10-19', [{ id: 'old', name: 'Diwali 2025', startDate: '2025-10-20' }]);
  assert.equal(ideas.find((f) => f.name === 'Diwali').planned, null);
});

test('once the list runs out the section is empty, never a wrong date', () => {
  assert.deepEqual(upcomingFestivals('2027-06-01', []), []);
});

test('the calendar is in date order', () => {
  const dates = FESTIVALS.map((f) => f.date);
  assert.deepEqual([...dates].sort(), dates);
});
