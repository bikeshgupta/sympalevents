import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupKeyForPage, groupNavItems, pageKeyOf } from '../src/components/layout/nav-groups.ts';

const item = (key) => ({ href: `/${key}`, label: key });
const all = ['command', 'dashboard', 'updates', 'registration', 'gate', 'communications', 'event-plan', 'teams', 'tasks', 'contributions', 'budget', 'expenses', 'auctions', 'closing', 'settings'].map(item);

test('an organiser menu folds into Registrations, Programme, Team and Finance', () => {
  const entries = groupNavItems(all);
  const shape = entries.map((e) => (e.type === 'group' ? `${e.label}(${e.items.length})` : e.item.label));
  assert.deepEqual(shape, [
    'command', 'dashboard', 'updates',          // where somebody starts: never folded
    'Registrations(2)',
    'Programme(2)',
    'communications',                           // a group of one is just the link
    'tasks',                                    // so is Team, with only Tasks on it
    'Finance(4)',
    'closing', 'settings',
  ]);

});

test('every page the server listed is still in the menu, in its own order within a group', () => {
  const flat = groupNavItems(all).flatMap((e) => (e.type === 'group' ? e.items : [e.item]));
  assert.equal(flat.length, all.length);
  assert.deepEqual(new Set(flat), new Set(all));

  // The committee's order inside a group is kept.
  const reordered = groupNavItems(['expenses', 'budget', 'contributions'].map(item));
  assert.deepEqual(reordered[0].items.map((i) => i.label), ['expenses', 'budget', 'contributions']);
});

test('a page nobody has heard of still appears, and settings stays last', () => {
  const entries = groupNavItems([item('settings'), item('brand-new-page'), item('dashboard')]);
  assert.deepEqual(entries.map((e) => e.item.label), ['dashboard', 'brand-new-page', 'settings']);
});

test('page keys come from the first path segment, and know their group', () => {
  assert.equal(pageKeyOf('/event-plan'), 'event-plan');
  assert.equal(pageKeyOf('/'), 'dashboard');
  assert.equal(groupKeyForPage('expenses'), 'finance');
  assert.equal(groupKeyForPage('nope'), null);
});
