# Known issues

## 7. `formatCents` drops the sign of a negative amount under one unit

Status: confirmed and diagnosed, not fixed.

`formatCents(-5)` returns `"0.05"`; it should return `"-0.05"`. `formatCents(-1250)` is correct.

Cause: the sign is carried only by the whole part, `Math.trunc(cents / 100)`, and for an amount under one unit that is `-0`, which prints as `0`. The fraction already uses `Math.abs`. The fix belongs in `src/amount.js`.

Reproduce: `node -e 'import("./src/amount.js").then(m => console.log(m.formatCents(-5)))'`
