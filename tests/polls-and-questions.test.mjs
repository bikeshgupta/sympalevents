import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  canSeeResults, cleanAskPayload, cleanPollPayload, isClosed, readPayload, sameOptions, tally,
} from '../api/_lib/announcement-payload.ts';

test('a poll is cleaned: ids kept or issued, blanks dropped, repeats and bad counts refused', () => {
  const poll = cleanPollPayload({ options: [{ label: ' Friday ' }, { label: '' }, { label: 'Saturday' }], showResults: 'always', closesAt: '2026-10-15T18:30:00Z' });
  assert.deepEqual(poll.options, [{ id: 'o1', label: 'Friday' }, { id: 'o2', label: 'Saturday' }]);
  assert.equal(poll.showResults, 'always');
  assert.equal(poll.closesAt, '2026-10-15T18:30:00.000Z');

  // An id already in use keeps pointing at the same choice when the wording is fixed.
  const fixed = cleanPollPayload({ options: [{ id: 'o2', label: 'Saturdy fixed' }, { label: 'Sunday' }] });
  assert.deepEqual(fixed.options, [{ id: 'o2', label: 'Saturdy fixed' }, { id: 'o1', label: 'Sunday' }]);

  assert.throws(() => cleanPollPayload({ options: [{ label: 'Only one' }] }), /at least 2/);
  assert.throws(() => cleanPollPayload({ options: Array.from({ length: 7 }, (_, i) => ({ label: `o${i}` })) }), /at most 6/);
  assert.throws(() => cleanPollPayload({ options: [{ label: 'Yes' }, { label: ' yes ' }] }), /same thing/);
  assert.throws(() => cleanPollPayload({ options: [{ label: 'a' }, { label: 'b' }], closesAt: 'not a date' }), /closing time/);
  // Anything unrecognised falls back to the cautious rule.
  assert.equal(cleanPollPayload({ options: [{ label: 'a' }, { label: 'b' }], showResults: 'whenever' }).showResults, 'after_vote');
  assert.equal(cleanAskPayload({ closesAt: null }).closesAt, null);
});

test('a stored payload that no longer validates is shown as empty, not as a failure', () => {
  assert.deepEqual(readPayload('poll', { options: [{ label: 'x' }] }), { options: [], showResults: 'after_vote', closesAt: null });
  assert.deepEqual(readPayload('message', { anything: 1 }), {});
});

test('who may see the counts is decided by the rule, and an organiser always may', () => {
  const rules = ['always', 'after_vote', 'after_close'];
  const view = (rule, who) => canSeeResults(rule, { isEditor: false, hasVoted: false, closed: false, ...who });
  assert.equal(view('always', {}), true);
  assert.equal(view('after_vote', {}), false);
  assert.equal(view('after_vote', { hasVoted: true }), true);
  assert.equal(view('after_vote', { closed: true }), true);
  assert.equal(view('after_close', { hasVoted: true }), false);
  assert.equal(view('after_close', { closed: true }), true);
  for (const rule of rules) assert.equal(view(rule, { isEditor: true }), true);
});

test('votes are counted per option, and an option that no longer exists counts for nothing', () => {
  const options = [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }];
  const counts = tally(options, ['o1', 'o1', 'o2', 'o9']);
  assert.deepEqual(counts.options.map((o) => o.votes), [2, 1]);
  assert.equal(counts.total, 3);
  assert.equal(sameOptions(options, [...options]), true);
  assert.equal(sameOptions(options, [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B!' }]), false);

  const now = new Date('2026-10-10T00:00:00Z');
  assert.equal(isClosed({ closesAt: null }, now), false);
  assert.equal(isClosed({ closesAt: '2026-10-09T00:00:00Z' }, now), true);
});

test('036 enforces one vote per person per poll, and the question rules', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const path of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = (await readFile(`supabase/migrations/${path}`, 'utf8')).replace('create extension if not exists "pgcrypto";', '');
    await db.exec(sql);
  }
  // Re-running is a no-op: these are applied by hand and may be repeated.
  await db.exec(await readFile('supabase/migrations/036_polls_and_questions.sql', 'utf8'));

  const { rows: [user] } = await db.query(`insert into app_users(firebase_uid,email,full_name) values('u1','u1@test.local','Asha') returning id`);
  const input = { societyName: 'S', eventName: 'E', startDate: '2099-10-17', endDate: '2099-10-17', eventType: 'cultural', templateKey: 'garba' };
  const { rows: [event] } = await db.query(`select create_event_draft($1,$2,$3) id`, [user.id, input, [{ page_key: 'dashboard', visibility: 'public', is_enabled: true }]]);
  const { rows: [poll] } = await db.query(
    `insert into event_announcements(event_id,tag,title,body,kind,payload) values($1,'Poll','Which day?','','poll',$2::jsonb) returning id`,
    [event.id, JSON.stringify({ options: [{ id: 'o1', label: 'Fri' }, { id: 'o2', label: 'Sat' }], showResults: 'after_vote', closesAt: null })],
  );

  await db.query(`insert into announcement_poll_votes(announcement_id,user_id,option_id) values($1,$2,'o1')`, [poll.id, user.id]);
  await assert.rejects(db.query(`insert into announcement_poll_votes(announcement_id,user_id,option_id) values($1,$2,'o2')`, [poll.id, user.id]), /duplicate key|unique/i);
  // ... and a change of mind is an upsert on that same key.
  await db.query(
    `insert into announcement_poll_votes(announcement_id,user_id,option_id) values($1,$2,'o2')
     on conflict (announcement_id,user_id) do update set option_id=excluded.option_id`, [poll.id, user.id]);
  const { rows: votes } = await db.query(`select option_id from announcement_poll_votes where announcement_id=$1`, [poll.id]);
  assert.deepEqual(votes.map((v) => v.option_id), ['o2']);

  const { rows: [ask] } = await db.query(`insert into event_announcements(event_id,tag,title,body,kind,payload) values($1,'Ask','Ask us','','ask','{}') returning id`, [event.id]);
  const q = (body, status = 'pending') => db.query(
    `insert into announcement_questions(announcement_id,event_id,user_id,body,status) values($1,$2,$3,$4,$5) returning id,anonymous,status`,
    [ask.id, event.id, user.id, body, status]);
  const { rows: [question] } = await q('Is there parking?');
  assert.equal(question.anonymous, true);   // anonymous unless they say otherwise
  assert.equal(question.status, 'pending'); // nothing is public until an organiser acts
  await assert.rejects(q('hi'), /check/i);  // too short
  await assert.rejects(q('x'.repeat(501)), /check/i);
  await assert.rejects(q('Fine question', 'live'), /check/i);

  await db.query(`insert into announcement_question_votes(question_id,user_id) values($1,$2)`, [question.id, user.id]);
  await assert.rejects(db.query(`insert into announcement_question_votes(question_id,user_id) values($1,$2)`, [question.id, user.id]));

  // Deleting the post takes its votes and questions with it.
  await db.query(`delete from event_announcements where id=$1`, [poll.id]);
  assert.equal((await db.query(`select 1 from announcement_poll_votes`)).rows.length, 0);
});
