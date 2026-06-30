import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(moduleDir, "../..");

let ignoreSourceCache;
let subagentSourceCache;
let subagentSchemaValidator;

const subagentTargets = ["claude-code", "codex", "deepagents", "cursor", "droid", "kilo", "antigravity-cli", "antigravity", "opencode"];
const subagentAccessValues = new Set(["read-only", "read-write", "read-write-shell"]);
const subagentNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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

export async function checkSubagents() {
  const subagents = await readSubagents();
  const errors = await validateSubagents(subagents);

  console.log("subagents:");
  console.log(`  files: ${subagents.length}`);
  console.log(`  metadata: ${errors.length > 0 ? "failed" : "ok"}`);

  if (errors.length > 0) {
    console.log("errors:");
    for (const error of errors) console.log(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("subagents check: ok");
}

export async function subagentValidationErrors() {
  return validateSubagents(await readSubagents());
}

export async function subagentOutputs(adapter, context = {}) {
  if (!adapter.subagentOutputRoot || !adapter.renderSubagent) return [];
  const subagents = await readSubagents();
  const errors = await validateSubagents(subagents);
  if (errors.length > 0) {
    throw new Error(`subagent metadata invalid:\n${errors.join("\n")}`);
  }

  const outputs = [];
  for (const subagent of subagents) {
    if (subagent.metadata.targets?.[adapter.subagentTarget] !== true) continue;
    const extension = adapter.subagentOutputExtension ?? ".md";
    const outputName = adapter.subagentOutputName ? adapter.subagentOutputName(subagent, context) : `${subagent.metadata.name}${extension}`;
    outputs.push({
      source: subagent.relativePath,
      relativeOutput: path.join(resolveOutputRoot(adapter.subagentOutputRoot, context), outputName),
      content: adapter.renderSubagent(subagent),
    });
  }
  return outputs;
}

function resolveOutputRoot(outputRoot, context = {}) {
  return typeof outputRoot === "function" ? outputRoot(context) : outputRoot;
}

async function readIgnores() {
  if (ignoreSourceCache !== undefined) return ignoreSourceCache;
  const file = path.join(root, "ignores", "default.ignore");
  ignoreSourceCache = await exists(file) ? { source: relative(file), body: await readFile(file, "utf8") } : null;
  return ignoreSourceCache;
}

async function readSubagents() {
  if (subagentSourceCache !== undefined) return subagentSourceCache;
  const sourceRoot = path.join(root, "subagents");
  if (!(await exists(sourceRoot))) {
    subagentSourceCache = [];
    return subagentSourceCache;
  }

  const sourceFiles = await markdownFiles(sourceRoot);
  subagentSourceCache = await Promise.all(sourceFiles.map((file) => parseSubagent(file)));
  return subagentSourceCache;
}

async function markdownFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await markdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out.sort();
}

async function parseSubagent(file) {
  const text = await readFile(file, "utf8");
  const relativePath = relative(file);
  const metadata = {};
  const errors = [];
  let body = text;

  if (!text.startsWith("---\n")) {
    errors.push("frontmatter missing");
  } else {
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) {
      errors.push("frontmatter not closed");
    } else {
      Object.assign(metadata, parseSubagentFrontmatter(text.slice(4, end), errors));
      body = text.slice(end + 5).replace(/^\s+/, "");
    }
  }

  return {
    file,
    relativePath,
    name: path.basename(file, ".md"),
    metadata,
    body,
    frontmatterErrors: errors.map((error) => `${relativePath}: ${error}`),
  };
}

function parseSubagentFrontmatter(text, errors) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (!scalar) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }

    const [, key, rawValue] = scalar;
    if (rawValue !== "") {
      out[key] = parseFrontmatterScalar(rawValue);
      continue;
    }

    const map = {};
    let consumedMapEntry = false;
    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const item = lines[itemIndex].match(/^\s{2}([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
      if (!item) break;
      map[item[1]] = parseFrontmatterScalar(item[2]);
      index = itemIndex;
      consumedMapEntry = true;
    }

    out[key] = consumedMapEntry ? map : {};
  }
  return out;
}

function parseFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function validateSubagents(subagents) {
  const errors = [];
  const names = new Map();
  const validateSchema = await readSubagentSchemaValidator();
  for (const subagent of subagents) {
    errors.push(...subagent.frontmatterErrors);
    const metadata = subagent.metadata;
    const prefix = subagent.relativePath;

    if (!validateSchema(metadata)) {
      errors.push(...formatAjvErrors(prefix, validateSchema.errors));
    }
    if (metadata.name === undefined) errors.push(`${prefix}: missing required field name`);
    if (typeof metadata.name === "string" && !subagentNamePattern.test(metadata.name)) errors.push(`${prefix}: name must be lowercase kebab-case`);
    if (metadata.name !== undefined && metadata.name !== subagent.name) {
      errors.push(`${prefix}: filename stem must equal name (${subagent.name} != ${metadata.name})`);
    }
    if (metadata.description === undefined) errors.push(`${prefix}: missing required field description`);
    if (typeof metadata.description === "string" && metadata.description.trim().length < 30) {
      errors.push(`${prefix}: description must be specific, not terse`);
    }
    if (metadata.access === undefined) errors.push(`${prefix}: missing required field access`);
    if (metadata.access !== undefined && !subagentAccessValues.has(metadata.access)) {
      errors.push(`${prefix}: access must be one of read-only | read-write | read-write-shell`);
    }
    if (metadata.model === undefined) errors.push(`${prefix}: missing required field model`);
    if (metadata.model !== undefined && typeof metadata.model !== "string") errors.push(`${prefix}: model must be a string`);
    if (!metadata.targets || typeof metadata.targets !== "object" || Array.isArray(metadata.targets)) {
      errors.push(`${prefix}: missing required map targets`);
    } else {
      for (const target of subagentTargets) {
        if (typeof metadata.targets[target] !== "boolean") errors.push(`${prefix}: targets.${target} must be explicit true/false`);
      }
      for (const target of Object.keys(metadata.targets)) {
        if (!subagentTargets.includes(target)) errors.push(`${prefix}: unknown target ${target}`);
      }
    }
    if (!subagent.body || subagent.body.trim().length < 200) {
      errors.push(`${prefix}: body must be non-empty and operationally useful`);
    }

    if (typeof metadata.name === "string") {
      if (names.has(metadata.name)) {
        errors.push(`${prefix}: duplicate subagent name ${metadata.name}; first seen at ${names.get(metadata.name)}`);
      } else {
        names.set(metadata.name, prefix);
      }
    }
  }
  return errors;
}

async function readSubagentSchemaValidator() {
  if (subagentSchemaValidator) return subagentSchemaValidator;
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "subagent.schema.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  subagentSchemaValidator = ajv.compile(schema);
  return subagentSchemaValidator;
}

function formatAjvErrors(prefix, errors) {
  return (errors ?? []).map((error) => `${prefix}: ${error.instancePath || "/"} ${error.message}`);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function relative(file) {
  return path.relative(root, file);
}
