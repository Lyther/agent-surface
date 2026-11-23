import { parseAmount } from "./amount.js";

export class Ledger {
  #entries = [];

  add(date, text, category) {
    this.#entries.push({ date, cents: parseAmount(text), category });
  }

  get entries() {
    return [...this.#entries];
  }

  between(from, to) {
    return this.#entries.filter((entry) => entry.date >= from && entry.date <= to);
  }

  balance() {
    return this.#entries.reduce((sum, entry) => sum + entry.cents, 0);
  }
}
