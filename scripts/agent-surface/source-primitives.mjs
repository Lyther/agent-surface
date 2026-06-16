import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { approximateTokens, tomlMultilineString, tomlString, yamlString } from "./format.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(moduleDir, "../..");
const hookScriptName = "audit-log.sh";

let ignoreSourceCache;
let hookScriptCache;

export async function checkSubagents(targets) {
  const subagents = await readSubagents();
  const errors = subagents.flatMap((subagent) => subagent.errors);
  const names = subagents.map((subagent) => subagent.name);
  for (const dup of new Set(names.filter((name, index) => names.indexOf(name) !== index))) {
    errors.push(`duplicate subagent name: ${dup}`);
  }
  const emitters = Object.entries(targets)
    .filter(([, adapter]) => adapter.renderSubagent)
    .map(([name]) => name)
    .sort();
  const riskCounts = countBy(subagents, (subagent) => subagent.riskClass);

  console.log(`subagents: sources ${subagents.length}, emitters ${emitters.length} (${emitters.join(", ")})`);
  console.log(`subagents: risk content ${riskCounts.content ?? 0}, config ${riskCounts.config ?? 0}, executable ${riskCounts.executable ?? 0}`);
  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("subagents check: ok");
}

export async function checkMcps(targets) {
  const mcps = await readMcps();
  const errors = mcps.flatMap((mcp) => mcp.errors);
  for (const dup of duplicateMcpNames(mcps)) {
    errors.push(`duplicate mcp server name: ${dup}`);
  }
  for (const mcp of mcps) {
    if (mcp.sourceSizeTokens > 2000) errors.push(`${mcp.source}: source-size approx ${mcp.sourceSizeTokens} tokens exceeds hard cap 2000`);
  }
  const emitters = Object.entries(targets)
    .filter(([, adapter]) => adapter.mcpOutput)
    .map(([name]) => name)
    .sort();

  console.log(`mcps: sources ${mcps.length}, emitters ${emitters.length} (${emitters.join(", ")})`);
  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("mcps check: ok");
}

