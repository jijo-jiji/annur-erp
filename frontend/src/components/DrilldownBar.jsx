import { drillSource } from '../lib/drilldown';
import { Badge } from './ui';

// Shown above a list that was opened from a figure: where it came from, what it is filtered by, how many
// rows that is, and a way back. If the figure showed another number, it says so rather than hiding it.
export default function DrilldownBar({ chips, count, expect, from, onClear, noun = 'pelajar' }) {
  const source = drillSource(from);
  const differs = expect !== null && expect !== undefined && count !== null && Number(expect) !== count;
  return (
    <div role="region" aria-label="Penapis dari paparan" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
      <span className="text-gray-600">Dari {source.label}:</span>
      <span className="flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="green">{c}</Badge>)}</span>
      <span className="font-medium text-gray-900">{count === null ? 'Memuatkan…' : `${count} ${noun}`}</span>
      {differs && <span className="text-amber-800">({source.label} menunjukkan {expect}; sila semak)</span>}
      <span className="ml-auto flex items-center gap-4">
        <a href={source.href} className="font-medium text-brand-700 hover:underline">Kembali ke {source.label}</a>
        <button type="button" onClick={onClear} className="font-medium text-brand-700 hover:underline">Buang penapis</button>
      </span>
    </div>
  );
}
