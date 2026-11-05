// The v0.4 hand-over's stop step (install.mjs). A v0.4 sidecar left running would keep the old build
// alive for sessions started before the upgrade; nothing in this build starts or uses one. Deleted one
// release after v0.5, with the hand-over.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// A sidecar that answers at all answers /health within milliseconds; this only bounds a stuck one.
const HEALTH_TIMEOUT_MS = 1000;

export async function stopRunningSidecar(dbDir = process.env.SYNAPSE_DB_DIR ?? path.join(os.homedir(), ".synapse")) {
  let discovery;
  try { discovery = JSON.parse(readFileSync(path.join(dbDir, "sidecar.json"), "utf8")); } catch { return; }
  const { pid, url } = discovery ?? {};
  if (!Number.isInteger(pid) || pid <= 0 || typeof url !== "string") return;
  try { process.kill(pid, 0); } catch { return; }
  let health;
  try {
    const res = await fetch(`${url.replace(/\/mcp$/, "")}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    health = res.ok ? await res.json() : undefined;
  } catch (error) {
    // Nothing listening at the address means no sidecar is left to stop. A process that holds the address
    // but does not answer may be a stuck sidecar whose pid cannot be proven, so it is left alone and reported.
    if (error?.name === "TimeoutError") {
      console.warn(`WARNING: the v0.4 sidecar at ${url} did not answer /health within ${HEALTH_TIMEOUT_MS} ms, so nothing was stopped; if pid ${pid} is that sidecar, stop it`);
    }
    return;
  }
  if (health?.name !== "synapse") return;
  // A stale record can name a recycled pid while a different sidecar answers its address, so only the
  // process that reports this pid as its own is signalled.
  if (health.pid !== pid) {
    console.warn(`WARNING: the v0.4 sidecar at ${url} does not report pid ${pid}, so nothing was stopped; stop the Synapse sidecar that answers there`);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    // ESRCH: it exited after the health check, so there is nothing left to stop.
    if (error.code !== "ESRCH") console.warn(`WARNING: could not stop the v0.4 sidecar (pid ${pid}, ${error.code}); stop it`);
    return;
  }
  console.log(`stopped the v0.4 sidecar (pid ${pid})`);
}
