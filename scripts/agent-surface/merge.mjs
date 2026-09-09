// MCP config render + non-destructive merge, per host config format. Format
// libraries own parsing and syntax; agent-surface owns only declared keys and IDs.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TOML from "@decimalturn/toml-patch";
import { isMap, isSeq, parseDocument, stringify as stringifyYaml } from "yaml";
import { parseJsoncResult, setJsoncRootObjectProperty, setJsoncRootProperty } from "./jsonc.mjs";
import { fail } from "./util.mjs";

export const YAML_MCP_FORMATS = new Set(["goose-extensions", "poolside-mcp"]);

// Every wired MCP server launches through this shared env-loader wrapper (linked at
// ~/.local/bin/agent-surface-mcp-env). It loads the credential env-file (ambient env wins), then
// execs the real command with stdio + working directory preserved. Secrets live only in the
// env-file; host config references solely the launcher, the `--` terminator, and the real command
// + args — never a value. The wrap is applied once at the entry source (selectedMcpServiceEntries),
// so the renderers below just serialize the already-wrapped command/args per host format.
export const MCP_ENV_LAUNCHER = "~/.local/bin/agent-surface-mcp-env";

// The launcher module the wrapper runs. On POSIX the ~/.local/bin stub execs it; on Windows the
// generated config invokes it directly (see below), so the path is needed in both places.
export const MCP_ENV_LAUNCH_SCRIPT = fileURLToPath(new URL("./mcp-env-launch.mjs", import.meta.url));

// How a wrapped server is actually invoked on a given platform.
//   POSIX  — the materialized ~/.local/bin stub (a `#!/bin/sh` script that execs the pinned Node).
//   win32  — there is no shebang, and a `.cmd`/`.bat` stub is worse than useless: Node-based hosts
//            (which is nearly all of them) refuse to spawn one without a shell and fail EINVAL. So
//            the config invokes the install-pinned `node.exe` — a real executable every host can
//            spawn — with the launcher module as its first argument. No stub file, no PATHEXT
//            question, no PATH dependency.
// Only used at INSTALL time; build/dist keeps the machine-agnostic POSIX constant so generated
// output never embeds a host's Node path (or its platform).
export function mcpLauncherInvocation({ platform = process.platform, execPath = process.execPath, launchScript = MCP_ENV_LAUNCH_SCRIPT } = {}) {
  if (platform !== "win32") return { command: MCP_ENV_LAUNCHER, argsPrefix: [] };
  return { command: execPath, argsPrefix: [launchScript] };
}

// True when `command` is the wrapper for the given invocation — the single place that knows how a
// wrapped server is recognized, so targets (which wraps) and install (which unwraps to resolve
// launch paths, and materializes the stub) never drift apart across platforms.
export function isMcpLauncherCommand(command, invocation) {
  invocation ??= mcpLauncherInvocation();
  if (typeof command !== "string") return false;
  if (command === invocation.command) return true;
  // An install rewrites the POSIX stub's leading "~/" to an absolute $HOME path before it reaches a
  // host config, so accept both spellings of that one file.
  return command === MCP_ENV_LAUNCHER || command === path.join(os.homedir(), MCP_ENV_LAUNCHER.slice(2));
}

export function renderMcpConfig(format, entries, rootProperties = {}) {
  if (format === "kiro-permissions") return renderKiroPermissions(rootProperties);
  if (YAML_MCP_FORMATS.has(format)) return renderYamlMcpConfig(format, entries);
  if (format === "json-settings") return `${JSON.stringify(rootProperties, null, 2)}\n`;
  if (format === "codex-toml") {
    const config = { ...rootProperties };
    if (entries.length > 0) config.mcp_servers = tomlMcpServers(entries);
    return withTrailingNewline(TOML.stringify(config, tomlFormat()));
  }

  const servers = optionalServiceMcpServers(entries, format);
  if (format === "vscode-servers") return `${JSON.stringify({ ...rootProperties, servers }, null, 2)}\n`;
  if (format === "zed-context-servers") return `${JSON.stringify({ ...rootProperties, context_servers: servers }, null, 2)}\n`;
  if (format === "local-command-map") return `${JSON.stringify({ ...rootProperties, mcp: servers }, null, 2)}\n`;
  return `${JSON.stringify({ ...rootProperties, mcpServers: servers }, null, 2)}\n`;
}

