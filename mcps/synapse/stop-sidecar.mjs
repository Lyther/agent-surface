// The installer's stop step, kept importable so it can be tested without running an install. A
// running sidecar keeps serving the old build until it exits; stopping it makes open bridges elect a
// sidecar from the new build on their next call.
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
      console.warn(`WARNING: the sidecar at ${url} did not answer /health within ${HEALTH_TIMEOUT_MS} ms, so nothing was stopped; stop the running Synapse sidecar so bridges start one from this build`);
    }
    return;
  }
  if (health?.name !== "synapse") return;
  // A stale record can name a recycled pid while a different sidecar answers its address, so only the
  // process that reports this pid as its own is signalled.
  if (health.pid !== pid) {
    console.warn(`WARNING: the sidecar at ${url} does not report pid ${pid}, so nothing was stopped; stop the running Synapse sidecar so bridges start one from this build`);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    // ESRCH: it exited after the health check, so there is nothing left to stop.
    if (error.code !== "ESRCH") console.warn(`WARNING: could not stop the running sidecar (pid ${pid}, ${error.code}); stop it so bridges start one from this build`);
    return;
  }
  console.log(`stopped the running sidecar (pid ${pid}); the next bridge call starts one from this build`);
}
