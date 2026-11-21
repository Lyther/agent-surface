# pocket-ledger

A tiny ledger library: amounts are integer cents, a ledger holds dated entries, and `npm test` runs the suite (Node's built-in test runner, no dependencies).

- `src/amount.js`: `parseAmount("12.50")` gives `1250`; `formatCents(1250)` gives `"12.50"`.
- `src/ledger.js`: `Ledger` with `add`, `balance` and `entries`.
- `docs/known-issues.md`: open bugs.