function renderKiroPermissions(rootProperties) {
  const rules = rootProperties.rules;
  if (!Array.isArray(rules)) throw new Error("rules must be an array");
  return stringifyYaml({ rules });
}

export function mergeKiroPermissions(text, rootProperties = {}) {
  const rules = rootProperties.rules;
  if (!Array.isArray(rules) || rules.length === 0) return text;

  const document = yamlMappingDocument(text);
  const root = document.contents;
  let current = root.get("rules", true);
  if (current === undefined) {
    current = document.createNode([]);
    root.set("rules", current);
  }
  if (!isSeq(current)) throw new Error("rules must be a sequence");

  const owned = new Set(rules.map((rule) => String(rule.capability)));
  current.items = current.items.filter((item) => {
    if (!isMap(item)) throw new Error("rules must contain mappings");
    const capability = item.get("capability");
    if (typeof capability !== "string" || capability.length === 0) {
      throw new Error("each rule must have a capability");
    }
    return !owned.has(capability);
  });
  for (const rule of rules) current.add(document.createNode(rule));
  return document.toString();
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
  if (format === "kimi-mcp") {
    return {
      command: server.command,
      args: server.args ?? [],
    };
  }
  return {
    type: server.type,
    command: server.command,
    args: server.args ?? [],
  };
}

export function mergeJsonMcpConfig(
  text,
  format,
  entries,
  removeIds = [],
  rootProperties = {},
  replaceRootProperties = [],
) {
  const parsed = parseJsoncResult(text);
  if (!parsed.ok) throw new Error(`invalid JSON/JSONC: ${parsed.error.message}`);
  if (!isPlainObject(parsed.value)) throw new Error("config must be an object");

  const key = mcpConfigRootKey(format);
  let content = text;
  if (key !== null && (Object.hasOwn(parsed.value, key) || entries.length > 0 || removeIds.length > 0)) {
    const current = Object.hasOwn(parsed.value, key) ? parsed.value[key] : {};
    if (!isPlainObject(current)) throw new Error(`${key} must be an object`);
    const next = { ...current };
    for (const id of removeIds) delete next[id];
    Object.assign(next, optionalServiceMcpServers(entries, format));
    content = setJsoncRootObjectProperty(content, key, next);
  }

  const replacements = new Set(replaceRootProperties);
  for (const [property, value] of Object.entries(rootProperties)) {
    const exists = Object.hasOwn(parsed.value, property);
    const current = parsed.value[property];
    if (exists) assertJsonPropertyType(property, current, value);
    const merged = !replacements.has(property) && isPlainObject(current) && isPlainObject(value)
      ? mergePlainObjects(current, value, property)
      : value;
    content = setJsoncRootProperty(content, property, merged);
  }
  return content;
}

export function assertJsonPropertyType(property, current, owned) {
  if (isPlainObject(owned)) {
    if (!isPlainObject(current)) throw new Error(`${property} must be an object`);
    return;
  }
  if (Array.isArray(owned)) {
    if (!Array.isArray(current)) throw new Error(`${property} must be an array`);
    return;
  }
  if (isPlainObject(current)) throw new Error(`${property} must not be an object`);
  if (Array.isArray(current)) throw new Error(`${property} must be a scalar value`);
}

