import { rm } from '../lib/format';
import { drillSource } from '../lib/drilldown';
import { Badge } from './ui';

const UNIT_LABEL = { total: 'jumlah', balance: 'baki', billed: 'dibilkan' };

// Shown above a list that was opened from a figure: where it came from, what it is filtered by, how many rows that
// is (and what they add up to), and a way back. If the figure showed another number, it says so rather than hiding it.
//   result  what the server answered: { count, total?, balance?, billed? }, or null while it is on its way
//   unit    which number the figure showed: count, or one of the totals (see lib/drilldown.js)
export default function DrilldownBar({ chips, result, expect, unit = 'count', src, onClear, noun = 'pelajar' }) {
  const source = drillSource(src);
  const money = unit !== 'count';
  const shown = result ? (money ? result[unit] : result.count) : null;
  const differs = expect !== null && expect !== undefined && shown !== null && Math.abs(Number(expect) - shown) > 0.005;
  const extra = result && ['total', 'balance', 'billed'].filter((k) => result[k] !== undefined);
  return (
    <div role="region" aria-label="Penapis dari paparan" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
      <span className="text-gray-600">Dari {source.label}:</span>
      <span className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="green">{c}</Badge>)}</span>
      <span className="font-medium text-gray-900">
        {result ? `${result.count} ${noun}` : 'Memuatkan…'}
        {result && extra.length > 0 && <span className="font-normal text-gray-600"> · {UNIT_LABEL[money ? unit : extra[0]]} {rm(result[money ? unit : extra[0]])}</span>}
      </span>
      {differs && <span className="text-amber-800">({source.label} menunjukkan {money ? rm(expect) : expect}; sila semak)</span>}
      <span className="ml-auto flex items-center gap-4">
        <a href={source.href} className="font-medium text-brand-700 hover:underline">Kembali ke {source.label}</a>
        <button type="button" onClick={onClear} className="font-medium text-brand-700 hover:underline">Buang penapis</button>
      </span>
    </div>
  );
}
