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
