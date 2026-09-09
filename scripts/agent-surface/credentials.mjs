// Credential resolution for MCP provisioning: locate the scope's env-file, read existing
// values, classify each selected service's required/optional keys, and (interactive only)
// gather + persist missing required secrets. Pure/injectable so the install planner can call
// it in both interactive and headless modes off one code path. Values never appear in plan
// output, logs, or generated host config — only key NAMES and the env-file PATH do.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseEnv } from "node:util";
import { readFileIfExists } from "./io.mjs";

// ---- env-file location ----------------------------------------------------
// Project scope keeps secrets beside the target project (its own .env). User scope uses a
// stable per-user config path so an IDE launching the MCP from any working directory still
// resolves the same file. `--credentials-file` overrides either. Returns an absolute path.
export function resolveEnvFilePath({ scope, installRoot, envFileArg, homedir = os.homedir(), env = process.env }) {
  if (envFileArg) return path.resolve(envFileArg);
  if (scope === "user") {
    const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() ? env.XDG_CONFIG_HOME : path.join(homedir, ".config");
    return path.join(base, "agent-surface", ".env");
  }
  return path.join(installRoot, ".env");
}

export async function readEnvFile(filePath) {
  const text = await readFileIfExists(filePath);
  if (text === null) return {};
  try {
    return parseEnv(text.toString("utf8"));
  } catch {
    return {}; // a malformed file is treated as "no values"; we never guess secret contents
  }
}

// ---- service metadata -----------------------------------------------------
export function serviceCredentialKeys(service) {
  const credentials = service?.credentials ?? {};
  return { required: credentials.required ?? [], optional: credentials.optional ?? [] };
}

const present = (name, fileValues, processEnv) => {
  const fromEnv = processEnv[name];
  if (typeof fromEnv === "string" && fromEnv.length > 0) return true; // precedence: process env first
  const fromFile = fileValues[name];
  return typeof fromFile === "string" && fromFile.length > 0;
};

// Per selected service, split required/optional keys into satisfied vs missing. Keyless
// services (no declared credentials) are omitted entirely.
export function credentialStatus(serviceEntries, { fileValues = {}, processEnv = process.env } = {}) {
  const status = [];
  for (const [id, service] of serviceEntries) {
    const { required, optional } = serviceCredentialKeys(service);
    if (required.length === 0 && optional.length === 0) continue;
    const split = (keys) => ({
      satisfied: keys.filter((k) => present(k.name, fileValues, processEnv)),
      missing: keys.filter((k) => !present(k.name, fileValues, processEnv)),
    });
    const req = split(required);
    const opt = split(optional);
    status.push({ id, requiredSatisfied: req.satisfied, requiredMissing: req.missing, optionalSatisfied: opt.satisfied, optionalMissing: opt.missing });
  }
  return status;
}

export function missingRequiredKeys(status) {
  return status.flatMap((s) => s.requiredMissing.map((k) => ({ service: s.id, ...k })));
}

// ---- reporting (names only; never values) ---------------------------------
export function formatCredentialPlan(status) {
  const lines = [];
  for (const s of status) {
    const parts = [];
    if (s.requiredSatisfied.length) parts.push(`required ok: ${s.requiredSatisfied.map((k) => k.name).join(", ")}`);
    if (s.requiredMissing.length) parts.push(`required MISSING: ${s.requiredMissing.map((k) => k.name).join(", ")}`);
    if (s.optionalSatisfied.length) parts.push(`optional ok: ${s.optionalSatisfied.map((k) => k.name).join(", ")}`);
    if (s.optionalMissing.length) parts.push(`optional absent: ${s.optionalMissing.map((k) => k.name).join(", ")}`);
    lines.push(`  ${s.id}: ${parts.join("; ") || "keyless"}`);
  }
  return lines;
}

