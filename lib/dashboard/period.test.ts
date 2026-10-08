import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { periodBuckets, resolvePeriod } from "./period";
import { buildDashboard, trendBuckets, type DashboardTicket } from "./metrics";
import { melbourneWallTimeToUtc } from "../timezone";

const melb = (y: number, m: number, d: number, h = 0) => melbourneWallTimeToUtc(y, m, d, h, 0);
const NOW = melb(2026, 10, 8, 14); // Thu 8 Oct 2026, 2pm Melbourne

describe("resolvePeriod", () => {
  it("defaults to the last 30 days, the same bars as before", () => {
    const { period, error } = resolvePeriod({}, NOW);
    assert.equal(error, undefined);
    assert.equal(period.key, "30d");
    assert.equal(period.label, "last 30 days");
    assert.deepEqual(period.buckets.map((b) => b.label), trendBuckets("30d", NOW).map((b) => b.label));
    assert.equal(period.end.getTime(), NOW.getTime());
  });

  it("last month = all of September, one bar a day", () => {
    const { period } = resolvePeriod({ range: "lastMonth" }, NOW);
    assert.equal(period.start.getTime(), melb(2026, 9, 1).getTime());
    assert.equal(period.end.getTime(), melb(2026, 10, 1).getTime());
    assert.equal(period.label, "last month (September 2026)");
    assert.equal(period.buckets.length, 30);
    assert.deepEqual([period.from, period.to], ["2026-09-01", "2026-09-30"]);
  });

  it("last quarter = Jul-Sep, weekly bars cut to the quarter", () => {
    const { period } = resolvePeriod({ range: "lastQuarter" }, NOW);
    assert.equal(period.start.getTime(), melb(2026, 7, 1).getTime());
    assert.equal(period.end.getTime(), melb(2026, 10, 1).getTime());
    assert.equal(period.label, "last quarter (Jul-Sep 2026)");
    assert.equal(period.buckets[0].start.getTime(), melb(2026, 7, 1).getTime()); // Wed, not the Monday before
    assert.equal(period.buckets[1].start.getTime(), melb(2026, 7, 6).getTime()); // next Monday
    assert.equal(period.buckets[period.buckets.length - 1].end.getTime(), melb(2026, 10, 1).getTime());
  });

  it("this quarter runs from 1 October to now", () => {
    const { period } = resolvePeriod({ range: "thisQuarter" }, NOW);
    assert.equal(period.start.getTime(), melb(2026, 10, 1).getTime());
    assert.equal(period.end.getTime(), NOW.getTime());
    assert.equal(period.label, "this quarter (Oct-Dec 2026)");
  });

  it("last quarter in January is October-December of the year before", () => {
    const { period } = resolvePeriod({ range: "lastQuarter" }, melb(2027, 1, 15, 9));
    assert.equal(period.start.getTime(), melb(2026, 10, 1).getTime());
    assert.equal(period.end.getTime(), melb(2027, 1, 1).getTime());
  });

  it("From/To includes the whole To day; long periods get monthly bars", () => {
    const { period } = resolvePeriod({ from: "2025-07-01", to: "2026-06-30" }, NOW);
    assert.equal(period.key, "custom");
    assert.equal(period.end.getTime(), melb(2026, 7, 1).getTime());
    assert.equal(period.buckets.length, 12);
    assert.equal(period.label, "1 Jul 2025 to 30 Jun 2026");
  });

  it("a To date in the future stops at now", () => {
    const { period } = resolvePeriod({ from: "2026-10-01", to: "2026-12-31" }, NOW);
    assert.equal(period.end.getTime(), NOW.getTime());
  });

  it("bad From/To fall back to 30 days with a reason", () => {
    for (const [q, msg] of [
      [{ from: "2026-09-30", to: "2026-09-01" }, "after"],
      [{ from: "2026-09-01" }, "both"],
      [{ from: "2026-02-30", to: "2026-03-01" }, "both"],
      [{ from: "2027-01-01", to: "2027-02-01" }, "future"],
      [{ from: "2010-01-01", to: "2026-01-01" }, "5 years"],
    ] as const) {
      const { period, error } = resolvePeriod(q, NOW);
      assert.equal(period.key, "30d");
      assert.match(error ?? "", new RegExp(msg));
    }
  });
});

describe("periodBuckets", () => {
  it("covers the period exactly with no gaps", () => {
    const start = melb(2026, 3, 18);
    const end = melb(2026, 8, 2);
    const b = periodBuckets(start, end);
    assert.equal(b[0].start.getTime(), start.getTime());
    assert.equal(b[b.length - 1].end.getTime(), end.getTime());
    for (let i = 1; i < b.length; i++) assert.equal(b[i].start.getTime(), b[i - 1].end.getTime());
  });
});

describe("buildDashboard with a closed period", () => {
  const t = (closed: Date, received: Date): DashboardTicket => ({
    id: closed.toISOString(),
    status: "CLOSED",
    priority: "P3",
    receivedAt: received,
    closedAt: closed,
    closeReason: "RESOLVED",
    slaDueAt: melb(2027, 1, 1),
    targetDueAt: null,
    assignee: null,
    businessUnit: null,
    category: null,
    actionStatus: null,
  });
  it("only counts tickets resolved inside the period", () => {
    const rows = [t(melb(2026, 8, 31, 12), melb(2026, 8, 30)), t(melb(2026, 9, 15), melb(2026, 9, 10)), t(melb(2026, 10, 2), melb(2026, 9, 29))];
    const { period } = resolvePeriod({ range: "lastMonth" }, NOW);
    const d = buildDashboard(rows, period, NOW, new Set());
    assert.equal(d.throughput.resolvedInRange, 1);
    assert.equal(d.trends.reduce((a, p) => a + p.resolved, 0), 1);
    assert.equal(d.compliance.byAssignee[0].resolved, 1);
  });
});
