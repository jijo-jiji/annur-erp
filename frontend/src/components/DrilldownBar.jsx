import { rm } from '../lib/format';
import { drillSource } from '../lib/drilldown';
import { Badge } from './ui';

// The number a figure showed, when it is not a count of rows: its name on the bar and how it is written
const UNITS = {
  total: ['jumlah', rm],
  balance: ['baki', rm],
  billed: ['dibilkan', rm],
  allowance: ['elaun', rm],
  rate: ['kadar', (v) => `${v}%`],
  enrolled: ['terisi', (v) => `${v} kerusi`],
};

// Shown above a list that was opened from a figure: where it came from, what it is filtered by, how many rows that
// is (and what they add up to), and a way back. If the figure showed another number, it says so rather than hiding it.
//   result  what the server answered: { count, total?, balance?, billed? }, or null while it is on its way
//   unit    which number the figure showed: count, or one of the totals (see lib/drilldown.js)
export default function DrilldownBar({ chips, result, expect, unit = 'count', src, onClear, noun = 'pelajar' }) {
  const source = drillSource(src);
  const money = unit !== 'count'; // the figure was a total, a rate or a seat count rather than a number of rows
  const write = UNITS[unit]?.[1] ?? ((v) => v);
  const shown = result ? (money ? result[unit] : result.count) : null;
  const differs = expect !== null && expect !== undefined && shown !== null && shown !== undefined && Math.abs(Number(expect) - shown) > 0.005;
  const extra = result && Object.keys(UNITS).filter((k) => result[k] !== undefined && result[k] !== null);
  return (
    <div role="region" aria-label="Penapis dari paparan" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
      <span className="text-gray-600">Dari {source.label}:</span>
      <span className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="green">{c}</Badge>)}</span>
      <span className="font-medium text-gray-900">
        {result ? `${result.count} ${noun}` : 'Memuatkan…'}
        {result && extra.length > 0 && (() => {
          const key = money && extra.includes(unit) ? unit : extra[0];
          return <span className="font-normal text-gray-600"> · {UNITS[key][0]} {UNITS[key][1](result[key])}</span>;
        })()}
      </span>
      {differs && <span className="text-amber-800">({source.label} menunjukkan {money ? write(expect) : expect}; sila semak)</span>}
      <span className="ml-auto flex items-center gap-4">
        <a href={source.href} className="font-medium text-brand-700 hover:underline">Kembali ke {source.label}</a>
        <button type="button" onClick={onClear} className="font-medium text-brand-700 hover:underline">Buang penapis</button>
      </span>
    </div>
  );
}
