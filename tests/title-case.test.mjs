import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../src/lib/title-case.ts';

test('every word starts with a capital, whatever case it was typed in', () => {
  assert.equal(titleCase('budget'), 'Budget');
  assert.equal(titleCase('get involved'), 'Get Involved');
  assert.equal(titleCase('Running order'), 'Running Order');
  assert.equal(titleCase('photos & reviews'), 'Photos & Reviews');
  assert.equal(titleCase('Command centre'), 'Command Centre');
});

test('the rest of a word is left as typed', () => {
  assert.equal(titleCase('UPI payments'), 'UPI Payments');
  assert.equal(titleCase('iPhone corner'), 'iPhone Corner');
  assert.equal(titleCase('Expense Ledger'), 'Expense Ledger');
  assert.equal(titleCase('walk-in desk'), 'Walk-in Desk');
});

test('punctuation and numbers are respected', () => {
  assert.equal(titleCase('helpers (optional)'), 'Helpers (Optional)');
  assert.equal(titleCase('2nd innings'), '2nd Innings');
  assert.equal(titleCase('  spaced   out '), '  Spaced   Out ');
  assert.equal(titleCase(''), '');
});

test('letters beyond English are capitalised too', () => {
  assert.equal(titleCase('éclairs and ice cream'), 'Éclairs And Ice Cream');
});
