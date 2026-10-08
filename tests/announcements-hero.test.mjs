import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cleanHeroOptions } from '../api/_lib/hero-options.ts';

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

test('hero options are clamped, trimmed and dropped when unusable', () => {
  assert.deepEqual(cleanHeroOptions({ focusX: 140, focusY: -5, hideTitle: true, subtitle: '  Navratri   special  ' }), {
    focusX: 100, focusY: 0, hideTitle: true, subtitle: 'Navratri special',
  });
  // A focal point is a pair: one half alone means nothing.
  assert.equal(cleanHeroOptions({ focusX: 10 }), null);
  assert.equal(cleanHeroOptions({ hideTitle: false, subtitle: '   ' }), null);
  assert.equal(cleanHeroOptions('x'), null);
  assert.equal(cleanHeroOptions(['a']), null);
  assert.equal(cleanHeroOptions({ subtitle: 'x'.repeat(500) }).subtitle.length, 90);
});

test('034 leaves existing announcements published and gives posts their defaults', async () => {
  const db = new PGlite();
  await db.exec(PRELUDE);
  await migrate(db, (f) => !f.startsWith('034') && !f.startsWith('035'));

  const { rows: [admin] } = await db.query(
    `insert into app_users(firebase_uid,email,full_name) values('admin','admin@test.local','Admin') returning id`,
  );
  const input = { societyName: 'Test society', eventName: 'Garba Night', startDate: '2099-10-17', endDate: '2099-10-17', eventType: 'cultural', templateKey: 'garba' };
  const modules = [{ page_key: 'dashboard', visibility: 'public', is_enabled: true }];
  const { rows: [event] } = await db.query(`select create_event_draft($1,$2,$3) id`, [admin.id, input, modules]);
  // A row written the way 029 allowed, before any of 034's columns existed.
  await db.query(`insert into event_announcements(event_id,tag,title,body) values($1,'Notice','Old','Body')`, [event.id]);

  await migrate(db, (f) => f.startsWith('034') || f.startsWith('035'));
  // Re-running is a no-op: the user applies these by hand and may repeat one.
  await migrate(db, (f) => f.startsWith('034') || f.startsWith('035'));

  const { rows: [old] } = await db.query(`select status, pinned, kind, published_at from event_announcements`);
  assert.deepEqual({ ...old }, { status: 'published', pinned: false, kind: 'message', published_at: null });

  await assert.rejects(
    db.query(`insert into event_announcements(event_id,tag,title,body,status) values($1,'x','y','z','bogus')`, [event.id]),
  );

  await db.query(`update events set hero_options = $2::jsonb where id = $1`, [event.id, JSON.stringify({ focusX: 20, focusY: 80 })]);
  const { rows: [hero] } = await db.query(`select hero_options from events where id=$1`, [event.id]);
  assert.deepEqual(hero.hero_options, { focusX: 20, focusY: 80 });
});
