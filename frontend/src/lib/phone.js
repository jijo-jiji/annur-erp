// The one way a telephone number is kept and shown. The server cleans every number to the same form when it is saved
// (backend/core/phone.py); this file has the same rules for the boxes people type in and for what screens show. Both are
// tested against backend/core/phone_cases.json, so they cannot drift apart.
//
//   stored  60133474009 (digits with the country code, no plus sign); a number from another country keeps its plus sign
//   typed   any common style: 013-347 4009, +6013-347 4009, 0133474009, 133474009 (Excel drops the leading 0)
//   shown   +6013-347-4009 by default; Management can change the prefix and the separator in Settings

const TOLL_FREE = ['1300', '1700', '1800']; // dialled inside Malaysia only: not a number with a country code
const PREFIXES = { plus60: '+60', 60: '60', 0: '0' };
const SEPARATORS = { dash: '-', space: ' ', none: '' };

function validNational(national) {
  if (!/^\d+$/.test(national)) return false;
  if (national[0] === '1') { // mobile: 13 347 4009 (9 digits), 11 2345 6789 (10 digits)
    return [9, 10].includes(national.length) && !(national.length === 10 && TOLL_FREE.some((p) => national.startsWith(p)));
  }
  if ('3456789'.includes(national[0])) return [8, 9].includes(national.length); // landline: 9 7441234, 3 2123 4567
  return false;
}

// The stored form of what was typed: '' for an empty box, null when the text is not one number we understand
export function normalizePhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (/[A-Za-z/;,]/.test(text)) return null; // two numbers, a note, an extension
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  let international = text.startsWith('+') || text.startsWith('(+');
  if (text.startsWith('00')) { international = true; digits = digits.slice(2); }
  if (digits.startsWith('60') && (international || digits.length >= 10)) return validNational(digits.slice(2)) ? digits : null;
  if (international) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null; // another country keeps its plus sign
  if (digits.startsWith('0')) { // 013-347 4009
    const national = digits.slice(1);
    return validNational(national) ? `60${national}` : null;
  }
  return validNational(digits) ? `60${digits}` : null; // the leading 0 was lost on the way
}

function groups(national) {
  const head = '18'.includes(national[0]) ? 2 : 1; // 13 / 11 mobile and 82-89 Sarawak and Sabah; 3-7 and 9 for the other landlines
  const rest = national.slice(head);
  const cut = { 8: [4, 4], 7: [3, 4], 6: [3, 3] }[rest.length];
  return [national.slice(0, head), ...(cut ? [rest.slice(0, cut[0]), rest.slice(cut[0])] : [rest])];
}

// How a number reads. A number saved before this rule (013-347 4009) reads the same as a cleaned one; text that is not
// one number we understand (a toll-free number, a note) is shown as it is.
export function displayPhone(value, prefix = 'plus60', separator = 'dash') {
  const stored = normalizePhone(value);
  if (!stored) return String(value ?? '');
  if (stored.startsWith('+')) return stored; // another country: shown whole
  const [head, ...rest] = groups(stored.slice(2));
  return [(PREFIXES[prefix] ?? '+60') + head, ...rest].join(SEPARATORS[separator] ?? '-');
}

// What the box shows for a saved number: 60133474009, 0133474009 or +60133474009. Text being typed is left as it is.
export function toInputStyle(value, style = '60') {
  const text = String(value ?? '');
  if (!text || normalizePhone(text) !== text || text.startsWith('+')) return text;
  if (style === '0') return `0${text.slice(2)}`;
  return style === 'plus60' ? `+${text}` : text;
}

// Does a number match what someone typed in a search box? "013-347", "0133474009" and "6013347" all find 60133474009.
export function phoneMatches(value, query) {
  const wanted = String(query ?? '').replace(/\D/g, '').replace(/^(60|0)/, '');
  if (wanted.length < 3) return false; // a few digits are not a phone search; the text search handles those
  return String(value ?? '').replace(/\D/g, '').replace(/^(60|0)/, '').includes(wanted);
}

// tel: link for the Telefon button: +60133474009
export const telLink = (value) => {
  const stored = normalizePhone(value);
  return `tel:${stored ? (stored.startsWith('+') ? stored : `+${stored}`) : String(value ?? '')}`;
};

// The number WhatsApp links use: digits with the country code
export const whatsappDigits = (value) => {
  const stored = normalizePhone(value);
  return stored ? stored.replace('+', '') : String(value ?? '').replace(/\D/g, '');
};
