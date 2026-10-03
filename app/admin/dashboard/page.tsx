import Link from "next/link";
import { getSession } from "@/lib/session";
import { canViewDashboard } from "@/lib/rbac";
import { loadDashboard } from "@/lib/dashboard/load";
import { isTrendRange, type ComplianceRow, type CountRow, type TrendRange } from "@/lib/dashboard/metrics";
import { formatAuDateTime } from "@/lib/format-date";
import { BarList, ComplianceChart, TrendTable, VolumeChart, type BarRow } from "./charts";

// HR Management Dashboard (John, 2026-10-03) -- ADMIN / HR_LEAD. All figures
// come from lib/dashboard (soft-deleted excluded, §9-filtered per viewer).
// Most numbers link to the matching filtered ticket list.

const RANGE_LABELS: Record<TrendRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" };

const q = (key: string, value: string) => `${key}=${encodeURIComponent(value)}`;

function countRows(rows: CountRow[], key: "assignee" | "businessUnit" | "category"): BarRow[] {
  return rows.map((r) => ({
    label: r.label,
    value: r.count,
    href: key === "assignee" && r.filter === null ? "/pool" : `/all-open?${q(key, r.filter ?? "__none__")}`,
  }));
}

function complianceRows(rows: ComplianceRow[], key: "assignee" | "businessUnit" | "category"): BarRow[] {
  return rows.map((r) => ({
    label: r.label,
    value: r.rate ?? 0,
    display: r.rate === null ? "--" : `${r.rate}%`,
    detail: `${r.onTime} of ${r.resolved} resolved on time`,
    href: `/closed?${q(key, r.filter ?? (key === "assignee" ? "__unassigned__" : "__none__"))}`,
  }));
}

