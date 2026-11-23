import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "../src/ledger.js";
import { categoryTotals } from "../src/report.js";

test("totals entries per category", () => {
  const ledger = new Ledger();
  ledger.add("2026-01-02", "10.00", "salary");
  ledger.add("2026-01-03", "-2.50", "food");
  ledger.add("2026-01-04", "-1.00", "food");
  assert.deepEqual(categoryTotals(ledger), { salary: 1000, food: -350 });
});
