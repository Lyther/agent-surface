// synapse MCP — Clock: IClock implementations (real + fake for tests).

import type { IClock } from "./contract.js";

export class RealClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class FakeClock implements IClock {
  private t: number;
  constructor(start = 0) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(ms: number): void {
    this.t = ms;
  }
}
