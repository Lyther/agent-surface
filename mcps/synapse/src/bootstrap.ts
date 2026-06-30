// synapse — zero-config bootstrap: discovery file, persistent token, and lock-elected
// sidecar autostart. A host just launches the bridge; the first bridge elects itself to
// spawn the single shared sidecar, others wait for the discovery file. Files are mode 600.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Discovery { url: string; token: string; port: number; pid: number; startedAt: number }

export const discoveryPath = (dbDir: string): string => join(dbDir, "sidecar.json");
const lockPath = (dbDir: string): string => join(dbDir, "sidecar.lock");
const tokenPath = (dbDir: string): string => join(dbDir, "token");
const sidecarEntry = (): string => join(dirname(fileURLToPath(import.meta.url)), "sidecar.js");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function readOrCreateToken(dbDir: string): string {
  mkdirSync(dbDir, { recursive: true });
  const p = tokenPath(dbDir);
  try {
    const t = readFileSync(p, "utf8").trim();
    if (t) { try { chmodSync(p, 0o600); } catch { /* best effort */ } return t; }
  } catch { /* create below */ }
  const token = randomBytes(24).toString("base64url");
  writeFileSync(p, token, { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* best effort */ }
  return token;
}

export function writeDiscovery(dbDir: string, d: Discovery): void {
  // atomic: write temp then rename, and enforce 0600 even if a prior file existed.
  const p = discoveryPath(dbDir);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
  renameSync(tmp, p);
  try { chmodSync(p, 0o600); } catch { /* best effort */ }
}
export function removeDiscovery(dbDir: string): void { rmSync(discoveryPath(dbDir), { force: true }); }

function readDiscovery(dbDir: string): Discovery | null {
  try { return JSON.parse(readFileSync(discoveryPath(dbDir), "utf8")) as Discovery; } catch { return null; }
}

async function healthy(url: string, timeoutMs = 700): Promise<boolean> {
  try {
    const base = url.replace(/\/mcp$/, "");
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch { return false; }
}

/** Ensure a reachable sidecar exists; spawn it (lock-elected) if needed. Returns its url+token. */
export async function ensureSidecar(dbDir: string, spawnPort?: number): Promise<Discovery> {
  mkdirSync(dbDir, { recursive: true });
  const existing = readDiscovery(dbDir);
  if (existing && (await healthy(existing.url))) return existing;

  let won = false;
  try { closeSync(openSync(lockPath(dbDir), "wx")); won = true; }
  catch {
    try { if (Date.now() - statSync(lockPath(dbDir)).mtimeMs > 15_000) { rmSync(lockPath(dbDir), { force: true }); closeSync(openSync(lockPath(dbDir), "wx")); won = true; } } catch { /* lost race */ }
  }
  if (won) {
    const env: NodeJS.ProcessEnv = { ...process.env, SYNAPSE_DB_DIR: dbDir };
    if (spawnPort !== undefined) env["SYNAPSE_PORT"] = String(spawnPort);
    const child = spawn(process.execPath, [sidecarEntry()], { detached: true, stdio: "ignore", env });
    child.unref();
  }

  const deadline = Date.now() + 12_000;
  try {
    while (Date.now() < deadline) {
      const d = readDiscovery(dbDir);
      if (d && (await healthy(d.url))) return d;
      await sleep(150);
    }
    throw new Error("sidecar did not become reachable within 12s");
  } finally { if (won) rmSync(lockPath(dbDir), { force: true }); }
}
