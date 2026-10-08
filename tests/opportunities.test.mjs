import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function world() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const path of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = (await readFile(`supabase/migrations/${path}`, 'utf8')).replace('create extension if not exists "pgcrypto";', '');
    await db.exec(sql);
  }
  const users = (await db.query(`insert into app_users(firebase_uid,email,full_name) values('a','a@t.local','A'),('b','b@t.local','B'),('c','c@t.local','C') returning id`)).rows;
  const input = { societyName: 'S', eventName: 'E', startDate: '2099-10-17', endDate: '2099-10-17', eventType: 'cultural', templateKey: 'garba' };
  const event = (await db.query(`select create_event_draft($1,$2,$3) id`, [users[0].id, input, [{ page_key: 'dashboard', visibility: 'public', is_enabled: true }]])).rows[0].id;
  const make = async (kind, extra = {}) => (await db.query(
    `insert into event_opportunities(event_id,kind,title,slots,status,closes_at) values($1,$2,'Parking help',$3,$4,$5) returning id`,
    [event, kind, extra.slots ?? null, extra.status ?? 'open', extra.closesAt ?? null])).rows[0].id;
  const join = (opp, user, details = {}) => db.query('select * from join_opportunity($1,$2,$3,$4,$5)', [opp, user, details, 'note', '98xxxxxx00']).then((r) => r.rows[0]);
  return { db, users, event, make, join };
}

test('the last place goes to one person, joining twice is not an error, and a closed call refuses', async () => {
  const { db, users, make, join } = await world();
  const opp = await make('volunteer', { slots: 2 });

  const first = await join(opp, users[0].id);
  assert.equal(first.status, 'confirmed');
  const again = await join(opp, users[0].id, { changed: true });   // idempotent: an update
  assert.equal(again.id, first.id);
  assert.equal(again.details.changed, true);

  await join(opp, users[1].id);
  await assert.rejects(join(opp, users[2].id), /places for this are taken/);
  assert.equal((await db.query('select count(*)::int n from event_signups where opportunity_id=$1', [opp])).rows[0].n, 2);

  const closed = await make('volunteer', { status: 'closed' });
  await assert.rejects(join(closed, users[0].id), /closed/);
  const past = await make('volunteer', { closesAt: '2020-01-01T00:00:00Z' });
  await assert.rejects(join(past, users[0].id), /closed/);
});

test('a performance entry waits for approval, and a person can only be in once', async () => {
  const { db, users, make, join } = await world();
  const opp = await make('performance');
  const entry = await join(opp, users[1].id, { act: 'Garba medley', minutes: 6 });
  assert.equal(entry.status, 'pending');
  assert.equal(entry.details.act, 'Garba medley');
  await assert.rejects(db.query(`insert into event_signups(opportunity_id,event_id,user_id) values($1,$2,$3)`, [opp, entry.event_id, users[1].id]), /duplicate|unique/i);
});

test('039 adds the two columns and 040 removes sign-ups with their opportunity', async () => {
  const { db, event, users, make, join } = await world();
  await db.query(`update events set good_to_know=$2::jsonb where id=$1`, [event, JSON.stringify({ items: [{ title: 'Parking', text: 'East gate' }] })]);
  assert.equal((await db.query('select good_to_know from events where id=$1', [event])).rows[0].good_to_know.items[0].title, 'Parking');
  const opp = await make('volunteer');
  await join(opp, users[0].id);
  await db.query('delete from event_opportunities where id=$1', [opp]);
  assert.equal((await db.query('select 1 from event_signups')).rows.length, 0);
});
