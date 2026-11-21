import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCents, parseAmount } from "../src/amount.js";

test("parses whole and fractional amounts", () => {
  assert.equal(parseAmount("12.50"), 1250);
  assert.equal(parseAmount("7"), 700);
  assert.equal(parseAmount("0.5"), 50);
});

test("parses negative amounts", () => {
  assert.equal(parseAmount("-3.20"), -320);
});

test("rejects text that is not an amount", () => {
  assert.throws(() => parseAmount("twelve"), /not an amount/);
});

test("formats positive cents", () => {
  assert.equal(formatCents(1250), "12.50");
  assert.equal(formatCents(5), "0.05");
});

test("formats negative cents of a whole unit or more", () => {
  assert.equal(formatCents(-1250), "-12.50");
});
