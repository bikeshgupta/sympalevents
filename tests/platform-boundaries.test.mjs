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

const platformApi = readFileSync('api/_lib/platform.ts', 'utf8') + readFileSync('api/_lib/platform-reads.ts', 'utf8');
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
  assert.match(platformCode, /if \(!access\.ok\)[\s\S]{0,200}sendJson\(res, 404, platformNotFoundBody\)/);
  assert.match(readFileSync('api/events.ts', 'utf8'), /resource === "platform"\) return handlePlatform\(req, res\)/);
});

test('platform answers are never kept in localStorage', () => {
  assert.ok(!persistedRoots.has('platform'));
  const api = readFileSync('src/features/platform/platform-api.ts', 'utf8');
  const keys = [...api.matchAll(/queryKey: \[\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 2 && keys.every((key) => key === 'platform'), `platform query keys: ${keys.join(', ')}`);
});