function Tile({ label, value, href, tone, sub }: { label: string; value: string | number; href?: string; tone?: "alert" | "ok"; sub?: string }) {
  const body = (
    <>
      <span className="tile-label">
        {tone === "alert" && <span aria-hidden="true">⚠ </span>}
        {label}
      </span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`dash-tile${tone ? ` dash-tile-${tone}` : ""}`}>
      {body}
    </Link>
  ) : (
    <div className={`dash-tile${tone ? ` dash-tile-${tone}` : ""}`}>{body}</div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canViewDashboard(session.user.role)) {
    return (
      <main>
        <h1>Not permitted</h1>
        <p>Only HR Leads and Admins can view the dashboard.</p>
      </main>
    );
  }

  const range: TrendRange = isTrendRange(searchParams.range) ? searchParams.range : "30d";
  const d = await loadDashboard(session.user.id, session.user.role, range);
  const w = d.workload;
  const tp = d.throughput;
  const rangeText = `last ${RANGE_LABELS[range]}`;
  const melbDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Australia/Melbourne" });
  const monthName = new Date(d.generatedAt).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Melbourne" });

  return (
    <main className="dashboard">
      <div className="dash-head">
        <h1>HR dashboard</h1>
        <span className="text-muted">Updated {formatAuDateTime(new Date(d.generatedAt))}</span>
      </div>

      <section aria-labelledby="workload-h">
        <h2 id="workload-h">Workload now</h2>
        <div className="dash-tiles">
          <Tile label="Open tickets" value={w.totalOpen} href="/all-open" />
          <Tile label="P1 open" value={w.byPriority.P1} href="/all-open?priority=P1" />
          <Tile label="P2 open" value={w.byPriority.P2} href="/all-open?priority=P2" />
          <Tile label="P3 open" value={w.byPriority.P3} href="/all-open?priority=P3" />
          <Tile label="Unassigned (Pool)" value={w.unassigned} href="/pool" />
          <Tile label="Overdue" value={w.overdue} href="/overdue" tone={w.overdue > 0 ? "alert" : undefined} />
          <Tile label="Due in next 7 working days" value={w.dueNext7WorkingDays} href="/all-open?sort=due" />
          <Tile
            label="Average age of open tickets"
            value={w.avgAgeCalendarDays === null ? "--" : `${w.avgAgeCalendarDays} days`}
            sub={w.avgAgeWorkingDays === null ? undefined : `${w.avgAgeWorkingDays} working days`}
          />
        </div>
      </section>

      <div className="dash-grid">
        <section className="section-card">
          <h2>Open tickets by status</h2>
          <BarList
            caption="Open tickets by status"
            rows={w.byStatus.map((s) => ({
              label: s.label,
              value: s.count,
              href: `/all-open?${q("status", s.key.startsWith("item:") ? s.key.slice(5) : s.key)}`,
            }))}
          />
        </section>
        <section className="section-card">
          <h2>Open tickets by assignee</h2>
          <BarList caption="Open tickets by assignee" rows={countRows(d.distributions.byAssignee, "assignee")} />
        </section>
        <section className="section-card">
          <h2>Open tickets by business unit</h2>
          <BarList caption="Open tickets by business unit" rows={countRows(d.distributions.byBusinessUnit, "businessUnit")} />
        </section>
        <section className="section-card">
          <h2>Open tickets by category</h2>
          <BarList caption="Open tickets by category" rows={countRows(d.distributions.byCategory, "category")} />
        </section>
      </div>

      <section aria-labelledby="month-h">
        <h2 id="month-h">This month</h2>
        <div className="dash-tiles">
          <Tile label="Created" value={tp.createdThisMonth} />
          <Tile label="Resolved" value={tp.closedThisMonth.resolved} />
          <Tile label="Info only / Autoclose / Withdrawn" value={tp.closedThisMonth.infoOnlyAutocloseWithdrawn} />
          {tp.closedThisMonth.other > 0 && <Tile label="Merged / other closures" value={tp.closedThisMonth.other} />}
        </div>
      </section>

      <section aria-labelledby="trend-h" className="dash-trends">
        <div className="dash-head">
          <h2 id="trend-h">Trends and target-date compliance</h2>
          <nav className="dash-range" aria-label="Trend range">
            {(Object.keys(RANGE_LABELS) as TrendRange[]).map((r) => (
              <Link key={r} href={`/admin/dashboard?range=${r}`} aria-current={r === range ? "page" : undefined} className={r === range ? "active" : undefined}>
                {RANGE_LABELS[r]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="dash-tiles">
          <Tile
            label={`On-time rate, ${rangeText}`}
            value={tp.complianceRate === null ? "--" : `${tp.complianceRate}%`}
            sub={`${tp.resolvedInRange} resolved`}
          />
          <Tile
            label={`Average time to resolve, ${rangeText}`}
            value={tp.avgResolutionDays === null ? "--" : `${tp.avgResolutionDays} days`}
            sub={tp.avgResolutionWorkingDays === null ? undefined : `${tp.avgResolutionWorkingDays} working days`}
          />
        </div>
        <div className="dash-grid">
          <section className="section-card">
            <h3>Inbound vs closed</h3>
            <VolumeChart points={d.trends} />
          </section>
          <section className="section-card">
            <h3>On time (resolved by the target due date)</h3>
            <ComplianceChart points={d.trends} />
          </section>
        </div>
        <TrendTable points={d.trends} />
      </section>

      <section aria-labelledby="comp-h">
        <h2 id="comp-h">Target-date compliance, {rangeText}</h2>
        <p className="text-muted">
          Share of resolved tickets closed on or before their target due date (an overridden target counts as the target).
          Info only, Autoclose and Withdrawn closures are not counted.
        </p>
        <div className="dash-grid">
          <section className="section-card">
            <h3>By assignee</h3>
            <BarList caption="Compliance by assignee" max={100} valueHeader="On time" rows={complianceRows(d.compliance.byAssignee, "assignee")} />
          </section>
          <section className="section-card">
            <h3>By business unit</h3>
            <BarList caption="Compliance by business unit" max={100} valueHeader="On time" rows={complianceRows(d.compliance.byBusinessUnit, "businessUnit")} />
          </section>
          <section className="section-card">
            <h3>By category</h3>
            <BarList caption="Compliance by category" max={100} valueHeader="On time" rows={complianceRows(d.compliance.byCategory, "category")} />
          </section>
        </div>
      </section>

      {/* Information panel (John, 2026-10-03): when the figures were taken and what period they cover. */}
      <dl className="dash-info" aria-label="About these figures">
        <div>
          <dt>Last refreshed</dt>
          <dd>{formatAuDateTime(new Date(d.generatedAt))} (Melbourne time)</dd>
        </div>
        <div>
          <dt>Reporting period (trends, on-time rate, time to resolve)</dt>
          <dd>
            Last {RANGE_LABELS[range]}: {melbDate(d.rangeStart)} to {melbDate(d.generatedAt)}
          </dd>
        </div>
        <div>
          <dt>&quot;This month&quot;</dt>
          <dd>{monthName}, to date</dd>
        </div>
        <div>
          <dt>Workload now</dt>
          <dd>As at the refresh time</dd>
        </div>
      </dl>
    </main>
  );
}
