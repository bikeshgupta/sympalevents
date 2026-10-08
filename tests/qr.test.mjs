import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../src/lib/qr.ts';

// These check the structure. That the symbols actually *decode* was verified
// against an independent decoder (jsQR) across versions 1-10 when the encoder
// was written; that decoder is not a dependency of this project.

const token = 'SYMPAL1:' + '0123456789abcdef'.repeat(2);

test('a pass token fits version 3 (29x29) and the symbol is deterministic', () => {
  const a = qrMatrix(token);
  assert.equal(a.length, 29);
  assert.ok(a.every((row) => row.length === 29));
  assert.deepEqual(a, qrMatrix(token));
  assert.notDeepEqual(a, qrMatrix(token.replace('0123', '4567')));
});

test('the three finder patterns and the timing lines are where the standard puts them', () => {
  const m = qrMatrix(token);
  const n = m.length;
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y += 1) for (let x = 0; x < 7; x += 1) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(m[y0 + y][x0 + x], ring !== 2, `finder at ${x0},${y0} (${x},${y})`);
    }
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let i = 8; i < n - 8; i += 1) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true); // the dark module
});

test('capacity grows the symbol, and too much is refused rather than truncated', () => {
  assert.equal(qrMatrix('x'.repeat(14)).length, 21);   // v1
  assert.equal(qrMatrix('x'.repeat(15)).length, 25);   // v2
  assert.equal(qrMatrix('x'.repeat(213)).length, 57);  // v10
  assert.throws(() => qrMatrix('x'.repeat(214)), /too long/);
});

test('the svg is black on white with a quiet zone, and its label cannot break out', () => {
  const svg = qrSvg(token, { label: 'Pass "><script>' });
  assert.match(svg, /viewBox="0 0 37 37"/); // 29 + 2 x 4
  assert.ok(svg.includes('fill="#fff"') && svg.includes('fill="#000"'));
  assert.ok(!svg.includes('<script>'));
});
