import { formatCents } from "./amount.js";

export function categoryTotals(ledger) {
  const totals = {};
  for (const { cents, category } of ledger.entries) {
    totals[category] = (totals[category] ?? 0) + cents;
  }
  return totals;
}

export function summary(ledger) {
  const lines = Object.entries(categoryTotals(ledger)).map(([category, cents]) => `${category}: ${formatCents(cents)}`);
  return lines.join("\n");
}
