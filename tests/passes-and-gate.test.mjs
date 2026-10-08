import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const PRELUDE = `create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;

async function migrate(db, keep) {
  for (const path of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    if (!keep(path)) continue;
    const sql = (await readFile(`supabase/migrations/${path}`, 'utf8')).replace('create extension if not exists "pgcrypto";', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${path}: ${e.message}`, { cause: e }); }
  }
}

async function world(skip037 = false) {
  const db = new PGlite();
  await db.exec(PRELUDE);
  await migrate(db, (f) => !(skip037 && f.startsWith('037')));
  const users = (await db.query(`insert into app_users(firebase_uid,email,full_name) values('a','a@t.local','Admin'),('g','g@t.local','Gate') returning id`)).rows;
  const input = { societyName: 'S', eventName: 'Garba', startDate: '2099-10-17', endDate: '2099-10-17', eventType: 'cultural', templateKey: 'garba' };
  const modules = [{ page_key: 'dashboard', visibility: 'public', is_enabled: true }, { page_key: 'registration', visibility: 'public', is_enabled: true }];
  const event = (await db.query(`select create_event_draft($1,$2,$3) id`, [users[0].id, input, modules])).rows[0].id;
  const config = { enabled: true, self_service: false, audience: 'society', adult_price: 60000, child_price: 0, child_age_limit: 18, food_enabled: true, food_price: 20000, allow_guests: false, capacity: 5, closes_at: null, payment_instructions: 'Pay via UPI to the organiser', cancellation_policy: '' };
  await db.query('select save_registration_settings($1,$2)', [event, config]);
  await db.query("select set_event_publication($1,'publish')", [event]);
  const book = (o = {}) => db.query('select * from book_event($1,$2,$3,$4)', [event, users[0].id, true, { contact_name: 'Bikesh', flat: 'D104', adults: 1, children: 0, guests: 0, food_count: 0, on_behalf: true, idempotency_key: crypto.randomUUID(), ...o }]).then((r) => r.rows[0]);
  return { db, users, event, config, book };
}

test('037 gives every booking, old and new, its own pass token and a readable code', async () => {
  const { db, event, users } = await world(true);
  const old = await (async () => (await db.query('select * from book_event($1,$2,$3,$4)', [event, users[0].id, true, { contact_name: 'Old', flat: 'A1', adults: 1, children: 0, guests: 0, food_count: 0, on_behalf: true, idempotency_key: crypto.randomUUID() }])).rows[0])();
  assert.equal('pass_token' in old, false);

  await migrate(db, (f) => f.startsWith('037'));
  await migrate(db, (f) => f.startsWith('037')); // re-runnable

  const { rows } = await db.query('select id,pass_token,booking_code from event_registrations');
  assert.equal(rows.length, 1);
  assert.match(rows[0].pass_token, /^[0-9a-f]{32}$/);
  assert.equal(rows[0].booking_code, rows[0].id.slice(0, 8).toUpperCase());

  const { rows: more } = await db.query(`select * from book_event($1,$2,$3,$4)`, [event, users[0].id, true, { contact_name: 'New', flat: 'B2', adults: 1, children: 0, guests: 0, food_count: 0, on_behalf: true, idempotency_key: crypto.randomUUID() }]);
  assert.notEqual(more[0].pass_token, rows[0].pass_token);
  // The token is not derived from anything visible on the pass.
  assert.ok(!more[0].pass_token.includes(more[0].id.replace(/-/g, '').slice(0, 12)));
});

test('the gate: payment warning, authorised override, idempotent repeats, food only after entry', async () => {
  const { db, users, event, book } = await world();
  const a = users[0].id;
  let r = await book({ adults: 2, children: 1, food_count: 2 });
  assert.equal(r.payment_status, 'unpaid');

  await assert.rejects(db.query('select * from gate_check_in($1,$2,$3,$4,$5,$6)', [event, r.id, a, 3, false, r.version]), /Payment is not confirmed/);

  // An authorised override admits, and says so in the history.
  r = (await db.query('select * from gate_check_in($1,$2,$3,$4,$5,$6)', [event, r.id, a, 2, true, r.version])).rows[0];
  assert.equal(r.checked_in_count, 2);
  assert.equal((await db.query(`select action from event_registration_history where registration_id=$1 order by id desc limit 1`, [r.id])).rows[0].action, 'check_in_unpaid');

  // Scanning the same pass again - even with the old version - shows the booking as it is.
  const again = (await db.query('select * from gate_check_in($1,$2,$3,$4,$5,$6)', [event, r.id, a, 2, false, 1])).rows[0];
  assert.equal(again.checked_in_count, 2);
  assert.equal(again.version, r.version);

  await assert.rejects(db.query('select * from gate_check_in($1,$2,$3,$4,$5,$6)', [event, r.id, a, 9, true, r.version]), /Invalid check-in count/);

  // Meals: only for people already inside, and only as many as were booked.
  await assert.rejects(db.query('select * from gate_serve_food($1,$2,$3,$4,$5,$6)', [event, r.id, a, 3, true, r.version]), /Check in attendees/);
  r = (await db.query('select * from gate_serve_food($1,$2,$3,$4,$5,$6)', [event, r.id, a, 2, true, r.version])).rows[0];
  assert.equal(r.food_served_count, 2);

  // Cash at the gate settles the payment and reads differently in the history.
  const unpaid = await book({ contact_name: 'Cash', flat: 'C3' });
  const paid = (await db.query('select * from gate_cash_received($1,$2,$3,$4)', [event, unpaid.id, a, unpaid.version])).rows[0];
  assert.equal(paid.payment_status, 'verified');
  assert.equal((await db.query(`select action from event_registration_history where registration_id=$1 order by id desc limit 1`, [unpaid.id])).rows[0].action, 'cash_received');
});

test('walk-ins work after the deadline, respect capacity, and are idempotent', async () => {
  const { db, users, event, config } = await world();
  const a = users[0].id;
  // The registration deadline has passed - which is exactly when walk-ins happen.
  await db.query('select save_registration_settings($1,$2)', [event, { ...config, closes_at: '2020-01-01T00:00:00Z' }]);
  await assert.rejects(db.query('select * from book_event($1,$2,$3,$4)', [event, a, true, { contact_name: 'Late', flat: 'E5', adults: 1, children: 0, guests: 0, food_count: 0, on_behalf: true, idempotency_key: crypto.randomUUID() }]), /deadline/);

  const key = crypto.randomUUID();
  const walk = (extra = {}, k = key) => db.query('select * from gate_walk_in($1,$2,$3)', [event, a, { contact_name: 'Walk In', flat: 'E5', adults: 2, idempotency_key: k, ...extra }]).then((r) => r.rows[0]);
  const first = await walk();
  assert.equal(first.is_walk_in, true);
  assert.equal(first.amount_due, 120000);
  assert.equal((await walk()).id, first.id); // the same tap twice is one booking

  await walk({ adults: 3 }, crypto.randomUUID()); // 5 of 5 places
  await assert.rejects(walk({ adults: 1 }, crypto.randomUUID()), /Not enough places/);
});
