import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDirectionsUrl, cleanGoodToKnow } from '../api/_lib/good-to-know.ts';

test('entries are trimmed, capped and dropped when empty', () => {
  const out = cleanGoodToKnow({
    directionsUrl: ' https://maps.google.com/?q=TRU ',
    items: [
      { title: '  Parking ', text: 'East   gate only.\r\n\r\n\r\n\r\nAfter 6 pm.' },
      { title: '', text: 'no title' },
      { title: 'No text', text: '   ' },
      { title: 'x'.repeat(100), text: 'y'.repeat(900) },
      ...Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, text: 'ok' })),
    ],
  });
  assert.equal(out.items[0].title, 'Parking');
  assert.equal(out.items[0].text, 'East gate only.\n\nAfter 6 pm.');
  assert.equal(out.items[1].title.length, 40);
  assert.equal(out.items[1].text.length, 400);
  assert.equal(out.items.length, 8);
  assert.equal(out.directionsUrl, 'https://maps.google.com/?q=TRU');
});

test('only an https link survives, and nothing left is null', () => {
  for (const bad of ['http://maps.google.com', 'javascript:alert(1)', 'ftp://x.y', 'not a url', 'https://localhost', '']) {
    assert.equal(cleanDirectionsUrl(bad), null, bad);
  }
  assert.equal(cleanGoodToKnow({ items: [] }), null);
  assert.equal(cleanGoodToKnow('x'), null);
  assert.equal(cleanGoodToKnow(null), null);
  // A write says so; a read just leaves it out.
  assert.throws(() => cleanGoodToKnow({ directionsUrl: 'http://x.y', items: [] }, true), /https/);
  assert.equal(cleanGoodToKnow({ directionsUrl: 'http://x.y', items: [{ title: 'a', text: 'b' }] }).directionsUrl, undefined);
});
