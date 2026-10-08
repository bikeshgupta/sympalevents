import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../api/_lib/csv.ts';

test('csv cells are quoted when they must be, and cannot run as formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(true), 'Yes');
  assert.equal(csvCell(1200), '1200');

  // A resident-typed name or reference must not be live in a spreadsheet.
  for (const hostile of ['=HYPERLINK("http://x","click")', '+1+1', '-2+3', '@SUM(A1)']) {
    assert.ok(csvCell(hostile).replace(/^"/, '').startsWith("'"), hostile);
  }
  // Numbers are not text, so a negative amount is left alone.
  assert.equal(csvCell(-5), '-5');
});

test('a csv opens as UTF-8 with its header row first', () => {
  const csv = toCsv(['Name', 'Flat'], [['आशा', 'D104'], ['Rohit, M', 'B201']]);
  assert.ok(csv.startsWith('﻿Name,Flat\r\n'));
  assert.ok(csv.includes('आशा,D104'));
  assert.ok(csv.includes('"Rohit, M",B201'));
});
