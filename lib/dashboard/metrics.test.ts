import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboard,
  complianceMatrix,
  distributions,
  isOnTime,
  melbourneMonthStart,
  throughput,
  trendBuckets,
  trends,
  workload,
  type DashboardTicket,
} from "./metrics";
import { melbourneWallTimeToUtc } from "../timezone";

const NONE = new Set<string>();
const melb = (y: number, m: number, d: number, h = 10) => melbourneWallTimeToUtc(y, m, d, h, 0);
const NOW = melb(2026, 10, 14, 12); // Wed 14 Oct 2026, 12:00
const LF = { id: "lf", displayName: "Lisa Ferguson" };
const DN = { id: "dn", displayName: "Dianne Nichols" };

let seq = 0;
function t(o: Partial<DashboardTicket>): DashboardTicket {
  return {
    id: `t${++seq}`,
    status: "NEW",
    priority: "P3",
    receivedAt: melb(2026, 10, 1),
    closedAt: null,
    closeReason: null,
    slaDueAt: melb(2026, 10, 31),
    targetDueAt: null,
    assignee: null,
    businessUnit: null,
    category: null,
    actionStatus: null,
    ...o,
  };
}

describe("isOnTime (target-date compliance)", () => {
  it("on time when closed on or before the target", () => {
    assert.equal(isOnTime(t({ closedAt: melb(2026, 10, 5), targetDueAt: melb(2026, 10, 6) })), true);
    assert.equal(isOnTime(t({ closedAt: melb(2026, 10, 6), targetDueAt: melb(2026, 10, 6) })), true);
  });
  it("breached when closed after the target", () => {
    assert.equal(isOnTime(t({ closedAt: melb(2026, 10, 7), targetDueAt: melb(2026, 10, 6) })), false);
  });
  it("an overridden (later) target counts, not the SLA date", () => {
    assert.equal(isOnTime(t({ closedAt: melb(2026, 11, 10), slaDueAt: melb(2026, 10, 31), targetDueAt: melb(2026, 11, 20) })), true);
  });
  it("no target -> measured against the SLA date", () => {
    assert.equal(isOnTime(t({ closedAt: melb(2026, 11, 2), slaDueAt: melb(2026, 10, 31) })), false);
  });
});

describe("workload", () => {
  const rows = [
    t({ status: "NEW", priority: "P1" }),
    t({ status: "IN_ACTION", assignee: LF, actionStatus: { name: "On Hold" } }),
    t({ status: "IN_ACTION", assignee: LF, targetDueAt: melb(2026, 10, 13) }), // overdue
    t({ status: "AWAITING_RESPONSE", assignee: DN, targetDueAt: melb(2026, 10, 16) }), // due in 7 wd
    t({ status: "CLOSED", closedAt: melb(2026, 10, 10), closeReason: "RESOLVED" }), // not open
  ];
  const w = workload(rows, NOW, NONE);

  it("counts open tickets, priorities and unassigned", () => {
    assert.equal(w.totalOpen, 4);
    assert.deepEqual(w.byPriority, { P1: 1, P2: 0, P3: 3 });
    assert.equal(w.unassigned, 1);
  });
  it("shows an action item (On Hold) as its own status row", () => {
    const get = (label: string) => w.byStatus.find((s) => s.label === label)?.count;
    assert.equal(get("On Hold"), 1);
    assert.equal(get("In action"), 1);
    assert.equal(get("Awaiting response"), 1);
  });
  it("overdue and due-in-7-working-days", () => {
    assert.equal(w.overdue, 1);
    assert.equal(w.dueNext7WorkingDays, 1);
  });
  it("average age in calendar and working days", () => {
    assert.ok(w.avgAgeCalendarDays! > 12 && w.avgAgeCalendarDays! < 14);
    assert.equal(w.avgAgeWorkingDays, 9); // Thu 1 Oct -> Wed 14 Oct
  });
});

describe("distributions", () => {
  it("groups open tickets by assignee incl. Unassigned", () => {
    const d = distributions([t({ assignee: LF, status: "ALLOCATED" }), t({ assignee: LF, status: "IN_ACTION" }), t({})]);
    assert.deepEqual(d.byAssignee.map((r) => [r.label, r.count, r.filter]), [["Lisa Ferguson", 2, "Lisa Ferguson"], ["Unassigned", 1, null]]);
  });
});

