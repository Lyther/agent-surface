// Command sources: load commands/*.md and parse their minimal frontmatter into a metadata
// object (name, aliases, phase, description) + body. Parsing only — validation of that
// metadata lives in the check layer.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { files } from "./fs-tree.mjs";
import { relative } from "./registry.mjs";

export async function readCommands() {
  const commandFiles = await files("commands", [".md"]);
  const commands = [];

  for (const file of commandFiles) {
    const text = await readFile(file, "utf8");
    commands.push(parseCommand(file, text));
  }

  return commands;
}

export function parseCommand(file, text) {
  const name = path.basename(file, ".md");
  const metadata = {
    name,
    aliases: [],
    phase: commandPhaseFromName(name),
    description: null,
  };
  const frontmatterErrors = [];
  let body = text;
  let hasFrontmatter = false;

  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) {
      frontmatterErrors.push("frontmatter not closed");
    } else {
      hasFrontmatter = true;
      const parsed = parseSimpleFrontmatter(text.slice(4, end), frontmatterErrors);
      Object.assign(metadata, parsed);
      body = text.slice(end + 5).replace(/^\s+/, "");
    }
  }

  metadata.name ??= name;
  metadata.aliases ??= [];

  return {
    file,
    relativePath: relative(file),
    name,
    body,
    metadata,
    hasFrontmatter,
    frontmatterErrors,
  };
}

export function parseSimpleFrontmatter(text, errors) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (!scalar) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }

    const [, key, rawValue] = scalar;
    if (rawValue === "") {
      const values = [];
      for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
        const item = lines[itemIndex].match(/^\s+-\s*(.*?)\s*$/);
        if (!item) break;
        values.push(parseFrontmatterScalar(item[1]));
        index = itemIndex;
      }
      out[key] = values;
      continue;
    }

    out[key] = parseFrontmatterScalar(rawValue);
  }
  return out;
}

export function parseFrontmatterScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function commandPhaseFromName(name) {
  const prefix = name.split("-")[0];
  const map = {
    arch: "decide",
    boot: "observe",
    dev: "build",
    flow: "decide",
    lint: "verify",
    ops: "improve",
    qa: "review",
    ship: "ship",
    stellaris: "game",
    verify: "verify",
    workflow: "arbitrate",
  };
  return map[prefix] ?? "misc";
}
