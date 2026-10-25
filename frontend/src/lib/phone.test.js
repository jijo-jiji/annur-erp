// Run with: npm run test:unit
// The same table of cases the server is tested with (backend/core/tests_phone.py).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { displayPhone, normalizePhone, phoneMatches, toInputStyle, whatsappDigits } from './phone.js';

const CASES = JSON.parse(readFileSync(new URL('../../../backend/core/phone_cases.json', import.meta.url), 'utf8'));

test('what is stored for what was typed', () => {
  for (const [typed, stored] of CASES.normalize) assert.equal(normalizePhone(typed), stored, JSON.stringify(typed));
});

test('how a number reads', () => {
  for (const [value, prefix, separator, shown] of CASES.display) assert.equal(displayPhone(value, prefix, separator), shown, JSON.stringify([value, prefix, separator]));
});

test('what the box shows', () => {
  for (const [value, style, shown] of CASES.input) assert.equal(toInputStyle(value, style), shown, JSON.stringify([value, style]));
});

test('a cleaned number is cleaned again to itself', () => {
  for (const [, stored] of CASES.normalize) if (stored) assert.equal(normalizePhone(stored), stored);
});

test('a search for part of a number finds it however it was typed', () => {
  for (const query of ['013-347', '0133474009', '6013347', '+6013-347 4009', '3474009']) assert.equal(phoneMatches('60133474009', query), true, query);
  assert.equal(phoneMatches('60133474009', '0199'), false);
  assert.equal(phoneMatches('60133474009', '01'), false); // too short to be a number search
  assert.equal(phoneMatches('', '0133474009'), false);
});

test('WhatsApp links get digits with the country code', () => {
  assert.equal(whatsappDigits('60133474009'), '60133474009');
  assert.equal(whatsappDigits('013-347 4009'), '60133474009');
  assert.equal(whatsappDigits('+6581234567'), '6581234567');
  assert.equal(whatsappDigits('1-300-88-5454'), '1300885454');
});