describe("throughput", () => {
  it("separates resolved from Info only / Autoclose / Withdrawn this month", () => {
    const rows = [
      t({ receivedAt: melb(2026, 10, 2), status: "CLOSED", closedAt: melb(2026, 10, 9), closeReason: "RESOLVED", targetDueAt: melb(2026, 10, 12) }),
      t({ receivedAt: melb(2026, 10, 3), status: "ARCHIVED", closedAt: melb(2026, 10, 3), closeReason: "NOT_A_REQUEST" }),
      t({ receivedAt: melb(2026, 9, 20), status: "ARCHIVED", closedAt: melb(2026, 10, 4), closeReason: "AUTOCLOSE" }),
      t({ receivedAt: melb(2026, 9, 1), status: "CLOSED", closedAt: melb(2026, 9, 30), closeReason: "WITHDRAWN" }), // last month
    ];
    const r = throughput(rows, NOW, melb(2026, 9, 15, 0), NONE);
    assert.equal(r.createdThisMonth, 2);
    assert.deepEqual(r.closedThisMonth, { resolved: 1, infoOnlyAutocloseWithdrawn: 2, other: 0, total: 3 });
    assert.equal(r.avgResolutionDays, 7);
    assert.equal(r.complianceRate, 100);
  });

  it("month start is Melbourne midnight on the 1st", () => {
    assert.equal(melbourneMonthStart(NOW).toISOString(), melb(2026, 10, 1, 0).toISOString());
  });
});

describe("complianceMatrix", () => {
  it("compliance % per assignee, counting only resolved tickets in range", () => {
    const rows = [
      t({ assignee: LF, status: "CLOSED", closeReason: "RESOLVED", closedAt: melb(2026, 10, 5), targetDueAt: melb(2026, 10, 6) }),
      t({ assignee: LF, status: "CLOSED", closeReason: "RESOLVED", closedAt: melb(2026, 10, 8), targetDueAt: melb(2026, 10, 6) }),
      t({ assignee: DN, status: "CLOSED", closeReason: "AUTOCLOSE", closedAt: melb(2026, 10, 8) }), // not counted
    ];
    const m = complianceMatrix(rows, melb(2026, 9, 1, 0));
    assert.deepEqual(m.byAssignee.map((r) => [r.label, r.resolved, r.onTime, r.rate]), [["Lisa Ferguson", 2, 1, 50]]);
  });
});

describe("trends", () => {
  it("7d = 7 daily buckets ending today; 30d = 5 weeks; 90d = 13 weeks; 12m = 12 months", () => {
    assert.equal(trendBuckets("7d", NOW).length, 7);
    assert.equal(trendBuckets("30d", NOW).length, 5);
    assert.equal(trendBuckets("90d", NOW).length, 13);
    const months = trendBuckets("12m", NOW);
    assert.equal(months.length, 12);
    assert.equal(months[11].start.toISOString(), melb(2026, 10, 1, 0).toISOString());
    assert.equal(months[0].start.toISOString(), melb(2025, 11, 1, 0).toISOString());
  });

  it("weekly buckets start on Melbourne Mondays", () => {
    const weeks = trendBuckets("30d", NOW);
    assert.equal(weeks[4].start.toISOString(), melb(2026, 10, 12, 0).toISOString()); // Mon 12 Oct
  });

  it("counts inbound vs closed per bucket with compliance", () => {
    const rows = [
      t({ receivedAt: melb(2026, 10, 13) }),
      t({ receivedAt: melb(2026, 10, 2), status: "CLOSED", closeReason: "RESOLVED", closedAt: melb(2026, 10, 13), targetDueAt: melb(2026, 10, 20) }),
    ];
    const pts = trends(rows, "7d", NOW);
    const tue = pts.find((p) => p.label === "13/10")!;
    assert.deepEqual([tue.inbound, tue.closed, tue.resolved, tue.complianceRate], [1, 1, 1, 100]);
  });
});

describe("§9 -- the dashboard only aggregates what it is given", () => {
  it("a confidential ticket filtered out by the loader cannot appear in any figure", () => {
    const visible = [t({ status: "NEW" })];
    const all = [...visible, t({ status: "NEW", priority: "P1", assignee: DN })]; // the hidden confidential one
    const forOfficer = buildDashboard(visible, "30d", NOW, NONE);
    const forAdmin = buildDashboard(all, "30d", NOW, NONE);
    assert.equal(forOfficer.workload.totalOpen, 1);
    assert.equal(forOfficer.workload.byPriority.P1, 0);
    assert.equal(forOfficer.distributions.byAssignee.some((r) => r.label === "Dianne Nichols"), false);
    assert.equal(forAdmin.workload.totalOpen, 2);
  });
});
