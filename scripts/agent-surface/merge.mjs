// MCP config render + non-destructive merge, per host config format (JSON/JSONC, Codex TOML,
// YAML). Pure string transforms: given entries (+ existing text) produce rendered/merged text.
// No fs, no module-global state. The install planner (agent-surface.mjs) reads/writes files and
// calls these; each merger preserves user-owned siblings/comments and throws (→ blocked, never
// clobber) on an ambiguous shape.
import { tomlString } from "./format.mjs";
import { mergeJsoncRootObjectProperty, parseJsoncResult } from "./jsonc.mjs";
import { fail } from "./util.mjs";

export function renderMcpConfig(format, entries) {
  if (YAML_MCP_FORMATS.has(format)) return renderYamlMcpConfig(format, entries);
  const servers = optionalServiceMcpServers(entries, format);
  if (format === "codex-toml") {
    return entries.map(([id, service]) => renderCodexMcpServer(id, service)).join("\n");
  }
  if (format === "vscode-servers") return `${JSON.stringify({ servers }, null, 2)}\n`;
  if (format === "zed-context-servers") return `${JSON.stringify({ context_servers: servers }, null, 2)}\n`;
  if (format === "local-command-map") return `${JSON.stringify({ mcp: servers }, null, 2)}\n`;
  return `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
}

export function optionalServiceMcpServers(entries, format) {
  const servers = {};
  for (const [id, service] of entries) servers[id] = optionalServiceMcpServer(service, format);
  return servers;
}

function optionalServiceMcpServer(service, format = "mcpServers") {
  const server = service.mcp?.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    fail(`optional service ${service.path} is missing an MCP server contract`);
  }
  if (format === "local-command-map") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      enabled: true,
    };
  }
  return {
    type: server.type,
    command: server.command,
    args: server.args ?? [],
  };
}

function renderCodexMcpServer(id, service) {
  const server = optionalServiceMcpServer(service);
  const lines = [
    `[mcp_servers.${id}]`,
    `command = "${tomlString(server.command)}"`,
    `args = [${server.args.map((arg) => `"${tomlString(arg)}"`).join(", ")}]`,
    "",
  ];
  return lines.join("\n");
}

// Merge the agent-surface-owned MCP servers key into a JSON/JSONC host config. The merge
// preserves all other top-level keys and their comments; the merged key's object value is
// re-serialized (replaceJsoncValue), so comments INSIDE the merged key (e.g. inside an
// existing mcpServers block) are dropped. This is an accepted tradeoff: the synapse entry
// is agent-surface-owned and the merged value is fully regenerated, while user-owned
// sibling servers under the same key are preserved by value. Bad config shapes block
// rather than clobber.
export function mergeJsonMcpConfig(text, format, entries) {
  const parsed = parseJsoncResult(text);
  if (!parsed.ok) throw new Error(`invalid JSON/JSONC: ${parsed.error.message}`);
  if (parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    throw new Error("config must be an object");
  }
  const key = mcpConfigRootKey(format);
  const current = parsed.value[key] ?? {};
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    throw new Error(`${key} must be an object`);
  }
  return mergeJsoncRootObjectProperty(text, key, optionalServiceMcpServers(entries, format));
}

function mcpConfigRootKey(format) {
  if (format === "vscode-servers") return "servers";
  if (format === "zed-context-servers") return "context_servers";
  if (format === "local-command-map") return "mcp";
  return "mcpServers";
}

export const YAML_MCP_FORMATS = new Set(["goose-extensions", "poolside-mcp"]);
function yamlMcpRootKey(format) {
  return format === "goose-extensions" ? "extensions" : "mcp_servers";
}

// One server's block, relative (name header at col 0, fields at col 2). Block style only.
function yamlMcpServerEntry(format, id, service) {
  const server = service.mcp?.server;
  if (!server || typeof server !== "object") fail(`optional service ${id} is missing an MCP server contract`);
  const args = `[${(server.args ?? []).map((a) => JSON.stringify(String(a))).join(", ")}]`;
  if (format === "goose-extensions") {
    return [`${id}:`, `  name: ${id}`, `  type: stdio`, `  cmd: ${server.command}`, `  args: ${args}`, `  enabled: true`, `  timeout: 300`];
  }
  return [`${id}:`, `  command: ${server.command}`, `  args: ${args}`];
}

function renderYamlMcpConfig(format, entries) {
  const rootKey = yamlMcpRootKey(format);
  const body = entries.flatMap(([id, service]) => yamlMcpServerEntry(format, id, service).map((l) => `  ${l}`));
  return `${rootKey}:\n${body.join("\n")}\n`;
}

// Non-destructive merge of agent-surface-owned MCP servers into a BLOCK-style YAML mapping
// under `rootKey`. Preserves every other key, comment, and sibling server. Owned servers are
// replaced in place (idempotent). Refuses (throws → blocked) on tabs or a flow/inline rootKey
// value so we never corrupt an unexpected shape rather than guess.
export function mergeYamlMcpConfig(text, format, entries) {
  if (text.includes("\t")) throw new Error("YAML indented with tabs; refusing to edit");
  const rootKey = yamlMcpRootKey(format);
  const owned = new Map(entries.map(([id, service]) => [id, yamlMcpServerEntry(format, id, service)]));
  const ownedIds = [...owned.keys()];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const renderOwned = (indent) => ownedIds.flatMap((id) => owned.get(id).map((l) => (l === "" ? "" : " ".repeat(indent) + l)));

  const headerRe = new RegExp(`^${rootKey}:[ \\t]*(#.*)?$`);
  const inlineRe = new RegExp(`^${rootKey}:[ \\t]*\\S`);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { headerIdx = i; break; }
    if (inlineRe.test(lines[i])) throw new Error(`${rootKey} is not a block mapping`);
  }

  if (headerIdx === -1) {
    const base = text.length === 0 ? "" : (text.endsWith("\n") ? text : text + eol);
    return `${base}${rootKey}:${eol}${renderOwned(2).join(eol)}${eol}`;
  }

  // Block body extent + child indent.
  let end = lines.length;
  let childIndent = null;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) { end = i; break; }
    if (childIndent === null) childIndent = indent;
  }
  if (childIndent === null) childIndent = 2;

  const ownedKeyRe = new RegExp(`^${" ".repeat(childIndent)}(${ownedIds.join("|")}):[ \\t]*(#.*)?$`);
  const body = lines.slice(headerIdx + 1, end);
  const kept = [];
  for (let i = 0; i < body.length;) {
    if (ownedKeyRe.test(body[i])) {
      i++; // drop owned child + its deeper sub-block (re-added at end)
      while (i < body.length && (body[i].trim() === "" || (body[i].length - body[i].trimStart().length) > childIndent)) i++;
      continue;
    }
    kept.push(body[i]);
    i++;
  }
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const result = [...lines.slice(0, headerIdx + 1), ...kept, ...renderOwned(childIndent), ...lines.slice(end)];
  let out = result.join(eol);
  if (text.endsWith("\n") && !out.endsWith(eol)) out += eol;
  return out;
}

export function mergeCodexMcpToml(text, entries) {
  const ids = entries.map(([id]) => id);
  const cleaned = stripCodexMcpTomlBlocks(text, ids);
  const block = entries.map(([id, service]) => renderCodexMcpServer(id, service)).join("\n").trimEnd();
  const joiner = cleaned.trim().length === 0 ? "" : "\n\n";
  return `${cleaned.trimEnd()}${joiner}${block}\n`;
}

function stripCodexMcpTomlBlocks(text, ids) {
  const sections = new Set(ids.flatMap((id) => [`[mcp_servers.${id}]`, `[mcp_servers.${id}.env]`]));
  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (sections.has(trimmed)) {
      skipping = true;
      // drop an orphan comment line sitting directly above the removed section header so
      // a hand-commented synapse entry doesn't leave a dangling #comment after re-merge.
      // Only comment lines are removed; blank lines are left (the \n{3,} cleanup below
      // collapses any excess spacing).
      while (out.length > 0 && out[out.length - 1].trim().startsWith("#")) out.pop();
      continue;
    }
    if (skipping && /^\[.+\]$/.test(trimmed) && !sections.has(trimmed)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/u, "\n\n");
}
