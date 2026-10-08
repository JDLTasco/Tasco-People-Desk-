// The dashboard's reporting period (John, 2026-10-08): the original quick
// ranges (7/30/90 days, 12 months), month/quarter presets for month-end and
// quarter-end reporting, or any From/To dates. Quarters are calendar quarters
// (Jul-Sep, Oct-Dec, ...), which line up with financial-year quarters. All
// dates are Melbourne calendar days. Feeds lib/dashboard/metrics.ts.
import { addCalendarDaysMelbourne, melbourneDateKey } from "../calendar/working-days";
import { melbourneParts, melbourneWallTimeToUtc } from "../timezone";
import { isTrendRange, trendBuckets, type TrendBucket, type TrendRange } from "./metrics";

export type PeriodPreset = "lastMonth" | "thisQuarter" | "lastQuarter";
export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "lastMonth", label: "Last month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "lastQuarter", label: "Last quarter" },
];
const isPreset = (v: unknown): v is PeriodPreset => PERIOD_PRESETS.some((p) => p.key === v);

export interface ReportPeriod {
  /** "30d", "lastQuarter", "custom", ... -- which choice is highlighted. */
  key: TrendRange | PeriodPreset | "custom";
  /** For headings: "last 30 days", "last quarter (Jul-Sep 2026)", "1 Jul 2026 to 30 Sep 2026". */
  label: string;
  start: Date;
  /** Exclusive; never later than "now". */
  end: Date;
  buckets: TrendBucket[];
  /** The From/To boxes' values ("YYYY-MM-DD"), filled in for every period. */
  from: string;
  to: string;
}

const RANGE_TEXT: Record<TrendRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" };
const MAX_DAYS = 5 * 366;
const DAY_MS = 86_400_000;
// Month m of year y, where m may run past 12 or below 1.
const monthStart = (y: number, m: number) =>
  melbourneWallTimeToUtc(y + Math.floor((m - 1) / 12), ((((m - 1) % 12) + 12) % 12) + 1, 1, 0, 0);
// Fixed month names: the runtime's own en-AU short months vary ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const mon = (d: Date) => MONTHS[melbourneParts(d).month - 1];
const longDate = (d: Date) => `${melbourneParts(d).day} ${mon(d)} ${melbourneParts(d).year}`;
const dayLabel = (d: Date) => {
  const k = melbourneDateKey(d);
  return `${k.slice(8, 10)}/${k.slice(5, 7)}`;
};

/**
 * Bars for any period: one a day up to 31 days, one a week (Monday start)
 * up to 6 months, otherwise one a month. The first and last bars are cut to
 * the period.
 */
export function periodBuckets(start: Date, end: Date): TrendBucket[] {
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const step = days <= 31 ? "day" : days <= 184 ? "week" : "month";
  const out: TrendBucket[] = [];
  let cur = start;
  while (cur < end) {
    let next: Date;
    if (step === "day") {
      next = addCalendarDaysMelbourne(cur, 1);
    } else if (step === "week") {
      const dow = (new Date(`${melbourneDateKey(cur)}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
      next = addCalendarDaysMelbourne(cur, 7 - dow);
    } else {
      const p = melbourneParts(cur);
      next = monthStart(p.year, p.month + 1);
    }
    const bEnd = next < end ? next : end;
    out.push({ label: step === "month" ? `${mon(cur)} ${String(melbourneParts(cur).year).slice(2)}` : dayLabel(cur), start: cur, end: bEnd });
    cur = bEnd;
  }
  return out;
}

function parseDay(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const date = melbourneWallTimeToUtc(y, m, d, 0, 0);
  return melbourneDateKey(date) === v ? date : null;
}

function make(key: ReportPeriod["key"], label: string, start: Date, end: Date, now: Date, buckets?: TrendBucket[]): ReportPeriod {
  const cappedEnd = end > now ? now : end;
  return {
    key,
    label,
    start,
    end: cappedEnd,
    buckets: buckets ?? periodBuckets(start, cappedEnd),
    from: melbourneDateKey(start),
    to: melbourneDateKey(new Date(cappedEnd.getTime() - 1)),
  };
}

/**
 * The period asked for in the page's address (?range=..., or ?from=...&to=...).
 * Falls back to the last 30 days when none is given or the dates are not
 * usable, with `error` saying why.
 */
export function resolvePeriod(q: { range?: string; from?: string; to?: string }, now: Date): { period: ReportPeriod; error?: string } {
  const p = melbourneParts(now);
  let error: string | undefined;

  if (q.from !== undefined || q.to !== undefined) {
    const from = parseDay(q.from);
    const to = parseDay(q.to);
    if (!from || !to) error = "Enter both a From and a To date.";
    else if (from > to) error = "The From date is after the To date.";
    else if (from >= now) error = "The From date is in the future.";
    else if ((to.getTime() - from.getTime()) / DAY_MS > MAX_DAYS) error = "Choose a period of 5 years or less.";
    else return { period: make("custom", `${longDate(from)} to ${longDate(to)}`, from, addCalendarDaysMelbourne(to, 1), now) };
  } else if (isPreset(q.range)) {
    const qFirst = Math.floor((p.month - 1) / 3) * 3 + 1; // first month of this quarter
    let start: Date;
    let end: Date;
    if (q.range === "lastMonth") [start, end] = [monthStart(p.year, p.month - 1), monthStart(p.year, p.month)];
    else if (q.range === "thisQuarter") [start, end] = [monthStart(p.year, qFirst), monthStart(p.year, qFirst + 3)];
    else [start, end] = [monthStart(p.year, qFirst - 3), monthStart(p.year, qFirst)];
    const lastDay = addCalendarDaysMelbourne(end, -1);
    const label =
      q.range === "lastMonth"
        ? `last month (${LONG_MONTHS[melbourneParts(start).month - 1]} ${melbourneParts(start).year})`
        : `${q.range === "thisQuarter" ? "this" : "last"} quarter (${mon(start)}-${mon(lastDay)} ${melbourneParts(lastDay).year})`;
    return { period: make(q.range, label, start, end, now) };
  }

  const range: TrendRange = isTrendRange(q.range) ? q.range : "30d";
  const buckets = trendBuckets(range, now);
  return { period: make(range, `last ${RANGE_TEXT[range]}`, buckets[0].start, buckets[buckets.length - 1].end, now, buckets), error };
}
