#!/usr/bin/env node
/**
 * agent-surface test runner — focused suites instead of one god file.
 * Order: cheap/static first, then build, then install, then workflow.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function wipeDist() {
  rmSync(dist, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const suites = [
  "roots.test.mjs",
  "credentials.test.mjs",
  "mcp-env-launch.test.mjs",
  "mcp-shims.test.mjs",
  "mcp-credential-launch.test.mjs",
  "provision.test.mjs",
  "provision-exec.test.mjs",
  "provision-install.test.mjs",
  "dependency-security.test.mjs",
  "hooks.test.mjs",
  "policy.test.mjs",
  "matrix.test.mjs",
  "check.test.mjs",
  "build.test.mjs",
  "runtime.test.mjs",
  "install.test.mjs",
  "install-live.test.mjs",
  "workflow.test.mjs",
  // Opt-in networked acceptances (AGENT_SURFACE_LIVE_*); they skip by default so the suite stays offline.
  "live-launch.test.mjs",
  "live-provision.test.mjs",
];

wipeDist();
try {
  for (const name of suites) {
    await import(pathToFileURL(path.join(root, "tests", "suites", name)).href);
  }
  console.log("test: ok");
} finally {
  wipeDist();
}
