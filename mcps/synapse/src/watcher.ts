// synapse MCP — Watcher: cross-process change notification via poll + fs.watch.
// v0.1 is stdio multi-process over one WAL file. No in-process SQLite update
// hook can see another process's writes, so we poll the event-log offset and
// accelerate wake with an fs.watch on a per-namespace tick-file.

import { existsSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IStore, IWatcher, Offset } from "./contract.js";

export class PollWatcher implements IWatcher {
  private store: IStore;
  private pollMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private fsw: FSWatcher | null = null;
  private lastSeen: Offset = 0;
  private callbacks: ((offset: Offset) => void)[] = [];
  private tickFile: string;

  constructor(store: IStore, dbDir: string, namespace: string, pollMs = 200) {
    this.store = store;
    this.pollMs = pollMs;
    this.tickFile = join(dbDir, `${namespace}.tick`);
    this.lastSeen = store.latestOffset();
  }

  start(): void {
    // Create the tick file deterministically BEFORE watching so fs.watch can
    // subscribe. Static import (this is an ESM package — `require` is undefined
    // in the built server, which silently broke the tick path before).
    try {
      if (!existsSync(this.tickFile)) {
        writeFileSync(this.tickFile, "", { mode: 0o600 });
      }
    } catch {
      // Best-effort; poll is the floor.
    }
    // Poll loop.
    this.timer = setInterval(() => this.check(), this.pollMs);
    // fs.watch tick-file for immediate wake.
    try {
      this.fsw = watch(this.tickFile, () => this.check());
    } catch {
      // fs.watch may still fail on some platforms; poll is the floor.
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fsw) {
      this.fsw.close();
      this.fsw = null;
    }
    this.callbacks = [];
  }

  onChange(cb: (latestOffset: Offset) => void): void {
    this.callbacks.push(cb);
  }

  /** Bump the tick-file (called by the writer process to wake other processes). */
  async tick(): Promise<void> {
    try {
      const now = Date.now() / 1000;
      await utimes(this.tickFile, now, now).catch(async () => {
        await writeFile(this.tickFile, "", { mode: 0o600 });
      });
    } catch {
      // Best-effort; poll is the floor.
    }
  }

  private check(): void {
    const latest = this.store.latestOffset();
    if (latest > this.lastSeen) {
      this.lastSeen = latest;
      for (const cb of this.callbacks) {
        cb(latest);
      }
    }
  }
}
