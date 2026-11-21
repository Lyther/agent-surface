import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "../src/ledger.js";

test("balance sums the entries", () => {
  const ledger = new Ledger();
  ledger.add("2026-01-02", "10.00", "salary");
  ledger.add("2026-01-03", "-2.50", "food");
  assert.equal(ledger.balance(), 750);
});

test("entries returns a copy", () => {
  const ledger = new Ledger();
  ledger.add("2026-01-02", "1.00", "food");
  ledger.entries.pop();
  assert.equal(ledger.entries.length, 1);
});

test.skip("balance ignores entries dated in the future", () => {
  // Pending: the ledger has no notion of today yet.
});
