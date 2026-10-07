import { useState } from 'react';

export interface Series {
  name: string;
  values: number[];
  className: string;
}

/** Accessible stacked bar chart (SVG) with tooltips and a data table fallback. */
export function BarChart({
  series,
  labels,
  unit = 'kWh',
  height = 200,
  title,
  compare,
}: {
  series: Series[];
  labels: string[];
  unit?: string;
  height?: number;
  title: string;
  /** Optional line series drawn on top (e.g. previous period). */
  compare?: { name: string; values: number[] };
}) {
  const [hover, setHover] = useState<number>();
  const [table, setTable] = useState(false);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = Math.max(1e-9, ...totals, ...(compare?.values ?? [0])) * 1.1;
  const W = 600;
  const H = height;
  const padL = 36;
  const padB = 22;
  const bw = (W - padL) / n;
  const y = (v: number) => H - padB - (v / max) * (H - padB - 8);
  const ticks = [0, max / 2, max].map((t) => Math.round(t * 10) / 10);

  if (!n || totals.every((t) => t === 0) && !compare?.values.some(Boolean)) {
    return <p className="muted chart-empty">No data for this period yet.</p>;
  }

  return (
    <figure className="chart">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i className={s.className} /> {s.name}
          </span>
        ))}
        {compare && (
          <span>
            <i className="legend-line" /> {compare.name}
          </span>
        )}
        <button className="link" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
              <th scope="col">Total</th>
              {compare && <th scope="col">{compare.name}</th>}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l + i}>
                <th scope="row">{l}</th>
                {series.map((s) => (
                  <td key={s.name}>{(s.values[i] ?? 0).toFixed(1)}</td>
                ))}
                <td>{totals[i]!.toFixed(1)}</td>
                {compare && <td>{(compare.values[i] ?? 0).toFixed(1)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={title} onMouseLeave={() => setHover(undefined)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={padL} x2={W} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={padL - 6} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            let acc = 0;
            const x = padL + i * bw + bw * 0.15;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${l}: ${totals[i]!.toFixed(1)} ${unit}`}>
                <rect x={padL + i * bw} y={0} width={bw} height={H - padB} fill="transparent" />
                {series.map((s) => {
                  const v = s.values[i] ?? 0;
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return h > 0 ? <rect key={s.name} className={s.className} x={x} y={top} width={bw * 0.7} height={h} rx={2} /> : null;
                })}
                {(n <= 12 || i % Math.ceil(n / 12) === 0) && (
                  <text className="chart-tick" x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
          {compare && (
            <polyline
              className="chart-compare"
              points={compare.values.map((v, i) => `${padL + i * bw + bw / 2},${y(v)}`).join(' ')}
            />
          )}
          {hover !== undefined && (
            <g className="chart-tip" transform={`translate(${Math.min(padL + hover * bw + bw / 2, W - 70)}, ${Math.max(y(totals[hover]!) - 30, 14)})`}>
              <rect x={-60} y={-14} width={120} height={22} rx={6} />
              <text textAnchor="middle" y={2}>
                {labels[hover]}: {totals[hover]!.toFixed(1)} {unit}
              </text>
            </g>
          )}
        </svg>
      )}
    </figure>
  );
}
