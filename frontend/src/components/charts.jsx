import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

// Small, dependency-free SVG charts. One hue family (brand green) is used for
// magnitude; a second series uses a lighter step of the same hue.

export const SERIES_COLORS = { strong: 'var(--color-brand-600)', light: 'var(--color-brand-200)', muted: 'var(--color-gray-300)' };

// Render SVGs at their real pixel width so text stays at its intended size
function useWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-4 text-[13px] text-gray-600">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Vertical grouped bars. data: [{ label, values: { [seriesKey]: number } }]
export function BarChart({ data, series, format = (v) => v, height = 220 }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth(0);
  const H = height;
  const pad = { t: 12, r: 8, b: 28, l: 56 };
  const max = niceMax(Math.max(...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / data.length;
  const gap = 2;
  const barW = Math.min(36, (groupW * 0.6 - gap * (series.length - 1)) / series.length);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height: H }}>
      {W > 0 && (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Carta bar">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-gray-200)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-500 text-[11px]">
              {format(t, true)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.l + i * groupW;
          const totalW = series.length * barW + (series.length - 1) * gap;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={gx} y={pad.t} width={groupW} height={innerH} fill={hover === i ? 'var(--color-gray-100)' : 'transparent'} />
              {series.map((s, j) => {
                const v = d.values[s.key] ?? 0;
                const x = gx + (groupW - totalW) / 2 + j * (barW + gap);
                const h = Math.max(0, pad.t + innerH - y(v));
                const r = Math.min(4, h);
                return (
                  <path
                    key={s.key}
                    d={`M${x},${pad.t + innerH} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                    fill={s.color}
                  />
                );
              })}
              <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" className="fill-gray-600 text-[12px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${((pad.l + (hover + 0.5) * groupW) / W) * 100}%` }}
        >
          <p className="mb-1 font-medium">{data[hover].label}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tnum">{format(data[hover].values[s.key] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal bars for ranked lists. rows: [{ label, value, max?, hint }]
export function HBarList({ rows, format = (v) => v, max: fixedMax, danger, labelWidth = '9rem' }) {
  const max = fixedMax ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: `${labelWidth} 1fr 3.5rem` }} title={r.hint}>
          <span className="truncate text-gray-800">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-gray-100">
            <span
              className={cx('block h-full rounded-full', danger?.(r) ? 'bg-red-600' : 'bg-brand-500')}
              style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right text-[13px] font-medium text-gray-700 tnum">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// Small line chart for a score trend (0–100). points: [{ label, value }]
export function TrendChart({ points, height = 120, suffix = '' }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth(0);
  const H = height;
  const pad = { t: 14, r: 16, b: 22, l: 28 };
  const valid = points.filter((p) => p.value != null);
  const x = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const path = points
    .map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`))
    .filter(Boolean)
    .join(' L');

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height: H }}>
      {W > 0 && (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Carta trend markah">
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-gray-200)" />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400 text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {valid.length > 1 && <path d={`M${path}`} fill="none" stroke="var(--color-brand-600)" strokeWidth="2" strokeLinejoin="round" />}
        {points.map((p, i) => (
          <g key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 16} y={pad.t} width="32" height={H - pad.t - pad.b} fill="transparent" />
            {p.value != null && <circle cx={x(i)} cy={y(p.value)} r="4.5" fill="var(--color-brand-600)" stroke="white" strokeWidth="2" />}
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      )}
      {hover != null && points[hover].value != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-gray-900 px-2 py-1 text-xs text-white"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100}%` }}
        >
          {points[hover].label}: {points[hover].value}
          {suffix}
        </div>
      )}
    </div>
  );
}
