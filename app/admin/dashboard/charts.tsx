// Chart pieces for the HR dashboard (2026-10-03). Plain HTML/CSS, server
// rendered: thin bars from a single baseline, one series colour for
// single-measure charts (no legend -- the title names it), a legend for the
// two-series trend, hover/focus tooltips with a hit target bigger than the
// mark, and every chart backed by a table. Text never wears the series colour.
import Link from "next/link";
import type { TrendPoint } from "@/lib/dashboard/metrics";

export interface BarRow {
  label: string;
  value: number;
  href?: string;
  /** Shown at the bar tip; defaults to the value. */
  display?: string;
  /** Extra tooltip line. */
  detail?: string;
}

/** Horizontal bar list -- also a table, so it is its own table view. */
export function BarList({ rows, max, caption, valueHeader = "Tickets" }: { rows: BarRow[]; max?: number; caption: string; valueHeader?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-muted">Nothing to show.</p>;
  return (
    <table className="viz-barlist">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th>Name</th>
          <th>{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="viz-barlist-label">
              {r.href ? <Link href={r.href}>{r.label}</Link> : r.label}
            </th>
            <td className="viz-barlist-cell">
              <span className="viz-bar-track" tabIndex={0} aria-label={`${r.label}: ${r.display ?? r.value}${r.detail ? `, ${r.detail}` : ""}`}>
                <span className="viz-bar" style={{ width: `${(r.value / top) * 100}%` }} />
                <span className="viz-bar-value">{r.display ?? r.value}</span>
                <span className="viz-tip" role="tooltip">
                  <strong>{r.label}</strong>
                  <br />
                  {r.display ?? r.value}
                  {r.detail && (
                    <>
                      <br />
                      {r.detail}
                    </>
                  )}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function niceMax(n: number): number {
  if (n <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= n) ?? pow * 10;
  return Math.ceil(n / step) * step;
}

/** Inbound vs closed per bucket: grouped columns, two series, legend. */
export function VolumeChart({ points }: { points: TrendPoint[] }) {
  const top = niceMax(Math.max(1, ...points.flatMap((p) => [p.inbound, p.closed])));
  const ticks = [0, top / 2, top];
  return (
    <figure className="viz-figure">
      <div className="viz-legend" aria-hidden="true">
        <span>
          <i className="viz-swatch series-1" /> Inbound
        </span>
        <span>
          <i className="viz-swatch series-2" /> Closed
        </span>
      </div>
      <div className="viz-columns" role="img" aria-label="Inbound and closed tickets per period -- see the table below for values">
        <div className="viz-yaxis" aria-hidden="true">
          {[...ticks].reverse().map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="viz-plot">
          {ticks.map((t) => (
            <span key={t} className="viz-grid" style={{ bottom: `calc(1.4rem + (100% - 1.4rem) * ${t / top})` }} />
          ))}
          {points.map((p, i) => (
            <div key={p.start} className="viz-col-group" tabIndex={0}>
              <div className="viz-col-pair">
                <span className="viz-col series-1" style={{ height: `${(p.inbound / top) * 100}%` }} />
                <span className="viz-col series-2" style={{ height: `${(p.closed / top) * 100}%` }} />
              </div>
              {/* With many columns, label every second one so labels never collide (tooltips show all). */}
              <span className={`viz-xlabel${points.length > 8 && (points.length - 1 - i) % 2 === 1 ? " viz-xlabel-skip" : ""}`}>{p.label}</span>
              <span className="viz-tip" role="tooltip">
                <strong>{p.label}</strong>
                <br />
                <i className="viz-swatch series-1" /> Inbound {p.inbound}
                <br />
                <i className="viz-swatch series-2" /> Closed {p.closed}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** Target-date compliance % per bucket: single series, 0-100 axis. */
export function ComplianceChart({ points }: { points: TrendPoint[] }) {
  return (
    <figure className="viz-figure">
      <div className="viz-columns" role="img" aria-label="Target-date compliance per period -- see the table below for values">
        <div className="viz-yaxis" aria-hidden="true">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="viz-plot">
          {[0, 50, 100].map((t) => (
            <span key={t} className="viz-grid" style={{ bottom: `calc(1.4rem + (100% - 1.4rem) * ${t / 100})` }} />
          ))}
          {points.map((p, i) => (
            <div key={p.start} className="viz-col-group" tabIndex={0}>
              <div className="viz-col-pair">
                {p.complianceRate === null ? (
                  <span className="viz-col-empty" title="No resolved tickets" />
                ) : (
                  <span className="viz-col series-1" style={{ height: `${p.complianceRate}%` }} />
                )}
              </div>
              {/* With many columns, label every second one so labels never collide (tooltips show all). */}
              <span className={`viz-xlabel${points.length > 8 && (points.length - 1 - i) % 2 === 1 ? " viz-xlabel-skip" : ""}`}>{p.label}</span>
              <span className="viz-tip" role="tooltip">
                <strong>{p.label}</strong>
                <br />
                {p.complianceRate === null ? "No resolved tickets" : `${p.complianceRate}% on time (${p.resolved} resolved)`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function TrendTable({ points }: { points: TrendPoint[] }) {
  return (
    <details className="viz-table-toggle">
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Inbound</th>
            <th>Closed</th>
            <th>Resolved</th>
            <th>On time</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <td>{p.label}</td>
              <td>{p.inbound}</td>
              <td>{p.closed}</td>
              <td>{p.resolved}</td>
              <td>{p.complianceRate === null ? "--" : `${p.complianceRate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
