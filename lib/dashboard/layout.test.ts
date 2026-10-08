import { test } from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_SECTIONS, parseDashboardLayout, resolveDashboardLayout, toDashboardLayout } from "./layout";

const defaultIds = DASHBOARD_SECTIONS.map((s) => s.id);

test("no saved layout = standard order, widths, nothing hidden", () => {
  const r = resolveDashboardLayout(null);
  assert.deepEqual(r.map((s) => s.id), defaultIds);
  assert.equal(r.find((s) => s.id === "byStatus")?.size, "third");
  assert.ok(r.every((s) => !s.hidden));
});

test("saved order/size/hidden apply; missing sections go at the end", () => {
  const layout = parseDashboardLayout({ order: ["terminations", "workload"], hidden: ["info"], sizes: { workload: "half" } });
  const r = resolveDashboardLayout(layout);
  assert.deepEqual(r.slice(0, 2).map((s) => s.id), ["terminations", "workload"]);
  assert.equal(r.length, defaultIds.length);
  assert.equal(r[1].size, "half");
  assert.equal(r.find((s) => s.id === "info")?.hidden, true);
});

test("parse drops unknown and repeated sections and bad sizes; refuses non-layouts", () => {
  assert.deepEqual(parseDashboardLayout({ order: ["trends", "salary", "trends"], hidden: ["x"], sizes: { trends: "huge", info: "half", x: "full" } }), {
    order: ["trends"],
    hidden: [],
    sizes: { info: "half" },
  });
  assert.equal(parseDashboardLayout(null), null);
  assert.equal(parseDashboardLayout({ hidden: [] }), null);
});

test("toDashboardLayout round-trips and only stores non-standard widths", () => {
  const r = resolveDashboardLayout(null).reverse();
  r[0].size = "half";
  r[3].hidden = true;
  const saved = toDashboardLayout(r);
  assert.deepEqual(Object.keys(saved.sizes), [r[0].id]);
  assert.deepEqual(resolveDashboardLayout(parseDashboardLayout(JSON.parse(JSON.stringify(saved)))), r);
});
