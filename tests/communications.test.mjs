import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, hasPlaceholder } from '../src/lib/message-templates.ts';

const ctx = {
  eventName: 'Garba & Dandiya Night', when: 'Sat, 17 Oct', time: '7:00 pm', venue: 'Clubhouse lawn',
  registerLink: 'https://x.test/e/1/registration', eventLink: 'https://x.test/e/1',
  paymentInstructions: 'UPI: tru@bank', deadline: '14 Oct, 6:00 pm',
};

test('messages carry the event facts and links, and never a recipient', () => {
  const reg = buildMessage('registration_reminder', ctx);
  assert.ok(reg.includes('Garba & Dandiya Night') && reg.includes('Sat, 17 Oct · 7:00 pm · Clubhouse lawn'));
  assert.ok(reg.includes(ctx.registerLink) && reg.includes('closes 14 Oct, 6:00 pm'));

  const pay = buildMessage('payment_reminder', ctx);
  assert.ok(pay.includes('UPI: tru@bank') && pay.includes(ctx.registerLink));
  // No salutation by name, no flat, no household.
  for (const text of [reg, pay, buildMessage('volunteer_request', ctx), buildMessage('schedule_update', ctx)]) {
    assert.ok(!/flat\s+[A-Z]\d|dear\s+\w+/i.test(text.replace('name and flat number', '')), text);
  }
});

test('missing facts leave no dangling lines, and a custom message starts empty', () => {
  const bare = buildMessage('registration_reminder', { ...ctx, deadline: '', venue: '', time: '' });
  assert.ok(!/closes/.test(bare));
  assert.ok(!/\n\n\n/.test(bare));
  const noInstructions = buildMessage('payment_reminder', { ...ctx, paymentInstructions: '', deadline: '' });
  assert.ok(!/How to pay/.test(noInstructions));
  assert.equal(buildMessage('custom', ctx), '');
});

test('a message still holding its blank is flagged as unfinished', () => {
  assert.equal(hasPlaceholder(buildMessage('schedule_update', ctx)), true);
  assert.equal(hasPlaceholder('Parking opens at 6 pm.'), false);
});

import { inSegment } from '../api/_lib/audiences.ts';

test('each audience means one thing', () => {
  const row = (o) => ({ flat: 'D104', payment_status: 'unpaid', food_count: 0, checked_in_count: 0, ...o });
  assert.equal(inSegment('payment_pending', row({})), true);
  assert.equal(inSegment('payment_pending', row({ payment_status: 'submitted' })), false);
  assert.equal(inSegment('payment_submitted', row({ payment_status: 'submitted' })), true);
  assert.equal(inSegment('food_booked', row({ food_count: 2 })), true);
  assert.equal(inSegment('food_booked', row({})), false);
  // Paid and not through the door - who to nudge on the day.
  assert.equal(inSegment('not_arrived', row({ payment_status: 'verified' })), true);
  assert.equal(inSegment('not_arrived', row({ payment_status: 'verified', checked_in_count: 1 })), false);
  assert.equal(inSegment('not_arrived', row({ payment_status: 'unpaid' })), false);
  // "Everyone" is the society group, which this app has no list of.
  assert.equal(inSegment('everyone', row({})), false);
});
