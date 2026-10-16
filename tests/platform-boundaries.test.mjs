import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { persistedRoots } from '../src/lib/query-persist.ts';

/**
 * The Platform Control Center's rules that a careless edit could break without any test failing elsewhere.
 * See docs/platform-control-center.md.
 */

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const readOnlyFiles = ['platform.ts', 'platform-reads.ts', 'platform-activity.ts', 'platform-analytics.ts', 'platform-monitoring.ts'].map((name) => join('api', '_lib', name));
const platformApi = readOnlyFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const platformCode = platformApi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const platformFolder = join('src', 'features', 'platform') + sep;

test('nothing outside the platform area links to it', () => {
  const offenders = walk('src')
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.startsWith(platformFolder) && file !== join('src', 'app.tsx'))
    .filter((file) => /["'`]\/platform/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, [], `these files link to /platform: ${offenders.join(', ')}`);
});

test('only the route table touches the platform folder, and only through the small gate', () => {
  const importers = walk('src')
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.startsWith(platformFolder))
    .filter((file) => readFileSync(file, 'utf8').includes('features/platform/'));
  assert.deepEqual(importers, [join('src', 'app.tsx')]);
  const app = readFileSync('src/app.tsx', 'utf8');
  assert.match(app, /from "@\/features\/platform\/platform-gate"/);
  assert.doesNotMatch(app, /platform-app/, 'the Control Center itself must stay a lazy chunk');
  assert.match(readFileSync('src/features/platform/platform-gate.tsx', 'utf8'), /lazy\(\(\) => import\("\.\/platform-app"\)/);
});

test('the platform API is read-only and never upserts the caller', () => {
  for (const call of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'requireAppUser(']) {
    assert.ok(!platformCode.includes(call), `the platform API must not call ${call}`);
  }
});

test('the platform API names its columns and never selects private ones', () => {
  assert.doesNotMatch(platformCode, /\.select\(\s*["'`]\*/, 'no select("*")');
  const literals = [
    ...[...platformCode.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]),
    ...[...platformCode.matchAll(/(?:timeColumn|column):\s*"([^"]*)"/g)].map((m) => m[1]),
    ...[...platformCode.matchAll(/Columns = \[([^\]]*)\]/g)].map((m) => m[1].replace(/["\s]/g, '')),
  ];
  assert.ok(literals.length > 5, 'found the selected columns');
  const forbidden = /\b(phone|flat|share_token|pass_token|contact_name|payment_reference)\b/;
  const offenders = literals.filter((columns) => forbidden.test(columns));
  assert.deepEqual(offenders, [], `private columns selected: ${offenders.join(' | ')}`);
});

test('access is decided before any part runs, and refusals are a plain 404', () => {
  const check = platformCode.indexOf('checkPlatformAccess(');
  const run = platformCode.indexOf('parts[part](');
  assert.ok(check > 0 && run > check, 'checkPlatformAccess must come before the part is run');
  const refusal = platformCode.match(/if \(!access\.ok\) \{([\s\S]*?)\n    \}\n/);
  assert.ok(refusal, 'found the refusal block');
  assert.match(refusal[1], /return sendJson\(res, 404, platformNotFoundBody\);\s*$/, 'the block ends in the one plain 404');
  assert.doesNotMatch(refusal[1], /sendJson\(res, (?!404)/, 'no other answer is sent from a refusal');
  assert.match(readFileSync('api/events.ts', 'utf8'), /resource === "platform"\) return handlePlatform\(req, res\)/);
});

test('platform answers are never kept in localStorage', () => {
  assert.ok(!persistedRoots.has('platform'));
  const api = readFileSync('src/features/platform/platform-api.ts', 'utf8');
  const keys = [...api.matchAll(/queryKey: \[\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 2 && keys.every((key) => key === 'platform'), `platform query keys: ${keys.join(', ')}`);
});

test('the access log is the only thing the platform area writes, and only to its own table', () => {
  const writer = readFileSync('api/_lib/platform-access-log.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal([...writer.matchAll(/\.insert\(/g)].length, 1, 'exactly one insert');
  for (const call of ['.update(', '.upsert(', '.delete(', '.rpc(', 'requireAppUser(']) assert.ok(!writer.includes(call), `the access log must not call ${call}`);
  const tables = new Set([...writer.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...tables], ['platform_access_log']);
  assert.doesNotMatch(writer, /ip|user_agent|authorization|token|email/i, 'nothing identifying is written');
  const importers = walk('api').filter((file) => file !== join('api', '_lib', 'platform-access-log.ts') && readFileSync(file, 'utf8').includes('platform-access-log'));
  assert.deepEqual(importers, [join('api', '_lib', 'platform.ts')], 'only the platform handler records access');
  // It only ever records a verified, signed-in account: both calls pass a user id, never a request value raw.
  const handler = platformCode;
  assert.equal([...handler.matchAll(/recordPlatformAccess\(/g)].length, 2, 'one allowed, one refused');
  assert.match(handler, /reason === "not_listed" && access\.userId/);
});

test('migration 047 keeps nothing identifying and is closed to browsers', () => {
  const sql = readFileSync('supabase/migrations/047_platform_access_log.sql', 'utf8').replace(/--.*$/gm, '');
  assert.match(sql, /alter table public\.platform_access_log enable row level security/);
  assert.doesNotMatch(sql, /create policy/i, 'RLS on with zero policies');
  const columns = sql.slice(sql.indexOf('create table'), sql.indexOf(');', sql.indexOf('create table')));
  assert.doesNotMatch(columns, /\b(ip|ip_address|user_agent|agent|email|token|authorization)\b/i);
  assert.match(columns, /reason text not null check \(reason ~ /, 'reason is held to a fixed shape');
  assert.match(sql, /begin;[\s\S]*commit;/);
});

test('the monitoring client only reads, and never exposes its token', () => {
  const file = 'api/_lib/platform-monitoring.ts';
  let code;
  try { code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); } catch { return; }
  assert.doesNotMatch(code, /method:\s*["'](POST|PUT|PATCH|DELETE)/i, 'GET only');
  assert.doesNotMatch(code, /console\.(log|warn|error)\([^)]*(token|TOKEN)/, 'the token is never logged');
});