export async function checkHooks(targets) {
  const script = await readHookScript();
  const errors = [];
  if (!script) {
    errors.push(`hooks/${hookScriptName} missing`);
  } else {
    if (!/^#!/.test(script.body)) errors.push(`hooks/${hookScriptName}: missing shebang`);
    if (!/\nexit 0\n?$/.test(script.body)) errors.push(`hooks/${hookScriptName}: must end with "exit 0" so the hook is fail-open`);
    if (approximateTokens(script.body) > 1000) errors.push(`hooks/${hookScriptName}: source exceeds hard cap 1000 tokens`);
    errors.push(...validateAuditLogHookScript(script.body).map((error) => `hooks/${hookScriptName}: ${error}`));
  }
  const emitters = Object.entries(targets)
    .filter(([, adapter]) => adapter.hooks)
    .map(([name]) => name)
    .sort();

  console.log(`hooks: scripts ${script ? 1 : 0}, emitters ${emitters.length} (${emitters.join(", ")})`);
  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("hooks check: ok");
}

export async function checkIgnores(targets) {
  const ignore = await readIgnores();
  const emitters = Object.entries(targets)
    .filter(([, adapter]) => adapter.ignoreFilename)
    .map(([name]) => name)
    .sort();
  const errors = [];

  if (!ignore) {
    errors.push("ignores/default.ignore is missing");
  } else if (ignore.body.trim().length === 0) {
    errors.push("ignores/default.ignore is empty");
  }

  console.log(`ignores: source ${ignore ? "ok" : "missing"}, emitters ${emitters.length} (${emitters.join(", ")})`);
  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("ignores check: ok");
}

export async function ignoreOutputs(adapter) {
  if (!adapter.ignoreFilename) return [];
  const ignore = await readIgnores();
  if (!ignore) return [];
  return [{
    source: ignore.source,
    relativeOutput: adapter.ignoreFilename,
    content: ignore.body,
  }];
}

export async function produceSubagentOutputs(adapter, context) {
  if (!adapter.renderSubagent) return [];
  const subagents = await readSubagents();
  return subagents.map((subagent) => ({
    source: subagent.source,
    relativeOutput: path.join(outputRootFor(adapter.subagentOutputRoot, context), adapter.subagentOutputName(subagent)),
    content: adapter.renderSubagent(subagent, context),
  }));
}

export async function produceMcpOutputs(adapter) {
  if (!adapter.mcpOutput) return [];
  const mcps = await readMcps();
  if (mcps.length === 0) return [];
  return [{
    source: relative(path.join(root, "mcps")),
    relativeOutput: adapter.mcpOutput,
    content: renderMcpServers(mcps),
  }];
}

export async function produceHookOutputs(adapter) {
  if (!adapter.hooks) return [];
  const script = await readHookScript();
  if (!script) return [];
  const scriptOutput = path.join(adapter.hooks.scriptDir, hookScriptName);
  const commandPath = scriptOutput.split(path.sep).join("/");
  return [
    { source: script.source, relativeOutput: scriptOutput, content: script.body },
    { source: script.source, relativeOutput: adapter.hooks.configOutput, content: renderCursorHooksConfig(adapter.hooks.events, commandPath) },
  ];
}

export function renderClaudeSubagent(subagent) {
  return [
    "---",
    `name: ${subagent.name}`,
    `description: "${yamlString(subagent.description)}"`,
    `tools: ${subagentToolsForAccess(subagent.access)}`,
    "---",
    "",
    subagent.body,
    "",
  ].join("\n");
}

export function renderCodexSubagent(subagent) {
  return [
    `name = "${tomlString(subagent.name.replaceAll("-", "_"))}"`,
    `description = "${tomlString(subagent.description)}"`,
    `sandbox_mode = "${subagent.access === "read-only" ? "read-only" : "workspace-write"}"`,
    `developer_instructions = ${tomlMultilineString(subagent.body)}`,
    "",
  ].join("\n");
}

export function renderKiloSubagent(subagent) {
  const lines = ["---", `description: "${yamlString(subagent.description)}"`, "mode: subagent"];
  if (subagent.access === "read-only") {
    lines.push("permission:", "  edit: deny", "  bash: deny");
  } else if (subagent.access === "read-write") {
    lines.push("permission:", "  bash: deny");
  }
  lines.push("---", "", subagent.body, "");
  return lines.join("\n");
}

async function readIgnores() {
  if (ignoreSourceCache !== undefined) return ignoreSourceCache;
  const file = path.join(root, "ignores", "default.ignore");
  ignoreSourceCache = await exists(file) ? { source: relative(file), body: await readFile(file, "utf8") } : null;
  return ignoreSourceCache;
}

async function readSubagents() {
  const subagentFiles = await files("subagents", [".md"]);
  const subagents = [];
  for (const file of subagentFiles) {
    subagents.push(parseSubagent(file, await readFile(file, "utf8")));
  }
  return subagents.sort((left, right) => left.name.localeCompare(right.name));
}

function parseSubagent(file, text) {
  const source = relative(file);
  const out = {
    source,
    name: path.basename(file, ".md"),
    description: "",
    access: "read-only",
    riskClass: "content",
    body: "",
    errors: [],
  };

  if (!text.startsWith("---\n")) {
    out.errors.push(`${source}: frontmatter missing`);
    out.body = text.trimEnd();
    return out;
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    out.errors.push(`${source}: frontmatter not closed`);
    out.body = text.trimEnd();
    return out;
  }

  for (const line of text.slice(4, end).split(/\r?\n/)) {
    const name = line.match(/^name:\s*"?(.*?)"?\s*$/);
    if (name) { out.name = name[1]; continue; }
    const description = line.match(/^description:\s*"?(.*?)"?\s*$/);
    if (description) { out.description = description[1]; continue; }
    const access = line.match(/^access:\s*"?(.*?)"?\s*$/);
    if (access) { out.access = access[1]; continue; }
  }
  out.body = text.slice(end + 5).replace(/^\n+/, "").trimEnd();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(out.name)) out.errors.push(`${source}: name must be lowercase letters, digits, and hyphens`);
  if (out.description.trim().length === 0) out.errors.push(`${source}: description is required`);
  if (!["read-only", "read-write", "read-write-shell"].includes(out.access)) {
    out.errors.push(`${source}: access must be read-only, read-write, or read-write-shell`);
  }
  out.riskClass = subagentRiskClass(out.access);
  if (out.body.trim().length === 0) out.errors.push(`${source}: prompt body is required`);
  return out;
}

function subagentRiskClass(access) {
  if (access === "read-write-shell") return "executable";
  if (access === "read-write") return "config";
  return "content";
}

function subagentToolsForAccess(access) {
  if (access === "read-write-shell") return "Read, Grep, Glob, Edit, Write, Bash";
  if (access === "read-write") return "Read, Grep, Glob, Edit, Write";
  return "Read, Grep, Glob";
}

