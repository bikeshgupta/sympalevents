import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function setup() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for (const path of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
  // PGlite provides gen_random_uuid in core; the production pgcrypto extension isn't needed here.
  const sql=(await readFile(`supabase/migrations/${path}`,'utf8')).replace('create extension if not exists "pgcrypto";','');
  try { await db.exec(sql); } catch(e) { throw new Error(`${path}: ${e.message}`,{cause:e}); }
 }
 const users=(await db.query(`insert into app_users(firebase_uid,email,full_name) values('admin','admin@test.local','Admin'),('resident','resident@test.local','Resident'),('outsider','outsider@test.local','Outsider') returning id`)).rows;
 const input={societyName:'Test society',eventName:'Garba Night',startDate:'2099-10-17',endDate:'2099-10-17',startTime:'19:00',endTime:'23:00',eventType:'cultural',templateKey:'garba'};
 const modules=[{page_key:'dashboard',visibility:'public',is_enabled:true},{page_key:'registration',visibility:'public',is_enabled:true}];
 const event=(await db.query(`select create_event_draft($1,$2,$3) id`,[users[0].id,input,modules])).rows[0].id;
 const config={enabled:true,self_service:false,audience:'society',adult_price:60000,child_price:0,child_age_limit:18,food_enabled:true,food_price:20000,allow_guests:true,capacity:6,closes_at:null,payment_instructions:'Pay via UPI to the organiser',cancellation_policy:'Contact organiser'};
 await db.query('select save_registration_settings($1,$2)',[event,config]);
 const book=(overrides={},user=users[0].id,manager=true)=>db.query('select * from book_event($1,$2,$3,$4)',[event,user,manager,{contact_name:'Bikesh',flat:'D104',adults:1,children:0,guests:0,food_count:0,on_behalf:true,idempotency_key:crypto.randomUUID(),...overrides}]).then(r=>r.rows[0]);
 const action=(r,act,value='',manager=true,user=users[0].id)=>db.query('select * from update_event_registration($1,$2,$3,$4,$5,$6,$7)',[event,r.id,user,manager,act,r.version,value]).then(r=>r.rows[0]);
 return {db,users,event,config,book,action};
}

test('Garba lifecycle, minimal admin entry, capacity, payment, admission and refunds',async()=>{
 const {db,users,event,config,book,action}=await setup();
 try {
  assert.equal((await db.query('select status_override from events where id=$1',[event])).rows[0].status_override,'draft');
  await assert.rejects(book({on_behalf:false},users[1].id,false),/contact the organiser/);
  await db.query("select set_event_publication($1,'publish')",[event]);
  await assert.rejects(book({on_behalf:false},users[1].id,false),/contact the organiser/);
  await assert.rejects(book({},users[1].id,false),/Organiser access/);
  const key=crypto.randomUUID();
  let r=await book({idempotency_key:key}); assert.equal(r.adults,1); assert.equal(r.user_id,null); assert.equal(r.amount_due,60000);
  r=await action(r,'edit',JSON.stringify({contact_name:'Bikesh Gupta',flat:'D104',adults:1,children:0,guests:0,food_count:0}));assert.equal(r.contact_name,'Bikesh Gupta');
  const retry=await book({idempotency_key:key}); assert.equal(retry.id,r.id);
  let family=await book({contact_name:'Family',flat:'B201',adults:2,children:2,food_count:3}); assert.equal(family.amount_due,180000);
  await assert.rejects(book({adults:2}),/Not enough places/);
  await assert.rejects(db.query('select save_registration_settings($1,$2)',[event,{...config,capacity:2}]),/below existing/);
  await assert.rejects(action(r,'check_in','1'),/Confirm payment/);
  await assert.rejects(action(r,'verify'),/Only submitted/);
  await assert.rejects(action(r,'cancel','',false,users[2].id),/not found/);
  r=await action(r,'submit_payment','UPI-001');
  await assert.rejects(action(r,'verify','',false,users[2].id),/not found/);
  r=await action(r,'verify'); const stale=r;
  r=await action(r,'check_in','1'); assert.equal(r.checked_in_count,1);
  await assert.rejects(action(stale,'check_in','1'),/changed/);
  await assert.rejects(action(r,'check_in','2'),/Invalid check-in/);
  await assert.rejects(action(r,'cancel'),/cannot be cancelled/);
  family=await action(family,'submit_payment','UPI-FAMILY');family=await action(family,'verify');
  await assert.rejects(action(family,'serve_food','1'),/Check in attendees/);
  family=await action(family,'check_in','2');family=await action(family,'serve_food','2');assert.equal(family.food_served_count,2);
  await assert.rejects(action(family,'serve_food','3'),/Check in attendees/);
  await db.query('select save_registration_settings($1,$2)',[event,{...config,adult_price:70000}]);
  assert.equal((await db.query('select amount_due from event_registrations where id=$1',[r.id])).rows[0].amount_due,60000);
  const summary=(await db.query('select event_registration_summary($1) value',[event])).rows[0].value;
  assert.equal(summary.attendees,5);assert.equal(summary.verifiedAmount,240000);assert.equal(summary.checkedIn,3);
  await db.query("select set_event_publication($1,'cancel')",[event]);
  const cancelled=(await db.query('select * from event_registrations where id=$1',[r.id])).rows[0];assert.equal(cancelled.payment_status,'refund_pending');
  const refunded=await action(cancelled,'refund');assert.equal(refunded.payment_status,'refunded');
  await assert.rejects(book(),/Registration is closed/);
  await assert.rejects(db.query("select set_event_publication($1,'draft')",[event]),/cannot return to draft/);
  // No anonymous or Supabase-authenticated client may call privileged RPCs.
  const permissions=(await db.query("select has_function_privilege('anon','public.book_event(uuid,uuid,boolean,jsonb)','execute') allowed")).rows[0];assert.equal(permissions.allowed,false);
 } finally {await db.close();}
});

test('self registration is optional, membership scoped, and free entry needs no payment',async()=>{
 const {db,users,event,config,book,action}=await setup();
 try {
  await db.query("select set_event_publication($1,'publish')",[event]);
  await db.query('select save_registration_settings($1,$2)',[event,{...config,self_service:true,adult_price:0,food_enabled:false}]);
  await assert.rejects(book({on_behalf:false},users[1].id,false),/Join this society/);
  await db.query("insert into organization_members(organization_id,user_id,role) select organization_id,$2,'read_only' from events where id=$1",[event,users[1].id]);
  let r=await book({on_behalf:false},users[1].id,false);assert.equal(r.payment_status,'free');assert.equal(r.amount_due,0);
  await assert.rejects(book({on_behalf:false},users[1].id,false),/duplicate key/);
  await assert.rejects(book({food_count:1}),/Food booking/);
  r=await action(r,'cancel','',false,users[1].id);assert.equal(r.status,'cancelled');
  const again=await book({on_behalf:false},users[1].id,false);assert.notEqual(again.id,r.id);
 }finally{await db.close();}
});
