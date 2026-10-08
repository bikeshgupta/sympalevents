import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEventOrganiser, isOrganiserPage, resolveViewMode, organiserOnlyWidgets } from '../src/lib/resident-view.ts';
import { isRegistrationOpen, resolveResidentAction } from '../src/lib/resident-action.ts';
import { artworkKeyFor, usesBundledPhoto } from '../src/lib/hero-artwork.ts';

const open = (...pages) => (page) => pages.includes(page);

test('who is an organiser, and which view each person gets', () => {
  assert.equal(isEventOrganiser({ role: null, pages: [{ canEdit: false }] }), false);
  assert.equal(isEventOrganiser({ role: 'committee', pages: [] }), true);
  // read_only still has a role: trimming their menu would take pages away.
  assert.equal(isEventOrganiser({ role: 'read_only', pages: [] }), true);
  assert.equal(isEventOrganiser({ role: null, pages: [{ canEdit: true }] }), true);

  assert.equal(resolveViewMode({ hasEvent: false, isOrganiser: false, previewing: false }), 'organiser'); // demo
  assert.equal(resolveViewMode({ hasEvent: true, isOrganiser: false, previewing: true }), 'resident');
  assert.equal(resolveViewMode({ hasEvent: true, isOrganiser: true, previewing: false }), 'organiser');
  assert.equal(resolveViewMode({ hasEvent: true, isOrganiser: true, previewing: true }), 'resident');

  for (const page of ['budget', 'expenses', 'tasks', 'contributions', 'settings']) assert.equal(isOrganiserPage(page), true, page);
  for (const page of ['dashboard', 'registration', 'event-plan', 'auctions', 'closing', 'fixtures']) assert.equal(isOrganiserPage(page), false, page);
  assert.ok(organiserOnlyWidgets.has('financial-summary') && !organiserOnlyWidgets.has('hero'));
});

test('a resident gets exactly one action, chosen by state', () => {
  const base = { registrationOpen: false, selfService: false, hasBooking: false };
  const all = open('registration', 'event-plan', 'closing');

  assert.deepEqual(resolveResidentAction({ ...base, status: 'upcoming', canOpen: all, registrationOpen: true, selfService: true }),
    { headline: 'Registration is open', label: 'Register now', page: 'registration' });
  // Organiser-led registration: nothing to press "Register now" for.
  assert.equal(resolveResidentAction({ ...base, status: 'upcoming', canOpen: all, registrationOpen: true }).label, 'How to register');
  assert.equal(resolveResidentAction({ ...base, status: 'upcoming', canOpen: all, hasBooking: true }).label, 'View my registration');
  assert.equal(resolveResidentAction({ ...base, status: 'upcoming', canOpen: open('event-plan') }).label, 'View schedule');
  assert.equal(resolveResidentAction({ ...base, status: 'upcoming', canOpen: open() }), null);

  assert.equal(resolveResidentAction({ ...base, status: 'live', canOpen: all }).label, "See what's on");
  assert.equal(resolveResidentAction({ ...base, status: 'live', canOpen: all, hasBooking: true }).label, 'View my registration');
  assert.equal(resolveResidentAction({ ...base, status: 'completed', canOpen: all }).label, 'View memories');
  assert.equal(resolveResidentAction({ ...base, status: 'completed', canOpen: open('registration') }), null);

  const cancelled = resolveResidentAction({ ...base, status: 'cancelled', canOpen: all });
  assert.equal(cancelled.label, null);
  assert.equal(resolveResidentAction({ ...base, status: 'draft', canOpen: all }), null);
});

test('registration is open only while it is on, in date and has room', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const config = { enabled: true, closes_at: null, capacity: null };
  assert.equal(isRegistrationOpen(config, 0, now), true);
  assert.equal(isRegistrationOpen({ ...config, enabled: false }, 0, now), false);
  assert.equal(isRegistrationOpen({ ...config, closes_at: '2026-10-09T00:00:00Z' }, 0, now), false);
  assert.equal(isRegistrationOpen({ ...config, closes_at: '2026-10-11T00:00:00Z' }, 0, now), true);
  assert.equal(isRegistrationOpen({ ...config, capacity: 10 }, 10, now), false);
  assert.equal(isRegistrationOpen({ ...config, capacity: 10 }, 9, now), true);
});

test('hero artwork follows the template, and only a pre-template festival keeps the photograph', () => {
  assert.equal(artworkKeyFor({ templateKey: 'garba', eventType: 'cultural' }), 'garba');
  assert.equal(artworkKeyFor({ templateKey: 'cultural', eventType: 'cultural' }), 'cultural');
  assert.equal(artworkKeyFor({ templateKey: 'blank', eventType: 'custom' }), 'custom');
  assert.equal(artworkKeyFor({ templateKey: null, eventType: 'sports' }), 'sports');
  assert.equal(artworkKeyFor({}), 'custom');

  // The Ganesh Chaturthi this app was built for: no template, a festival.
  assert.equal(usesBundledPhoto({ templateKey: null, eventType: 'festival' }), true);
  assert.equal(usesBundledPhoto({}), true);
  // Everything made from a template - including a new Festival - gets artwork.
  assert.equal(usesBundledPhoto({ templateKey: 'festival', eventType: 'festival' }), false);
  assert.equal(usesBundledPhoto({ templateKey: 'garba', eventType: 'cultural' }), false);
  assert.equal(usesBundledPhoto({ templateKey: null, eventType: 'sports' }), false);
});
