// HR Management Dashboard metrics (John, 2026-10-03). Pure aggregation over
// ticket rows the caller has ALREADY scoped (not deleted, and passed through
// confidentialFilter() for the viewer -- see lib/dashboard/load.ts), so this
// file can never widen what a viewer may see. Every figure is computed here
// so it is testable without a database.
//
// Definitions:
// - Open: NEW, ALLOCATED, IN_ACTION (incl. action items), AWAITING_RESPONSE,
//   RESPONSE_RECEIVED, OUTCOME.
// - Substantive closure: close reason RESOLVED. Administrative drops: Info
//   only (NOT_A_REQUEST), Autoclose, Withdrawn. Merged/Redirected: "other".
// - Effective due date: the target due date, else the old SLA date
//   (lib/tickets/due-dates.ts) -- the KPI.
// - Compliance: of RESOLVED tickets, the share closed on or before their
//   effective due date (an overridden target counts as the target).
import { effectiveDueDate, isOverdue } from "../tickets/due-dates";
import { OPEN_STATUSES, type TicketStatus } from "../tickets/transitions";
import { addCalendarDaysMelbourne, addWorkingDays, melbourneDateKey, workingDaysBetween } from "../calendar/working-days";
import { melbourneParts, melbourneWallTimeToUtc } from "../timezone";

export interface DashboardTicket {
  id: string;
  status: TicketStatus;
  priority: "P1" | "P2" | "P3";
  receivedAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
  slaDueAt: Date;
  targetDueAt: Date | null;
  assignee: { id: string; displayName: string } | null;
  businessUnit: { name: string } | null;
  category: { name: string } | null;
  actionStatus: { name: string } | null;
}

export type TrendRange = "7d" | "30d" | "90d" | "12m";
export const TREND_RANGES: TrendRange[] = ["7d", "30d", "90d", "12m"];
export function isTrendRange(v: unknown): v is TrendRange {
  return typeof v === "string" && (TREND_RANGES as string[]).includes(v);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MELB_WEEKDAY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", weekday: "short" });
const ADMIN_DROP_REASONS = new Set(["NOT_A_REQUEST", "AUTOCLOSE", "WITHDRAWN"]);

export function isOpen(t: DashboardTicket): boolean {
  return OPEN_STATUSES.includes(t.status);
}
export function isClosedish(t: DashboardTicket): boolean {
  return (t.status === "CLOSED" || t.status === "ARCHIVED") && t.closedAt !== null;
}
export function isResolved(t: DashboardTicket): boolean {
  return isClosedish(t) && t.closeReason === "RESOLVED";
}
/** Resolved on or before the effective (target, else SLA) due date. */
export function isOnTime(t: DashboardTicket): boolean {
  return !!t.closedAt && t.closedAt.getTime() <= effectiveDueDate(t.slaDueAt, t.targetDueAt).getTime();
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 1000) / 10);

// ---------- 1. Workload ----------

export interface Workload {
  totalOpen: number;
  byPriority: { P1: number; P2: number; P3: number };
  byStatus: { key: string; label: string; count: number }[];
  unassigned: number;
  overdue: number;
  dueNext7WorkingDays: number;
  avgAgeCalendarDays: number | null;
  avgAgeWorkingDays: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New (Pool)",
  ALLOCATED: "Allocated",
  IN_ACTION: "In action",
  AWAITING_RESPONSE: "Awaiting response",
  RESPONSE_RECEIVED: "Response received",
  OUTCOME: "Outcome sent",
};