async function readMcps() {
  const mcpFiles = await files("mcps", [".json"]);
  const mcps = [];
  for (const file of mcpFiles) {
    mcps.push(parseMcp(file, await readFile(file, "utf8")));
  }
  return mcps.sort((left, right) => left.name.localeCompare(right.name));
}

// Sensitive config keys must reference an environment placeholder (${VAR}),
// never a literal value, so generated MCP config never carries a secret.
const mcpSensitiveKey = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|BEARER|PRIVATE|SESSION|COOKIE)/i;
const mcpLiteralSecret = /(sk-[A-Za-z0-9]{16,}|sk-or-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{20,}|pa-[0-9A-Za-z_-]{16,}|\b[0-9a-f]{32,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const mcpSecretAssignment = /\b([A-Z][A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD)|api[_-]?key|apiKey|accessToken|authToken|secret|token|password|passwd|pwd)\b\s*[:=]\s*["']?[^\s'"]+/i;
const mcpUrlCredentials = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/i;

function checkMcpPlainString(out, source, field, value) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    out.errors.push(`${source}: ${field} must be a string`);
    return;
  }
  const placeholder = /^\$\{[^}]+\}$/.test(value);
  if (placeholder) return;
  if (mcpLiteralSecret.test(value) || mcpSecretAssignment.test(value)) {
    out.errors.push(`${source}: ${field} looks like a literal secret; use a \${ENV_VAR} placeholder`);
  }
  if (mcpUrlCredentials.test(value)) {
    out.errors.push(`${source}: ${field} must not include URL credentials; use headers/env placeholders`);
  }
}

function mcpStringMap(out, source, field, value) {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    out.errors.push(`${source}: ${field} must be an object of string values`);
    return undefined;
  }
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      out.errors.push(`${source}: ${field}.${key} must be a string`);
      continue;
    }
    const placeholder = /^\$\{[^}]+\}$/.test(raw);
    if (mcpSensitiveKey.test(key) && !placeholder) {
      out.errors.push(`${source}: ${field}.${key} must use a \${ENV_VAR} placeholder, not a literal secret`);
    } else if (!placeholder && mcpLiteralSecret.test(raw)) {
      out.errors.push(`${source}: ${field}.${key} looks like a literal secret; use a \${ENV_VAR} placeholder`);
    }
    if (!placeholder) checkMcpPlainString(out, source, `${field}.${key}`, raw);
  }
  return value;
}

function checkMcpSurfaces(out, source, data) {
  if (data.command !== undefined) checkMcpPlainString(out, source, "command", data.command);
  if (data.url !== undefined) checkMcpPlainString(out, source, "url", data.url);
  if (Array.isArray(out.args)) {
    out.args.forEach((arg, index) => checkMcpPlainString(out, source, `args[${index}]`, arg));
  }
  out.env = mcpStringMap(out, source, "env", data.env);
  out.headers = mcpStringMap(out, source, "headers", data.headers);
}

function parseMcp(file, text) {
  const source = relative(file);
  const out = {
    source,
    name: path.basename(file, ".json"),
    description: "",
    runtime: null,
    command: null,
    args: [],
    env: null,
    url: null,
    headers: null,
    packageManager: null,
    networkBootstrap: null,
    versionPinned: null,
    trust: [],
    sourceSizeTokens: approximateTokens(text),
    errors: [],
  };

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    out.errors.push(`${source}: invalid JSON: ${error.message}`);
    return out;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    out.errors.push(`${source}: must be a JSON object`);
    return out;
  }

  const allowedFields = new Set([
    "name",
    "description",
    "runtime",
    "command",
    "args",
    "env",
    "url",
    "headers",
    "package_manager",
    "network_bootstrap",
    "version_pinned",
    "trust",
  ]);
  for (const key of Object.keys(data)) {
    if (!allowedFields.has(key)) out.errors.push(`${source}: unknown field: ${key}`);
  }

  if (typeof data.name === "string") out.name = data.name;
  if (typeof data.description === "string") out.description = data.description;
  if (typeof data.runtime === "string") out.runtime = data.runtime;
  if (data.command !== undefined) out.command = data.command;
  if (data.url !== undefined) out.url = data.url;
  if (typeof data.package_manager === "string") out.packageManager = data.package_manager;
  if (typeof data.network_bootstrap === "boolean") out.networkBootstrap = data.network_bootstrap;
  if (typeof data.version_pinned === "boolean") out.versionPinned = data.version_pinned;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(out.name)) out.errors.push(`${source}: name must be lowercase letters, digits, and hyphens`);

  const hasCommand = typeof out.command === "string" && out.command.length > 0;
  const hasUrl = typeof out.url === "string" && out.url.length > 0;
  if (hasCommand === hasUrl) out.errors.push(`${source}: define exactly one of "command" (stdio) or "url" (remote)`);
  if (!["stdio", "http"].includes(out.runtime ?? "")) out.errors.push(`${source}: runtime must be stdio or http`);
  if (hasCommand && out.runtime !== "stdio") out.errors.push(`${source}: command MCPs must set runtime to stdio`);
  if (hasUrl && out.runtime !== "http") out.errors.push(`${source}: url MCPs must set runtime to http`);

  if (data.args !== undefined) {
    if (Array.isArray(data.args) && data.args.every((item) => typeof item === "string")) {
      out.args = data.args;
    } else {
      out.errors.push(`${source}: args must be an array of strings`);
    }
  }
  if (data.trust !== undefined) {
    if (Array.isArray(data.trust) && data.trust.length > 0 && data.trust.every((item) => typeof item === "string")) {
      out.trust = data.trust;
    } else {
      out.errors.push(`${source}: trust must be a non-empty array of strings`);
    }
  } else {
    out.errors.push(`${source}: trust is required`);
  }
  checkMcpSurfaces(out, source, data);
  checkMcpRuntimePolicy(out);

  return out;
}

