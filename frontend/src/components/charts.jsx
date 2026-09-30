import React, { useState } from 'react';

// Validated categorical order (colour-blind safe on the white surface). Assigned in this
// order, never cycled: anything past slot 7 folds into "Lain-lain" in slot 8's grey.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
const OTHER_COLOR = '#94a3b8';

function foldRows(rows) {
  const sorted = rows.filter((r) => r.value > 0);
  if (sorted.length <= SERIES_COLORS.length) return sorted.map((r, i) => ({ ...r, color: SERIES_COLORS[i] }));
  const head = sorted.slice(0, SERIES_COLORS.length - 1).map((r, i) => ({ ...r, color: SERIES_COLORS[i] }));
  const rest = sorted.slice(SERIES_COLORS.length - 1).reduce((s, r) => s + r.value, 0);
  return [...head, { label: 'Lain-lain', value: rest, color: OTHER_COLOR }];
}

// Donut with a legend that doubles as the data table (label, count, %)
export function Donut({ rows, size = 150, emptyText = 'Tiada data' }) {
  const [hover, setHover] = useState(null);
  const data = foldRows(rows);
  const total = data.reduce((s, r) => s + r.value, 0);
  if (!total) return <p className="text-xs text-slate-400 py-6 text-center">{emptyText}</p>;

  const r = size / 2 - 4;
  const inner = r * 0.6;
  const c = size / 2;
  let angle = -Math.PI / 2;
  const arcs = data.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...d, start, end: angle, sweep };
  });
  const point = (rad, a) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  const path = (a) => {
    if (a.sweep >= Math.PI * 2 - 1e-6) {
      // A single category: two half rings, since one arc cannot close on itself
      return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} Z `
        + `M ${c} ${c - inner} A ${inner} ${inner} 0 1 0 ${c} ${c + inner} A ${inner} ${inner} 0 1 0 ${c} ${c - inner} Z`;
    }
    const large = a.sweep > Math.PI ? 1 : 0;
    const [x1, y1] = point(r, a.start);
    const [x2, y2] = point(r, a.end);
    const [x3, y3] = point(inner, a.end);
    const [x4, y4] = point(inner, a.start);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
  };
  const pct = (v) => `${Math.round((v / total) * 100)}%`;
  const shown = hover !== null ? arcs[hover] : null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={arcs.map((a) => `${a.label}: ${a.value}`).join(', ')} className="shrink-0">
        {arcs.map((a, i) => (
          <path key={a.label} d={path(a)} fill={a.color} fillRule="evenodd" stroke="#fff" strokeWidth="2"
            opacity={hover === null || hover === i ? 1 : 0.35}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`${a.label}: ${a.value} (${pct(a.value)})`}</title>
          </path>
        ))}
        <text x={c} y={c - 2} textAnchor="middle" className="fill-slate-900" fontSize="18" fontWeight="800">
          {shown ? shown.value : total}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" className="fill-slate-500" fontSize="10">
          {shown ? pct(shown.value) : 'jumlah'}
        </text>
      </svg>
      <ul className="flex-1 min-w-[140px] space-y-1 text-xs">
        {arcs.map((a, i) => (
          <li key={a.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded px-1 ${hover === i ? 'bg-slate-100' : ''}`}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="flex-1 text-slate-700 truncate">{a.label}</span>
            <span className="font-bold text-slate-900">{a.value}</span>
            <span className="w-9 text-right text-slate-500">{pct(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
