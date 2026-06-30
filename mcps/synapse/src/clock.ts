import type { IClock } from "./contract.js";

export class SystemClock implements IClock {
  now(): number { return Date.now(); }
}

/** Injectable deterministic clock for tests. */
export class FakeClock implements IClock {
  constructor(private t: number) {}
  now(): number { return this.t; }
  advance(ms: number): void { this.t += ms; }
  set(ms: number): void { this.t = ms; }
}