function checkMcpRuntimePolicy(mcp) {
  if (mcp.runtime !== "stdio") return;
  if (!["none", "npx", "uvx"].includes(mcp.packageManager ?? "")) {
    mcp.errors.push(`${mcp.source}: package_manager must be none, npx, or uvx`);
    return;
  }

  const commandPackageManager = mcp.command === "npx" ? "npx" : mcp.command === "uvx" ? "uvx" : "none";
  if (mcp.packageManager !== commandPackageManager) {
    mcp.errors.push(`${mcp.source}: package_manager must match command ${mcp.command}`);
  }
  if (typeof mcp.networkBootstrap !== "boolean") {
    mcp.errors.push(`${mcp.source}: network_bootstrap must be boolean`);
  }
  if (typeof mcp.versionPinned !== "boolean") {
    mcp.errors.push(`${mcp.source}: version_pinned must be boolean`);
  }
  if (mcp.packageManager === "none" && mcp.networkBootstrap !== false) {
    mcp.errors.push(`${mcp.source}: package_manager none must set network_bootstrap false`);
  }
  if (mcp.packageManager === "none" && mcp.versionPinned !== false) {
    mcp.errors.push(`${mcp.source}: package_manager none must set version_pinned false`);
  }
  if (mcp.packageManager !== "none" && mcp.networkBootstrap !== true) {
    mcp.errors.push(`${mcp.source}: package-manager MCPs must set network_bootstrap true`);
  }
  if (mcp.packageManager !== "none" && mcp.versionPinned !== true) {
    mcp.errors.push(`${mcp.source}: package-manager MCPs must set version_pinned true`);
  }
  if (mcp.packageManager !== "none" && !mcp.args.some((arg) => isPinnedPackageSpec(arg))) {
    mcp.errors.push(`${mcp.source}: package-manager MCP args must include a pinned package spec`);
  }
}

function isPinnedPackageSpec(value) {
  return parsePinnedPackageSpec(value) !== null;
}

