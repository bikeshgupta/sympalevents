import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklist, progress } from '../src/lib/your-event.ts';

const reg = (o = {}) => ({ enabled: true, selfService: true, mine: null, ...o });
const mine = (o = {}) => ({ status: 'active', paymentStatus: 'unpaid', amountDue: 80000, ...o });
const base = { signedIn: true, unvotedPolls: [] };

test('somebody signed out has no checklist', () => {
  assert.deepEqual(buildChecklist({ ...base, signedIn: false, registration: reg() }), []);
});

test('not registered, registered and unpaid, paid: each says the next thing to do', () => {
  assert.deepEqual(buildChecklist({ ...base, registration: reg() }).map((i) => [i.key, i.done, i.cta]), [['register', false, 'Register']]);
  assert.equal(buildChecklist({ ...base, registration: reg({ selfService: false }) })[0].cta, 'How to register');

  const unpaid = buildChecklist({ ...base, registration: reg({ mine: mine() }) });
  assert.deepEqual(unpaid.map((i) => [i.key, i.done]), [['register', true], ['pay', false]]);
  assert.equal(unpaid[1].label, 'Pay ₹800');
  assert.equal(unpaid[1].page, 'registration');

  const waiting = buildChecklist({ ...base, registration: reg({ mine: mine({ paymentStatus: 'submitted' }) }) });
  assert.equal(waiting[1].label, 'Payment submitted');
  assert.equal(waiting[1].cta, undefined); // nothing for them to do

  const paid = buildChecklist({ ...base, registration: reg({ mine: mine({ paymentStatus: 'verified' }) }) });
  assert.deepEqual(paid.map((i) => [i.key, i.done]), [['register', true], ['pay', true], ['pass', true]]);
  assert.equal(paid[2].page, 'pass');
  assert.deepEqual(progress(paid), { done: 3, total: 3 });
});

test('free entry has no payment line, and a cancelled booking counts as none', () => {
  const free = buildChecklist({ ...base, registration: reg({ mine: mine({ paymentStatus: 'free', amountDue: 0 }) }) });
  assert.deepEqual(free.map((i) => i.key), ['register', 'pass']);
  assert.equal(buildChecklist({ ...base, registration: reg({ mine: mine({ status: 'cancelled' }) }) })[0].key, 'register');
  assert.equal(buildChecklist({ ...base, registration: reg({ enabled: false }) }).length, 0);
});

test('open polls are asked about, two at most, and "lend a hand" is a nudge not a to-do', () => {
  const polls = [{ id: 'a', title: 'Prize day?' }, { id: 'b', title: 'Menu?' }, { id: 'c', title: 'Third' }];
  const items = buildChecklist({ ...base, registration: reg({ mine: mine({ paymentStatus: 'verified' }) }), unvotedPolls: polls, openOpportunities: 3 });
  assert.equal(items.filter((i) => i.key.startsWith('poll:')).length, 2);
  const nudge = items.find((i) => i.key === 'involved');
  assert.equal(nudge.optional, true);
  // 3 done (registered, paid, pass), 2 polls open: the nudge is not in the total.
  assert.deepEqual(progress(items), { done: 3, total: 5 });
});
