import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapVercelDeployments, summariseDeployments } from '../shared/platform-monitoring.ts';

test('a Vercel deployment list is read into plain, bounded fields', () => {
  const body = {
    deployments: [
      { uid: 'dpl_3', state: 'ERROR', target: null, created: Date.UTC(2026, 9, 15, 5, 0), meta: { githubCommitSha: 'abcdef1234567', githubCommitMessage: 'Fix it\nlong body that must not travel' } },
      { uid: 'dpl_2', readyState: 'READY', target: 'production', created: Date.UTC(2026, 9, 14, 5, 0), meta: { githubCommitSha: '1234567890' } },
      { uid: 'dpl_1', state: 'BUILDING', target: 'production', created: Date.UTC(2026, 9, 13, 5, 0) },
    ],
  };
  const list = mapVercelDeployments(body);
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], { id: 'dpl_3', state: 'error', production: false, createdAt: '2026-10-15T05:00:00.000Z', commit: 'abcdef1', message: 'Fix it' });
  assert.equal(list[1].state, 'ready', 'readyState is accepted too');
  assert.equal(list[2].commit, null);
  const summary = summariseDeployments(list);
  assert.equal(summary.latestProduction.id, 'dpl_2');
  assert.equal(summary.newestFailed, true, 'the newest deployment failed even though production is fine');
});

test('anything unexpected becomes null or is dropped, never a guess', () => {
  assert.deepEqual(mapVercelDeployments(null), []);
  assert.deepEqual(mapVercelDeployments({ deployments: 'no' }), []);
  const list = mapVercelDeployments({ deployments: [null, 5, { name: 'no id' }, { uid: 'x', state: 'WEIRD', created: 'yesterday', meta: { githubCommitMessage: 7 } }] });
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { id: 'x', state: 'unknown', production: false, createdAt: null, commit: null, message: null });
  assert.equal(mapVercelDeployments({ deployments: Array.from({ length: 20 }, (_, i) => ({ uid: `d${i}` })) }, 5).length, 5);
  assert.deepEqual(summariseDeployments([]), { latestProduction: null, newestFailed: false });
});