function parsePinnedPackageSpec(value) {
  if (typeof value !== "string") return null;
  const npm = value.match(/^(?:@[^/\s@]+\/[^@\s]+|[^@\s/]+)@([^@\s]+)$/);
  if (npm) {
    const name = value.slice(0, -(npm[1].length + 1));
    const version = npm[1];
    // Reject explicit floating/range markers and non-exact tags. SemVer parts
    // must be numeric-only (no wildcards), and pre-release/build metadata may
    // only contain safe alphanumeric/dot/hyphen characters.
    if (version.includes("*") ||
      version.includes("x") ||
      version.includes("X") ||
      /[\^~<>=!|&,]/.test(version) ||
      /^(latest|next|alpha|beta|rc|dev|canary|main|master)$/.test(version)) {
      return null;
    }
    if (/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
      return { type: "npm", name, version };
    }
    // Accept the date-style exact versions used by some MCP packages
    // (e.g. @modelcontextprotocol/server-sequential-thinking@2025.12.18).
    if (/^(?:19|20)\d{2}\.(?:0[1-9]|1[0-2])\.(?:0[1-9]|[12]\d|3[01])$/.test(version)) {
      return { type: "npm", name, version };
    }
    return null;
  }
  const git = value.match(/^git\+https:\/\/.+#([0-9a-f]{40}|[0-9a-f]{64})$/i);
  return git ? { type: "git", name: value, version: git[1] } : null;
}

function mcpServerEntry(mcp) {
  if (typeof mcp.url === "string" && mcp.url.length > 0) {
    const entry = { type: "http", url: mcp.url };
    if (mcp.headers && Object.keys(mcp.headers).length > 0) entry.headers = mcp.headers;
    return entry;
  }
  const entry = { type: "stdio", command: mcp.command };
  if (mcp.args.length > 0) entry.args = mcp.args;
  if (mcp.env && Object.keys(mcp.env).length > 0) entry.env = mcp.env;
  return entry;
}

function renderMcpServers(mcps) {
  const duplicates = duplicateMcpNames(mcps);
  if (duplicates.length > 0) throw new Error(`duplicate mcp server names: ${duplicates.join(", ")}`);

  const mcpServers = {};
  for (const mcp of mcps) {
    mcpServers[mcp.name] = mcpServerEntry(mcp);
  }
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function duplicateMcpNames(mcps) {
  const seen = new Set();
  const duplicates = new Set();
  for (const mcp of mcps) {
    if (seen.has(mcp.name)) duplicates.add(mcp.name);
    seen.add(mcp.name);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

async function readHookScript() {
  if (hookScriptCache !== undefined) return hookScriptCache;
  const file = path.join(root, "hooks", hookScriptName);
  hookScriptCache = await exists(file) ? { source: relative(file), body: await readFile(file, "utf8") } : null;
  return hookScriptCache;
}

function validateAuditLogHookScript(body) {
  const errors = [];
  const syntax = spawnSync("sh", ["-n"], { input: body, encoding: "utf8" });
  if (syntax.status !== 0) errors.push(`shell syntax check failed: ${(syntax.stderr || syntax.stdout).trim()}`);

  const allowedExecutableLines = [
    /^event=\$\{1:-unknown\}$/,
    /^cat\s*>\s*\/dev\/null\s+2>\s*&1\s+\|\|\s+true$/,
    /^log_dir=\.agent-surface\/hooks$/,
    /^mkdir\s+-p\s+"\$log_dir"\s+2>\/dev\/null\s+\|\|\s+exit\s+0$/,
    /^printf\s+(["'])%s %s\\n\1\s+"\$\(date\s+-u\s+(["'])\+%Y-%m-%dT%H:%M:%SZ\2\s+2>\/dev\/null\)"\s+"\$event"\s*>>\s*"\$log_dir\/audit\.log"\s+2>\/dev\/null\s+\|\|\s+true$/,
    /^exit\s+0$/,
  ];
  const executableLines = body.split(/\r?\n/)
    .map((line, index) => ({ index, line: line.trim() }))
    .filter(({ line }) => line !== "" && !line.startsWith("#") && !line.startsWith("#!"));
  const expectedOrder = ["event", "cat", "log_dir", "mkdir", "printf", "exit"];
  const lineKinds = ["event", "cat", "log_dir", "mkdir", "printf", "exit"];
  const observedOrder = [];

  for (const { index, line } of executableLines) {
    const kindIndex = allowedExecutableLines.findIndex((pattern) => pattern.test(line));
    if (kindIndex === -1) {
      errors.push(`line ${index + 1} is outside the audit-log hook template`);
      continue;
    }
    observedOrder.push(lineKinds[kindIndex]);
  }
  if (observedOrder.join(",") !== expectedOrder.join(",")) {
    errors.push(`executable lines must match audit-log hook order: ${expectedOrder.join(", ")}`);
  }
  return errors;
}

function renderCursorHooksConfig(events, commandPath) {
  const hooks = {};
  for (const event of events) hooks[event] = [{ command: `sh ${commandPath} ${event}` }];
  return `${JSON.stringify({ version: 1, hooks }, null, 2)}\n`;
}

async function files(dir, extensions) {
  return filesUnder(path.join(root, dir), extensions);
}

async function filesUnder(base, extensions) {
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full, extensions));
    if (entry.isFile() && extensions.includes(path.extname(entry.name))) out.push(full);
  }
  return out.sort((left, right) => relative(left).localeCompare(relative(right)));
}

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function outputRootFor(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}
