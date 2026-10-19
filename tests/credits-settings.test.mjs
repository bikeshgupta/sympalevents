import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCreditsSettings,
  creditGroupKeys,
  creditKey,
  defaultCreditsSettings,
  groupBlurb,
  groupTitle,
  isDefaultCreditsSettings,
  visibleNames,
  visiblePeople,
  visiblePrasad,
} from '../shared/credits-settings.ts';

test('anything that is not an object cleans to the default', () => {
  for (const value of [null, undefined, 'x', 3, [], true]) {
    assert.deepEqual(cleanCreditsSettings(value), defaultCreditsSettings());
  }
  assert.equal(isDefaultCreditsSettings(cleanCreditsSettings(null)), true);
});

test('the order keeps every group once, and a forgotten group goes last', () => {
  const settings = cleanCreditsSettings({ order: ['contributors', 'core', 'contributors', 'nonsense'] });
  assert.deepEqual(settings.order, ['contributors', 'core', 'volunteers', 'prasad', 'sponsors']);
  assert.equal(new Set(settings.order).size, creditGroupKeys.length);
});

test('text is squashed and capped, so a hand-edited row cannot flood the page', () => {
  const settings = cleanCreditsSettings({
    heading: '  Thank   you  ',
    groups: { core: { title: 'x'.repeat(500), blurb: '  a \n b ' } },
  });
  assert.equal(settings.heading, 'Thank you');
  assert.equal(settings.groups.core.title.length, 60);
  assert.equal(settings.groups.core.blurb, 'a b');
});

test('blank titles fall back to the defaults', () => {
  const settings = cleanCreditsSettings({ groups: { volunteers: { title: 'Helpers' } } });
  assert.equal(groupTitle(settings, 'volunteers'), 'Helpers');
  assert.equal(groupTitle(settings, 'core'), 'Core committee');
  assert.match(groupBlurb(settings, 'prasad'), /order it was served/);
});

test('extra names are kept only where the editor offers them', () => {
  const settings = cleanCreditsSettings({
    groups: { core: { extraNames: ['A'] }, sponsors: { extraNames: ['Om Sweets', 'om sweets', ''] } },
  });
  assert.deepEqual(settings.groups.core.extraNames, []);
  assert.deepEqual(settings.groups.sponsors.extraNames, ['Om Sweets']);
});

test('hiding is by name, and by name and flat where a group has flats', () => {
  assert.equal(creditKey('  Mohit  Nagar '), 'mohit nagar');
  assert.equal(creditKey('Sharma', 'B-402'), 'sharma|b-402');
  const group = cleanCreditsSettings({ groups: { core: { hiddenNames: ['MOHIT NAGAR'] } } }).groups.core;
  assert.deepEqual(visibleNames(['Mohit Nagar', 'Mansi Gupta'], group), ['Mansi Gupta']);

  const people = [
    { name: 'Sharma', flat: 'B-402' },
    { name: 'Sharma', flat: 'C-101' },
  ];
  const contributors = cleanCreditsSettings({
    groups: { contributors: { hiddenNames: [creditKey('Sharma', 'B-402')], extraNames: ['Temple trust'] } },
  }).groups.contributors;
  assert.deepEqual(
    visiblePeople(people, contributors, (name) => ({ name, flat: '' })),
    [{ name: 'Sharma', flat: 'C-101' }, { name: 'Temple trust', flat: '' }],
  );
});

test('a prasad dish with every sponsor hidden drops out', () => {
  const group = cleanCreditsSettings({ groups: { prasad: { hiddenNames: ['patel'] } } }).groups.prasad;
  const entries = [
    { item: 'Modak', sponsors: ['Patel'] },
    { item: 'Pedha', sponsors: ['Patel', 'Iyer'] },
  ];
  assert.deepEqual(visiblePrasad(entries, group), [{ item: 'Pedha', sponsors: ['Iyer'] }]);
});