export function formatMissingCredentialError(status, envFilePath) {
  const missing = missingRequiredKeys(status);
  if (missing.length === 0) return null;
  const byService = new Map();
  for (const k of missing) byService.set(k.service, [...(byService.get(k.service) ?? []), k.name]);
  const detail = [...byService].map(([id, names]) => `${id} needs ${names.join(", ")}`).join("; ");
  return `missing required credentials (${detail}); set them in the environment or ${envFilePath}, then re-run`;
}

export function envExampleContent(status) {
  const lines = ["# agent-surface MCP credentials — fill values, then re-run install.", "# This file is a template; real secrets belong in .env (git-ignored), never here.", ""];
  for (const s of status) {
    for (const k of [...s.requiredMissing, ...s.optionalMissing]) {
      lines.push(`# ${s.id}${s.requiredMissing.includes(k) ? " (required)" : " (optional)"}: ${k.description ?? ""}`.trimEnd());
      lines.push(`${k.name}=`);
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---- writing secrets ------------------------------------------------------
// Serialize a value so Node's parseEnv reads it back byte-for-byte. Bare for the common token
// charset; single-quoted (fully literal) otherwise. Refuse (null) values that can't be encoded
// on one line — the caller reports them instead of silently corrupting a secret.
export function envValueLiteral(value) {
  if (/^[A-Za-z0-9_.:/@+=-]+$/.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  return null;
}

export async function writeEnvValues(filePath, values, { homedir = os.homedir() } = {}) {
  const existingText = (await readFileIfExists(filePath))?.toString("utf8") ?? "";
  const existing = existingText ? safeParse(existingText) : {};
  const appended = [];
  const filled = [];
  const unencodable = [];
  const appendLines = [];
  let body = existingText;
  for (const [name, value] of Object.entries(values)) {
    const current = existing[name];
    if (typeof current === "string" && current.length > 0) continue; // never overwrite a real value
    const literal = envValueLiteral(value);
    if (literal === null) { unencodable.push(name); continue; }
    // A key already present but empty (KEY=) is missing per classification, so it must be
    // fillable: rewrite that line in place, preserving comments, ordering, and unrelated keys.
    // Only fall back to appending when no empty assignment for the key exists.
    if (Object.hasOwn(existing, name)) {
      const rewritten = fillEmptyAssignment(body, name, literal);
      if (rewritten !== null) { body = rewritten; filled.push(name); continue; }
    }
    appendLines.push(`${name}=${literal}`);
    appended.push(name);
  }
  if (appendLines.length === 0 && filled.length === 0) return { path: filePath, appended, filled, unencodable };
  await mkdir(path.dirname(filePath), { recursive: true });
  let out = body;
  if (appendLines.length > 0) {
    const separator = out.length && !out.endsWith("\n") ? "\n" : "";
    out = `${out}${separator}${appendLines.join("\n")}\n`;
  }
  await writeFile(filePath, out, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => { /* best effort on platforms without POSIX modes */ });
  return { path: filePath, appended, filled, unencodable, homedir };
}

// Replace an existing empty assignment (KEY=, KEY="", KEY='') with a real value in place,
// preserving an optional `export ` prefix and every surrounding line. Returns null when no empty
// assignment for `name` exists, so the caller appends instead. Names are [A-Z][A-Z0-9_]* per the
// service schema, so interpolating one into the pattern is regex-safe.
function fillEmptyAssignment(text, name, literal) {
  const re = new RegExp(`^([ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=)[ \\t]*(?:""|'')?[ \\t]*$`, "m");
  if (!re.test(text)) return null;
  // Use a replacer callback so `$1`, `$&`, etc. inside the credential stay literal — a string
  // replacement would interpret them as capture-group references and corrupt the secret.
  return text.replace(re, (_match, prefix) => `${prefix}${literal}`);
}

function safeParse(text) {
  try { return parseEnv(text); } catch { return {}; }
}

// ---- secret-file hygiene --------------------------------------------------
// Ensure a repo excludes its secret file from Git and the npm package, preserving unrelated
// entries. Only meaningful when the secret lives inside a repo (project scope); user-scope
// files sit outside any checkout and rely on 0600 permissions.
export async function ensureSecretIgnored(repoRoot, patterns) {
  const updated = [];
  for (const file of [".gitignore", ".npmignore"]) {
    const target = path.join(repoRoot, file);
    const existingRaw = await readFileIfExists(target);
    // Never CREATE a .npmignore: when it is absent, npm falls back to .gitignore (which we do
    // maintain), so writing a fresh .npmignore holding only these patterns would drop that
    // fallback and silently re-include every other file the project excluded from its package.
    // An existing .npmignore is still maintained, since npm ignores .gitignore in that case.
    if (file === ".npmignore" && existingRaw === null) continue;
    const text = existingRaw?.toString("utf8") ?? "";
    const have = new Set(text.split(/\r?\n/).map((line) => line.trim()));
    const toAdd = patterns.filter((pattern) => !have.has(pattern));
    if (toAdd.length === 0) continue;
    const separator = text.length && !text.endsWith("\n") ? "\n" : "";
    await writeFile(target, `${text}${separator}${toAdd.join("\n")}\n`);
    updated.push(file);
  }
  return updated;
}

// Derive the ignore patterns for the secret file actually in use. Only a file INSIDE the repo is
// returned (user-scope env-files sit outside any checkout and rely on 0600). A custom --env-file
// name is excluded by its own relative path, not by the default `.env` glob, so it can never be
// left committable.
export function secretIgnorePatterns(envFilePath, repoRoot) {
  const rel = path.relative(repoRoot, envFilePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return [];
  const pattern = rel.split(path.sep).join("/"); // gitignore patterns are POSIX-separated
  const patterns = [pattern];
  // At the conventional location, also exclude the .env.* family while keeping a committed
  // template allowed — preserving the prior default behavior.
  if (pattern === ".env") patterns.push(".env.*", "!.env.example");
  return patterns;
}

// ---- interactive hidden prompt --------------------------------------------
// Built-in readline with output masked during entry (no dependency, no raw-mode escape
// parsing). Injectable streams keep it unit-testable without a TTY. Returns "" on empty
// submit (caller treats that as "skip this key").
export class CredentialPromptCancelled extends Error {
  constructor() {
    super("credential entry cancelled");
    this.name = "CredentialPromptCancelled";
  }
}

export function promptHidden(query, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve, reject) => {
    output.write(query); // print the label ourselves so it is always visible…
    const rl = readline.createInterface({ input, output, terminal: true });
    let settled = false;
    const settle = (fn, arg) => { if (settled) return; settled = true; rl.close(); fn(arg); };
    // …then mute every echo readline would emit, keeping only the newline after submit, so the
    // typed secret never reaches the terminal.
    rl._writeToOutput = (chunk) => { if (/[\r\n]/.test(chunk)) output.write("\n"); };
    // Cancellation (Ctrl+C) and the input stream closing must SETTLE the promise; otherwise a
    // cancelled prompt hangs the process on an unresolved await (Node exits with an unsettled
    // top-level await warning).
    rl.on("SIGINT", () => { output.write("\n"); settle(reject, new CredentialPromptCancelled()); });
    rl.on("close", () => settle(reject, new CredentialPromptCancelled()));
    rl.question("", (answer) => settle(resolve, answer));
  });
}

// Gather missing REQUIRED keys interactively; empty input skips a key (left for .env.example).
export async function collectMissingRequired(status, { prompt = promptHidden } = {}) {
  const collected = {};
  for (const k of missingRequiredKeys(status)) {
    const value = (await prompt(`${k.service} · ${k.name}${k.description ? ` (${k.description})` : ""}: `)).trim();
    if (value.length > 0) collected[k.name] = value;
  }
  return collected;
}