export function workload(rows: DashboardTicket[], now: Date, holidays: Set<string>): Workload {
  const open = rows.filter(isOpen);
  const in7 = addWorkingDays(now, 7, holidays);
  const statusCounts = new Map<string, { label: string; count: number }>();
  for (const key of Object.keys(STATUS_LABELS)) statusCounts.set(key, { label: STATUS_LABELS[key], count: 0 });
  for (const t of open) {
    // An action item (e.g. On Hold) is shown as its own row instead of In action.
    const key = t.status === "IN_ACTION" && t.actionStatus ? `item:${t.actionStatus.name}` : t.status;
    const label = t.status === "IN_ACTION" && t.actionStatus ? t.actionStatus.name : STATUS_LABELS[t.status] ?? t.status;
    const entry = statusCounts.get(key) ?? { label, count: 0 };
    entry.count++;
    statusCounts.set(key, entry);
  }
  const ages = open.map((t) => (now.getTime() - t.receivedAt.getTime()) / DAY_MS);
  const workAges = open.map((t) => workingDaysBetween(t.receivedAt, now, holidays));
  return {
    totalOpen: open.length,
    byPriority: {
      P1: open.filter((t) => t.priority === "P1").length,
      P2: open.filter((t) => t.priority === "P2").length,
      P3: open.filter((t) => t.priority === "P3").length,
    },
    byStatus: Array.from(statusCounts, ([key, v]) => ({ key, label: v.label, count: v.count })),
    unassigned: open.filter((t) => t.assignee === null).length,
    overdue: open.filter((t) => isOverdue(t.slaDueAt, t.targetDueAt, t.status, now)).length,
    dueNext7WorkingDays: open.filter((t) => {
      const due = effectiveDueDate(t.slaDueAt, t.targetDueAt);
      return due >= now && due <= in7;
    }).length,
    avgAgeCalendarDays: ages.length ? round1(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
    avgAgeWorkingDays: workAges.length ? round1(workAges.reduce((a, b) => a + b, 0) / workAges.length) : null,
  };
}

// ---------- 2. Distributions (open tickets) ----------

export interface CountRow {
  label: string;
  count: number;
  /** Drill-down filter value; null for "unassigned"/"none". */
  filter: string | null;
}

function countBy(rows: DashboardTicket[], pick: (t: DashboardTicket) => string | null, noneLabel: string): CountRow[] {
  const m = new Map<string | null, number>();
  for (const t of rows) m.set(pick(t), (m.get(pick(t)) ?? 0) + 1);
  return Array.from(m, ([k, count]) => ({ label: k ?? noneLabel, count, filter: k }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function distributions(rows: DashboardTicket[]) {
  const open = rows.filter(isOpen);
  return {
    byAssignee: countBy(open, (t) => t.assignee?.displayName ?? null, "Unassigned"),
    byBusinessUnit: countBy(open, (t) => t.businessUnit?.name ?? null, "(none set)"),
    byCategory: countBy(open, (t) => t.category?.name ?? null, "(none set)"),
  };
}

// ---------- 3. Throughput & resolution ----------

/** Start of the current Melbourne calendar month. */
export function melbourneMonthStart(now: Date): Date {
  const p = melbourneParts(now);
  return melbourneWallTimeToUtc(p.year, p.month, 1, 0, 0);
}

export interface Throughput {
  createdThisMonth: number;
  closedThisMonth: { resolved: number; infoOnlyAutocloseWithdrawn: number; other: number; total: number };
  /** Over the selected trend range. */
  avgResolutionDays: number | null;
  avgResolutionWorkingDays: number | null;
  complianceRate: number | null;
  resolvedInRange: number;
}

/** Resolved tickets closed in [start, end) -- no upper limit when `end` is left out. */
function resolvedIn(rows: DashboardTicket[], start: Date, end?: Date): DashboardTicket[] {
  return rows.filter((t) => isResolved(t) && t.closedAt! >= start && (!end || t.closedAt! < end));
}

export function throughput(rows: DashboardTicket[], now: Date, rangeStart: Date, holidays: Set<string>, rangeEnd?: Date): Throughput {
  const monthStart = melbourneMonthStart(now);
  const closedMonth = rows.filter((t) => isClosedish(t) && t.closedAt! >= monthStart);
  const resolvedRange = resolvedIn(rows, rangeStart, rangeEnd);
  const durations = resolvedRange.map((t) => (t.closedAt!.getTime() - t.receivedAt.getTime()) / DAY_MS);
  const workDurations = resolvedRange.map((t) => workingDaysBetween(t.receivedAt, t.closedAt!, holidays));
  const resolvedMonth = closedMonth.filter((t) => t.closeReason === "RESOLVED").length;
  const dropsMonth = closedMonth.filter((t) => ADMIN_DROP_REASONS.has(t.closeReason ?? "")).length;
  return {
    createdThisMonth: rows.filter((t) => t.receivedAt >= monthStart).length,
    closedThisMonth: {
      resolved: resolvedMonth,
      infoOnlyAutocloseWithdrawn: dropsMonth,
      other: closedMonth.length - resolvedMonth - dropsMonth,
      total: closedMonth.length,
    },
    avgResolutionDays: durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    avgResolutionWorkingDays: workDurations.length ? round1(workDurations.reduce((a, b) => a + b, 0) / workDurations.length) : null,
    complianceRate: pct(resolvedRange.filter(isOnTime).length, resolvedRange.length),
    resolvedInRange: resolvedRange.length,
  };
}

// ---------- 4. Compliance matrix ----------

export interface ComplianceRow {
  label: string;
  filter: string | null;
  resolved: number;
  onTime: number;
  rate: number | null;
}

function complianceBy(resolved: DashboardTicket[], pick: (t: DashboardTicket) => string | null, noneLabel: string): ComplianceRow[] {
  const m = new Map<string | null, { resolved: number; onTime: number }>();
  for (const t of resolved) {
    const k = pick(t);
    const e = m.get(k) ?? { resolved: 0, onTime: 0 };
    e.resolved++;
    if (isOnTime(t)) e.onTime++;
    m.set(k, e);
  }
  return Array.from(m, ([k, v]) => ({ label: k ?? noneLabel, filter: k, resolved: v.resolved, onTime: v.onTime, rate: pct(v.onTime, v.resolved) }))
    .sort((a, b) => b.resolved - a.resolved || a.label.localeCompare(b.label));
}

export function complianceMatrix(rows: DashboardTicket[], rangeStart: Date, rangeEnd?: Date) {
  const resolved = resolvedIn(rows, rangeStart, rangeEnd);
  return {
    byAssignee: complianceBy(resolved, (t) => t.assignee?.displayName ?? null, "Unassigned"),
    byBusinessUnit: complianceBy(resolved, (t) => t.businessUnit?.name ?? null, "(none set)"),
    byCategory: complianceBy(resolved, (t) => t.category?.name ?? null, "(none set)"),
  };
}

// ---------- 5. Trends ----------

export interface TrendPoint {
  label: string;
  start: string; // ISO
  inbound: number;
  closed: number;
  resolved: number;
  complianceRate: number | null;
}

/** Melbourne midnight at the start of `date`'s day. */
function melbourneDayStart(date: Date): Date {
  const p = melbourneParts(date);
  return melbourneWallTimeToUtc(p.year, p.month, p.day, 0, 0);
}

export interface TrendBucket {
  label: string;
  start: Date;
  end: Date;
}

/** Bucket boundaries for a range: 7d = 7 days, 30d/90d = weeks (Mon-start), 12m = calendar months. Last bucket ends at `now`. */
export function trendBuckets(range: TrendRange, now: Date): TrendBucket[] {
  const out: TrendBucket[] = [];
  const dayLabel = (d: Date) => {
    const k = melbourneDateKey(d);
    return `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  };
  if (range === "7d") {
    const today = melbourneDayStart(now);
    for (let i = 6; i >= 0; i--) {
      const start = addCalendarDaysMelbourne(today, -i);
      out.push({ label: dayLabel(start), start, end: addCalendarDaysMelbourne(start, 1) });
    }
  } else if (range === "12m") {
    const p = melbourneParts(now);
    for (let i = 11; i >= 0; i--) {
      const y = p.year + Math.floor((p.month - 1 - i) / 12);
      const m = ((((p.month - 1 - i) % 12) + 12) % 12) + 1;
      const start = melbourneWallTimeToUtc(y, m, 1, 0, 0);
      const end = melbourneWallTimeToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0);
      out.push({ label: start.toLocaleString("en-AU", { month: "short", year: "2-digit", timeZone: "Australia/Melbourne" }), start, end });
    }
  } else {
    const weeks = range === "30d" ? 5 : 13;
    // Monday of the current Melbourne week.
    const today = melbourneDayStart(now);
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(MELB_WEEKDAY.format(today)); // Mon = 0
    const thisMonday = addCalendarDaysMelbourne(today, -dow);
    for (let i = weeks - 1; i >= 0; i--) {
      const start = addCalendarDaysMelbourne(thisMonday, -7 * i);
      out.push({ label: dayLabel(start), start, end: addCalendarDaysMelbourne(start, 7) }); // week starting
    }
  }
  if (out.length) out[out.length - 1].end = new Date(Math.max(out[out.length - 1].end.getTime(), now.getTime()));
  return out;
}

export function trends(rows: DashboardTicket[], range: TrendRange | TrendBucket[], now: Date): TrendPoint[] {
  const buckets = Array.isArray(range) ? range : trendBuckets(range, now);
  return buckets.map((b) => {
    const inB = (d: Date | null) => !!d && d >= b.start && d < b.end;
    const closed = rows.filter((t) => isClosedish(t) && inB(t.closedAt));
    const resolved = closed.filter((t) => t.closeReason === "RESOLVED");
    return {
      label: b.label,
      start: b.start.toISOString(),
      inbound: rows.filter((t) => inB(t.receivedAt)).length,
      closed: closed.length,
      resolved: resolved.length,
      complianceRate: pct(resolved.filter(isOnTime).length, resolved.length),
    };
  });
}

/** Start of the selected trend range (the first bucket's start). */
export function rangeStart(range: TrendRange, now: Date): Date {
  return trendBuckets(range, now)[0].start;
}

/**
 * `range` is a quick range ("30d") or any reporting period with its own bars
 * (lib/dashboard/period.ts, 2026-10-08). The period only affects trends,
 * on-time rate, time to resolve and compliance -- workload is always "now"
 * and "This month" the current month.
 */
export function buildDashboard(
  rows: DashboardTicket[],
  range: TrendRange | { start: Date; end: Date; buckets: TrendBucket[] },
  now: Date,
  holidays: Set<string>,
) {
  const p = typeof range === "string" ? { start: rangeStart(range, now), end: undefined, buckets: trendBuckets(range, now) } : range;
  return {
    generatedAt: now.toISOString(),
    rangeStart: p.start.toISOString(),
    rangeEnd: (p.end ?? now).toISOString(),
    workload: workload(rows, now, holidays),
    distributions: distributions(rows),
    throughput: throughput(rows, now, p.start, holidays, p.end),
    compliance: complianceMatrix(rows, p.start, p.end),
    trends: trends(rows, p.buckets, now),
  };
}

export type DashboardData = ReturnType<typeof buildDashboard>;