function mergePlainObjects(current, owned, prefix = "") {
  const merged = { ...current };
  for (const [key, value] of Object.entries(owned)) {
    const property = prefix ? `${prefix}.${key}` : key;
    if (Object.hasOwn(merged, key)) assertJsonPropertyType(property, merged[key], value);
    merged[key] = isPlainObject(merged[key]) && isPlainObject(value)
      ? mergePlainObjects(merged[key], value, property)
      : value;
  }
  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mcpConfigRootKey(format) {
  if (format === "json-settings") return null;
  if (format === "vscode-servers") return "servers";
  if (format === "zed-context-servers") return "context_servers";
  if (format === "local-command-map") return "mcp";
  return "mcpServers";
}

function yamlMcpRootKey(format) {
  return format === "goose-extensions" ? "extensions" : "mcp_servers";
}

function yamlMcpServer(format, id, service) {
  const server = service.mcp?.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    fail(`optional service ${service.path} is missing an MCP server contract`);
  }
  if (format === "goose-extensions") {
    return {
      name: id,
      type: "stdio",
      cmd: server.command,
      args: server.args ?? [],
      enabled: true,
      timeout: 300,
    };
  }
  return { command: server.command, args: server.args ?? [] };
}

function renderYamlMcpConfig(format, entries) {
  const servers = {};
  for (const [id, service] of entries) servers[id] = yamlMcpServer(format, id, service);
  return stringifyYaml({ [yamlMcpRootKey(format)]: servers });
}

export function mergeYamlMcpConfig(text, format, entries, removeIds = []) {
  const document = yamlMappingDocument(text);
  const root = document.contents;
  const rootKey = yamlMcpRootKey(format);
  let servers = root.get(rootKey, true);
  if (servers === undefined) {
    servers = document.createNode({});
    root.set(rootKey, servers);
  }
  if (!isMap(servers)) throw new Error(`${rootKey} must be a mapping`);

  for (const id of removeIds) servers.delete(id);
  for (const [id, service] of entries) {
    servers.set(id, document.createNode(yamlMcpServer(format, id, service)));
  }
  return document.toString();
}

function yamlMappingDocument(text) {
  const document = parseDocument(text, { logLevel: "error", strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    const error = document.errors[0];
    throw new Error(`invalid YAML: ${error.code ?? "PARSE_ERROR"}: ${error.message.split("\n")[0]}`);
  }
  if (document.contents === null) document.contents = document.createNode({});
  if (!isMap(document.contents)) throw new Error("YAML root must be a mapping");
  return document;
}

export function mergeCodexMcpToml(text, entries, removeIds = [], rootProperties = {}) {
  let config;
  try {
    config = TOML.parse(text);
  } catch (error) {
    throw new Error(`invalid TOML: ${error.message}`);
  }
  if (!isPlainObject(config)) throw new Error("TOML root must be a table");

  for (const [property, value] of Object.entries(rootProperties)) {
    const current = config[property];
    if (Object.hasOwn(config, property)) assertJsonPropertyType(property, current, value);
    config[property] = isPlainObject(current) && isPlainObject(value)
      ? mergePlainObjects(current, value, property)
      : value;
  }

  if (entries.length > 0 || removeIds.length > 0 || Object.hasOwn(config, "mcp_servers")) {
    const servers = config.mcp_servers ?? {};
    if (!isPlainObject(servers)) throw new Error("mcp_servers must be a table");
    for (const id of removeIds) delete servers[id];
    Object.assign(servers, tomlMcpServers(entries));
    if (Object.keys(servers).length === 0) delete config.mcp_servers;
    else config.mcp_servers = servers;
  }

  return withTrailingNewline(TOML.patch(text, config, tomlFormat(text)));
}

function tomlMcpServers(entries) {
  const servers = {};
  for (const [id, service] of entries) {
    const server = service.mcp?.server;
    if (!server || typeof server !== "object" || Array.isArray(server)) {
      fail(`optional service ${service.path} is missing an MCP server contract`);
    }
    servers[id] = { command: server.command, args: server.args ?? [] };
    if (isPlainObject(server.env) && Object.keys(server.env).length > 0) servers[id].env = server.env;
  }
  return servers;
}

function tomlFormat(source = "") {
  const format = source.length > 0 ? TOML.TomlFormat.autoDetectFormat(source) : TOML.TomlFormat.default();
  format.inlineTableStart = 3;
  format.trailingNewline = 1;
  return format;
}

function withTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}
