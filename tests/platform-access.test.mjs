import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, checkPlatformAccess, parsePlatformAdminIds } from '../shared/platform-access.ts';

const OWNER = '6f1c2a90-3b7e-4d1a-9c55-0e2f4a1b7c11';
const OTHER = '0a9d8e7f-1234-4bcd-8ef0-123456789abc';

/** Fakes that record what was called, so a test can prove the database was not touched. */
function deps({ admins = OWNER, token = 'good', uid = 'firebase-owner', userId = OWNER, verifyThrows = false, findThrows = false } = {}) {
  const calls = { verify: 0, find: 0 };
  return {
    calls,
    value: {
      token,
      admins: parsePlatformAdminIds(admins),
      verify: async () => { calls.verify++; if (verifyThrows) throw new Error('expired'); return { uid }; },
      findUserId: async () => { calls.find++; if (findThrows) throw new Error('db down'); return userId; },
    },
  };
}

test('the allowlist keeps valid ids only, lower-cased, whatever separates them', () => {
  const ids = parsePlatformAdminIds(` "${OWNER.toUpperCase()}, ${OTHER}\nnot-an-id ,, admin@example.com" `);
  assert.deepEqual([...ids].sort(), [OWNER, OTHER].sort());
  assert.equal(parsePlatformAdminIds(undefined).size, 0);
  assert.equal(parsePlatformAdminIds('').size, 0);
  assert.equal(parsePlatformAdminIds('bikesh@example.com').size, 0, 'an email is never an id');
});

test('a bearer token is read only from a Bearer header', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def');
  assert.equal(bearerToken('Bearer   '), null);
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken(undefined), null);
});

test('the listed owner with a valid token is let in', async () => {
  const d = deps();
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: true, userId: OWNER });
});

test('nobody is let in when no admin is configured, and nothing is looked up', async () => {
  const d = deps({ admins: '' });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'no_admins_configured' });
  assert.deepEqual(d.calls, { verify: 0, find: 0 });
});

test('no token is refused before any verification or lookup', async () => {
  const d = deps({ token: null });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'no_token' });
  assert.deepEqual(d.calls, { verify: 0, find: 0 });
});

test('an invalid or expired token is refused without a lookup', async () => {
  const d = deps({ verifyThrows: true });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'bad_token' });
  assert.equal(d.calls.find, 0);
});

test('a valid token with no app_users row is refused (the guard never creates one)', async () => {
  const d = deps({ userId: null });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'no_user' });
});

test('a signed-in person who is not listed is refused, whatever their society role', async () => {
  const d = deps({ userId: OTHER });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'not_listed', userId: OTHER });
});

test('a failing lookup refuses rather than letting anyone through', async () => {
  const d = deps({ findThrows: true });
  assert.deepEqual(await checkPlatformAccess(d.value), { ok: false, reason: 'error' });
});

test('ids are compared without regard to case', async () => {
  const d = deps({ admins: OWNER.toUpperCase(), userId: OWNER });
  assert.equal((await checkPlatformAccess(d.value)).ok, true);
});
