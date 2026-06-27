// Type declarations for node:sqlite. NOTE: 22.5.0 added it behind
// --experimental-sqlite (require() fails with ERR_UNKNOWN_BUILTIN_MODULE);
// importable without the flag from Node 22.17.0 (still emits ExperimentalWarning),
// stabilized in Node 24+. Engine floor is therefore >=22.17.0.
// @types/node may not include these yet.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    readonly [Symbol.dispose]: () => void;
  }
  export interface StatementSync {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  }
}
