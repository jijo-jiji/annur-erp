// Run with: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageOn, ageText } from './age.js';

test('the age is the whole years completed on that day', () => {
  assert.equal(ageOn('1984-03-12', '2026-11-01'), 42);
  assert.equal(ageOn('1984-11-01', '2026-11-01'), 42); // the birthday itself
  assert.equal(ageOn('1984-11-02', '2026-11-01'), 41); // the day before it
  assert.equal(ageOn('1984-12-31', '2026-11-01'), 41);
  assert.equal(ageOn('2000-02-29', '2026-02-28'), 25);
  assert.equal(ageOn('2000-02-29', '2026-03-01'), 26);
});

test('no date, a bad date or a date in the future gives no age', () => {
  for (const bad of ['', null, undefined, '12/03/1984', '1984-3-12', '2030-01-01']) assert.equal(ageOn(bad, '2026-11-01'), null, String(bad));
  assert.equal(ageText('', '2026-11-01'), '');
  assert.equal(ageText('1984-03-12', '2026-11-01'), '42 tahun');
});
