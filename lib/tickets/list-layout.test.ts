import { test } from "node:test";
import assert from "node:assert/strict";
import { LIST_COLUMN_IDS, parseListLayout } from "./list-layout";

const order = [...LIST_COLUMN_IDS].reverse();
const widths = LIST_COLUMN_IDS.map(() => 10);

test("accepts a full reordering with widths", () => {
  assert.deepEqual(parseListLayout({ order, widths }), { order, widths });
});

test("bad or missing widths fall back to automatic, keeping the order", () => {
  assert.deepEqual(parseListLayout({ order }), { order, widths: null });
  assert.deepEqual(parseListLayout({ order, widths: [50, 50] }), { order, widths: null });
  assert.deepEqual(parseListLayout({ order, widths: widths.map(() => -1) }), { order, widths: null });
});

test("rejects an order with missing, repeated or unknown columns", () => {
  assert.equal(parseListLayout({ order: order.slice(1), widths }), null);
  assert.equal(parseListLayout({ order: [...order.slice(1), order[1]], widths }), null);
  assert.equal(parseListLayout({ order: [...order.slice(1), "salary"], widths }), null);
  assert.equal(parseListLayout(null), null);
  assert.equal(parseListLayout("ticket"), null);
});

test("a layout saved before the Attachments column gets it back after Subject", () => {
  const old = LIST_COLUMN_IDS.filter((id) => id !== "attachments");
  const moved = ["subject", ...old.filter((id) => id !== "subject")];
  const parsed = parseListLayout({ order: moved, widths: moved.map(() => 10) });
  assert.deepEqual(parsed?.order.slice(0, 2), ["subject", "attachments"]);
  assert.equal(parsed?.order.length, LIST_COLUMN_IDS.length);
  assert.equal(Math.round(parsed!.widths!.reduce((a, b) => a + b, 0)), 100);
  assert.ok(parsed!.widths![1] < parsed!.widths![0]);
  assert.deepEqual(parseListLayout({ order: old }), { order: [...LIST_COLUMN_IDS], widths: null });
});
