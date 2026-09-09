#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import {
  collectMissingRequired, CredentialPromptCancelled, credentialStatus, ensureSecretIgnored,
  envExampleContent, envValueLiteral, formatMissingCredentialError, missingRequiredKeys, promptHidden,
  readEnvFile, resolveEnvFilePath, secretIgnorePatterns, writeEnvValues,
} from "../../scripts/agent-surface/credentials.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "as-credentials-"));
try {
  // ---- env-file location -------------------------------------------------
  assert.equal(
    resolveEnvFilePath({ scope: "project", installRoot: "/proj" }),
    path.join("/proj", ".env"),
    "project scope uses the target project's .env",
  );
  assert.equal(
    resolveEnvFilePath({ scope: "user", homedir: "/home/a", env: {} }),
    path.join("/home/a", ".config", "agent-surface", ".env"),
    "user scope defaults to ~/.config/agent-surface/.env",
  );
  assert.equal(
    resolveEnvFilePath({ scope: "user", homedir: "/home/a", env: { XDG_CONFIG_HOME: "/xdg" } }),
    path.join("/xdg", "agent-surface", ".env"),
    "user scope honors XDG_CONFIG_HOME",
  );
  assert.equal(
    resolveEnvFilePath({ scope: "project", installRoot: "/proj", envFileArg: "custom/.env" }),
    path.resolve("custom/.env"),
    "--env-file overrides and resolves absolute",
  );

  // ---- classification + precedence --------------------------------------
  const services = [
    ["synapse", { credentials: {} }], // keyless → omitted
    ["openosint", { credentials: { optional: [{ name: "SHODAN_API_KEY" }, { name: "HIBP_API_KEY" }] } }],
    ["acme", { credentials: { required: [{ name: "ACME_TOKEN" }], optional: [{ name: "ACME_REGION" }] } }],
  ];
  const status = credentialStatus(services, {
    fileValues: { SHODAN_API_KEY: "from-file", ACME_TOKEN: "" }, // empty value counts as absent
    processEnv: { HIBP_API_KEY: "from-env" },
  });
  assert.equal(status.find((s) => s.id === "synapse"), undefined, "keyless service omitted from status");
  const osint = status.find((s) => s.id === "openosint");
  assert.deepEqual(osint.optionalSatisfied.map((k) => k.name).sort(), ["HIBP_API_KEY", "SHODAN_API_KEY"], "file + env both satisfy optional keys");
  const acme = status.find((s) => s.id === "acme");
  assert.deepEqual(acme.requiredMissing.map((k) => k.name), ["ACME_TOKEN"], "empty file value is treated as missing");
  assert.deepEqual(acme.optionalMissing.map((k) => k.name), ["ACME_REGION"]);
  assert.deepEqual(missingRequiredKeys(status).map((k) => `${k.service}:${k.name}`), ["acme:ACME_TOKEN"]);

  const err = formatMissingCredentialError(status, "/proj/.env");
  assert.match(err, /acme needs ACME_TOKEN/);
  assert.match(err, /\/proj\/\.env/);
  assert.doesNotMatch(err, /from-file|from-env/, "error text never leaks values");
  assert.equal(formatMissingCredentialError([], "/proj/.env"), null, "no missing required → no error");

  // ---- value encoding round-trips ---------------------------------------
  assert.equal(envValueLiteral("abc123-._/:@=+"), "abc123-._/:@=+", "token charset stays bare");
  assert.equal(envValueLiteral("two words#x"), "'two words#x'", "spaces/# force single-quoting");
  assert.equal(envValueLiteral("has'quote"), null, "embedded single-quote is unencodable");
  assert.equal(envValueLiteral("line\nbreak"), null, "newline is unencodable");

  // ---- writing secrets (preserve + perms + round-trip) ------------------
  const envPath = path.join(dir, "proj", ".env");
  const first = await writeEnvValues(envPath, { TOKEN: "abc123", SECRET: "two words#x", PEM: "a\nb" });
  assert.deepEqual(first.appended.sort(), ["SECRET", "TOKEN"]);
  assert.deepEqual(first.unencodable, ["PEM"], "unencodable secret reported, not written");
  assert.equal(statSync(envPath).mode & 0o777, 0o600, "secret file is user-only (0600)");
  const readBack = await readEnvFile(envPath);
  assert.equal(readBack.TOKEN, "abc123");
  assert.equal(readBack.SECRET, "two words#x", "single-quoted value round-trips exactly");
  assert.equal(readBack.PEM, undefined);

  const second = await writeEnvValues(envPath, { TOKEN: "DIFFERENT", NEWKEY: "n1" });
  assert.deepEqual(second.appended, ["NEWKEY"], "existing key not overwritten; only new key appended");
  assert.equal((await readEnvFile(envPath)).TOKEN, "abc123", "prior value preserved");

  // ---- filling an existing EMPTY assignment (F004) ----------------------
  const fillPath = path.join(dir, "fill", ".env");
  await mkdir(path.dirname(fillPath), { recursive: true });
  await writeFile(fillPath, "# creds\nEXISTING=keep-me\nACME_TOKEN=\nDOLLAR1=\nDOLLARAMP=\n", { mode: 0o600 });
  const fillRes = await writeEnvValues(fillPath, {
    ACME_TOKEN: "now-set",
    // `$1` / `$&` inside a credential must stay literal through the in-place fill; a string
    // replacement would treat them as capture-group references and corrupt the secret.
    DOLLAR1: "review$1token",
    DOLLARAMP: "review$&token",
  });
  assert.deepEqual(fillRes.filled.sort(), ["ACME_TOKEN", "DOLLAR1", "DOLLARAMP"], "empty assignments filled in place, not skipped");
  assert.deepEqual(fillRes.appended, [], "no duplicate key appended for an existing empty key");
  const afterFill = await readEnvFile(fillPath);
  assert.equal(afterFill.ACME_TOKEN, "now-set", "previously empty key now carries the value");
  assert.equal(afterFill.DOLLAR1, "review$1token", "credential containing $1 round-trips literally");
  assert.equal(afterFill.DOLLARAMP, "review$&token", "credential containing $& round-trips literally");
  assert.equal(afterFill.EXISTING, "keep-me", "unrelated key preserved");

  // ---- .gitignore / .npmignore hygiene (F002: never create a fresh .npmignore) --
  const repo = path.join(dir, "repo");
  await mkdir(repo, { recursive: true });
  await writeFile(path.join(repo, ".gitignore"), "node_modules/\n");
  // No .npmignore exists → it must NOT be created: npm would then stop using .gitignore as its
  // package-exclusion fallback and silently re-include everything else. Only .gitignore is touched.
  const updated1 = await ensureSecretIgnored(repo, [".env", ".env.local"]);
  assert.deepEqual(updated1, [".gitignore"], "absent .npmignore is not created; only .gitignore updated");
  assert.ok(!existsSync(path.join(repo, ".npmignore")), "no fresh .npmignore is written");
  const gitignore = await readFile(path.join(repo, ".gitignore"), "utf8");
  assert.match(gitignore, /^node_modules\/$/m, "existing entry preserved");
  assert.match(gitignore, /^\.env$/m);
  const updated2 = await ensureSecretIgnored(repo, [".env", ".env.local"]);
  assert.deepEqual(updated2, [], "idempotent: no duplicate entries added");
  // An existing .npmignore IS maintained (npm ignores .gitignore when .npmignore is present).
  await writeFile(path.join(repo, ".npmignore"), "dist/\n");
  const updated3 = await ensureSecretIgnored(repo, [".env"]);
  assert.deepEqual(updated3, [".npmignore"], "existing .npmignore gains the secret pattern");
  const npmignore = await readFile(path.join(repo, ".npmignore"), "utf8");
  assert.match(npmignore, /^dist\/$/m, "existing .npmignore entry preserved");
  assert.match(npmignore, /^\.env$/m);

  // ---- secret-file exclusion derives from the actual file (F003) ---------
  assert.deepEqual(
    secretIgnorePatterns(path.join("/proj", ".env"), "/proj"),
    [".env", ".env.*", "!.env.example"],
    "default location keeps the .env family excluded",
  );
  assert.deepEqual(
    secretIgnorePatterns(path.join("/proj", "credentials.env"), "/proj"),
    ["credentials.env"],
    "a custom --env-file name is excluded by its own path, not the .env glob",
  );
  assert.deepEqual(
    secretIgnorePatterns(path.join("/proj", "config", "secrets.env"), "/proj"),
    ["config/secrets.env"],
    "a nested custom file is excluded by its relative path",
  );
  assert.deepEqual(
    secretIgnorePatterns("/home/u/.config/agent-surface/.env", "/proj"),
    [],
    "a file outside the repo yields no in-repo ignore pattern",
  );

  // ---- .env.example template --------------------------------------------
  const template = envExampleContent(status);
  assert.match(template, /^ACME_TOKEN=$/m, "template lists missing required key with empty value");
  assert.match(template, /^ACME_REGION=$/m, "template lists missing optional key");
  assert.doesNotMatch(template, /^SHODAN_API_KEY=/m, "already-satisfied keys are not re-listed");
  assert.doesNotMatch(template, /from-file|from-env/, "template carries no values");

  // ---- interactive collection (injected prompt; no TTY) -----------------
  const asked = [];
  const collected = await collectMissingRequired(status, {
    prompt: async (label) => { asked.push(label); return label.includes("ACME_TOKEN") ? "typed-secret" : ""; },
  });
  assert.equal(asked.length, 1, "prompts only for missing required keys");
  assert.deepEqual(collected, { ACME_TOKEN: "typed-secret" }, "non-empty entry captured, empty skipped");

  // ---- hidden prompt masks input, shows label, returns value ------------
  {
    const input = new PassThrough();
    let captured = "";
    const output = new Writable({ write(chunk, _enc, cb) { captured += chunk.toString(); cb(); } });
    const answer = promptHidden("Enter TOKEN: ", { input, output });
    setTimeout(() => input.write("s3cr3t-value\n"), 5);
    assert.equal(await answer, "s3cr3t-value", "hidden prompt returns the typed value");
    assert.ok(captured.includes("Enter TOKEN:"), "prompt label is visible");
    assert.ok(!captured.includes("s3cr3t-value"), "typed secret is never echoed");
  }

  // ---- hidden prompt settles cleanly on cancellation (F005) -------------
  {
    const input = new PassThrough();
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const pending = promptHidden("Enter TOKEN: ", { input, output });
    input.end(); // input stream closing stands in for Ctrl+C: readline closes with no answer
    await assert.rejects(pending, (e) => e instanceof CredentialPromptCancelled, "cancelled prompt rejects; never hangs");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("credentials: ok");
