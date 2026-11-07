#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { status } from "../lib/helpers.mjs";

// doctor's first-party lines describe the home it runs under: the Grimoire index, the synapse-hook
// launcher, and each hook host's user-scope entry, first absent and then present.
const doctorHome = mkdtempSync(path.join(tmpdir(), "agent-surface-doctor-"));
try {
  const doctor = () => {
    const result = status(["doctor"], { env: { ...process.env, HOME: doctorHome, USERPROFILE: doctorHome } });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    return result.stdout;
  };
  const before = doctor();
  assert.match(before, /^grimoire-index: missing \(npm run install:grimoire\)$/m);
  assert.match(before, /^synapse-hook: missing \(npm run install:synapse\)$/m);
  assert.match(before, /^synapse-hook claude-code: not registered in ~\/\.claude\/settings\.json \(agent-surface install --target claude-code --category mcps\)$/m);

  mkdirSync(path.join(doctorHome, ".grimoire"), { recursive: true });
  writeFileSync(path.join(doctorHome, ".grimoire", "index.sqlite"), "");
  const hookCommand = path.join(doctorHome, ".local", "bin", "synapse-hook");
  mkdirSync(path.dirname(hookCommand), { recursive: true });
  writeFileSync(hookCommand, "");
  mkdirSync(path.join(doctorHome, ".claude"), { recursive: true });
  writeFileSync(path.join(doctorHome, ".claude", "settings.json"), JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: hookCommand }] }] },
  }));
  const after = doctor();
  assert.match(after, /^grimoire-index: present$/m);
  assert.match(after, /^synapse-hook: linked$/m);
  assert.match(after, /^synapse-hook claude-code: registered \(~\/\.claude\/settings\.json\)$/m);
  assert.match(after, /^synapse-hook codex: not registered in ~\/\.codex\/hooks\.json/m);
} finally {
  rmSync(doctorHome, { recursive: true, force: true });
}

console.log("runtime: ok");
