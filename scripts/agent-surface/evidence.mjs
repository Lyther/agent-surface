// The `run` command: execute a verify command and capture hashed evidence (redacted
// stdout/stderr, HEAD's tree plus a dirty flag, timing) for a workflow round. Secret
// redaction and command-class recording live here.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { gitValue } from "./proc.mjs";
import { fail, requiredArgValue, safeFilename, safeTimestamp, sha256 } from "./util.mjs";

// timeout(1)'s exit status, so a child that exits 0 on SIGTERM still reads as timed out.
const TIMEOUT_EXIT_CODE = 124;
// Shorter argv secret values are not scrubbed from output, so a value like `x` cannot erase every `x`.
const MIN_ECHOED_SECRET_LENGTH = 4;

export async function runEvidence(args) {
  const separator = args.indexOf("--");
  if (separator === -1 || separator === args.length - 1) {
    fail("run requires -- before the command to execute");
  }

  const options = args.slice(0, separator);
  const command = args[separator + 1];
  const commandArgs = args.slice(separator + 2);
  const taskId = requiredArgValue(options, "--task");
  const klass = requiredArgValue(options, "--class");
  const timeoutMs = Number(requiredArgValue(options, "--timeout"));
  const outDir = path.resolve(requiredArgValue(options, "--out"));
  const allowedClasses = new Set(["read_only", "build_test", "network", "filesystem_destructive", "deployment", "database_mutation"]);

  if (!allowedClasses.has(klass)) fail(`unsupported command class: ${klass}`);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) fail("--timeout must be a positive integer");

  await mkdir(outDir, { recursive: true });

  const startedAt = new Date();
  const startedStamp = safeTimestamp(startedAt.toISOString());
  const basename = `${startedStamp}-${safeFilename(taskId)}`;
  // tree_hash is HEAD's tree and omits uncommitted changes; dirty records whether any existed at start.
  const treeHash = gitValue(["rev-parse", "HEAD^{tree}"]);
  const porcelain = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  const dirty = porcelain.status === 0 ? porcelain.stdout !== "" : null;
  const started = Date.now();
  // spawnSync sends one signal at the timeout and then waits for the child to exit, so a child that
  // ignored SIGTERM held the run forever and no evidence was written. SIGKILL cannot be ignored. It
  // reaches only that child: a process the child started is not tracked and can outlive the run.
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdoutRaw = result.stdout ?? "";
  const stderrRaw = result.stderr ?? (result.error ? `${result.error.message}\n` : "");
  const cmdRaw = [command, ...commandArgs];
  const cmdRedacted = redactEvidenceCmd(cmdRaw);
  const stdoutRedacted = redactEvidenceOutput(stdoutRaw, cmdRedacted.secrets);
  const stderrRedacted = redactEvidenceOutput(stderrRaw, cmdRedacted.secrets);
  const stdout = stdoutRedacted.text;
  const stderr = stderrRedacted.text;
  const stdoutPath = path.join(outDir, `${basename}.stdout.log`);
  const stderrPath = path.join(outDir, `${basename}.stderr.log`);
  const evidencePath = path.join(outDir, `${basename}.evidence.json`);
  const timedOut = result.error?.code === "ETIMEDOUT";
  const exitCode = timedOut ? TIMEOUT_EXIT_CODE : typeof result.status === "number" ? result.status : 1;
  const evidence = {
    task_id: taskId,
    class: klass,
    cmd: cmdRedacted.cmd,
    cmd_hash_raw: `sha256:${sha256(JSON.stringify(cmdRaw))}`,
    cwd: process.cwd(),
    execution_consent: {
      mode: "full-access",
      source: "rules/00-precedence-and-safety.mdc",
    },
    timeout_ms: timeoutMs,
    exit_code: exitCode,
    signal: result.signal ?? null,
    timed_out: timedOut,
    started_at: startedAt.toISOString(),
    duration_ms: durationMs,
    tree_hash: treeHash,
    dirty,
    stdout_ref: path.relative(process.cwd(), stdoutPath),
    stdout_hash: `sha256:${sha256(stdout)}`,
    stdout_raw_hash: `sha256:${sha256(stdoutRaw)}`,
    stdout_raw_stored: false,
    stderr_ref: path.relative(process.cwd(), stderrPath),
    stderr_hash: `sha256:${sha256(stderr)}`,
    stderr_raw_hash: `sha256:${sha256(stderrRaw)}`,
    stderr_raw_stored: false,
    redaction: {
      applied: stdoutRedacted.applied || stderrRedacted.applied || cmdRedacted.applied,
      patterns: [...new Set([...stdoutRedacted.patterns, ...stderrRedacted.patterns, ...cmdRedacted.patterns])],
    },
  };

  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`evidence: ${evidence.stdout_ref}`);
  console.log(`metadata: ${path.relative(process.cwd(), evidencePath)}`);
  console.log(`exit_code: ${exitCode}`);
  process.exitCode = exitCode;
}

const SECRET_NAME_SEGMENTS = new Set(["secret", "token", "password", "passwd", "pwd", "apikey"]);
// Single-dash options are only the bare secret names. Opaque values like
// `-sentinel-secret-value` must not be classified as options.
const SHORT_SECRET_OPTION_NAME = /^(?:api[_-]?key|secret|token|password|passwd|pwd)$/i;

/** True for --token, --access-token, --client-secret, --aws-secret-access-key, etc. */
function isSecretOptionName(name) {
  const parts = String(name).toLowerCase().split(/[-_]+/).filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (SECRET_NAME_SEGMENTS.has(part)) return true;
    if (part === "api" && parts[i + 1] === "key") return true;
  }
  return false;
}

function parseSecretOption(part) {
  const eq = /^(--?)([^=]+)=(.*)$/.exec(part);
  if (eq) {
    const allowed = eq[1] === "--" ? isSecretOptionName(eq[2]) : SHORT_SECRET_OPTION_NAME.test(eq[2]);
    if (allowed) return { kind: "eq", prefix: eq[1], name: eq[2], value: eq[3] };
  }
  const flag = /^(--?)(.+)$/.exec(part);
  if (flag && !part.includes("=")) {
    const allowed = flag[1] === "--" ? isSecretOptionName(flag[2]) : SHORT_SECRET_OPTION_NAME.test(flag[2]);
    if (allowed) return { kind: "flag", prefix: flag[1], name: flag[2] };
  }
  return null;
}

// Quoted values may hold spaces; escaped quotes stay inside them. \"…\" is a value inside a
// JSON string that was serialized again: there each of the value's own escapes (\" \\ \n …)
// reads as two backslashes plus the escaped character, so only a lone \" closes it.
const SECRET_VALUE = String.raw`\\"(?:[^"\\\r\n]|\\\\(?:\\\\|\\"|[^"\\\r\n]))*\\"|"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'`;
// A key may close with a quote or an escaped quote before its separator: "password": or \"password\":.
const KEY_END = String.raw`(?:\\?["'])?`;
// A header printed as an array (Node's inspect, indented JSON) spans lines up to the `]`
// that opens a line, so a `]` inside a value does not end it. Scanning whole lines, at
// most 64, keeps many unclosed arrays linear; a one-line array falls to rest-of-line.
const ARRAY_VALUE = String.raw`\[[ \t]*\r?\n(?:[^\n]*\n){0,64}?[ \t]*\]`;
const CREDENTIAL = String.raw`(?:Bearer|Basic)\s+[^\s"'\\]+`;
// Group 1 is kept, group 2 is the secret.
const TEXT_REDACTIONS = [
  {
    name: "authorization-header",
    // The value may open a header array, on one line (Node's inspect) or across lines (indented JSON);
    // the secret runs through every further credential element of that array.
    pattern: new RegExp(
      String.raw`(Authorization${KEY_END}\s*:\s*(?:\[\s*)?${KEY_END}(?:Bearer|Basic)\s+)([^\s"'\\]+(?:${KEY_END}\s*,\s*${KEY_END}${CREDENTIAL})*)`,
      "gi",
    ),
  },
  {
    name: "cookie-header",
    pattern: new RegExp(String.raw`((?:Set-)?Cookie${KEY_END}\s*:\s*)(${SECRET_VALUE}|${ARRAY_VALUE}|[^\r\n]+)`, "gi"),
  },
  {
    name: "secret-assignment",
    pattern: new RegExp(
      String.raw`\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret|token|password|passwd|pwd)(?:[_-][A-Za-z0-9]+)*\b${KEY_END}\s*[:=]\s*)(${SECRET_VALUE}|["']?[^\s'"]+)`,
      "gi",
    ),
  },
  {
    name: "private-key-block",
    pattern: /()(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g,
    replacement: "[REDACTED PRIVATE KEY]",
  },
  {
    name: "url-credential",
    pattern: /(:\/\/)([^\/\s:@]+:[^\/\s:@]+)(?=@)/g,
  },
];

/** Redact known secret shapes; push each removed secret value onto `found`. */
function redactEvidenceText(value, found = []) {
  const patterns = [];
  let text = value;
  for (const { name, pattern, replacement = "[REDACTED]" } of TEXT_REDACTIONS) {
    const next = text.replace(pattern, (_match, kept, secret) => {
      const quote = /^(\\?["'])[\s\S]*\1$/.exec(secret)?.[1] ?? "";
      found.push(quote ? secret.slice(quote.length, -quote.length) : secret);
      return `${kept}${quote}${replacement}${quote}`;
    });
    if (next !== text) {
      patterns.push(name);
      text = next;
    }
  }

  return { text, applied: patterns.length > 0, patterns };
}

/** Redact stdout/stderr, including bare echoes of secret values recognized in argv. */
function redactEvidenceOutput(value, argvSecrets) {
  const redacted = redactEvidenceText(value);
  let text = redacted.text;
  for (const secret of argvSecrets) text = text.replaceAll(secret, "[REDACTED]");
  if (text === redacted.text) return redacted;
  return { text, applied: true, patterns: [...redacted.patterns, "argv-secret-echo"] };
}

/** Redact secret option values in argv (`--token x`, `--token=-x`, `--access-token x`). */
function redactEvidenceCmd(cmdRaw) {
  const patterns = [];
  const cmd = [];
  const found = [];
  for (let i = 0; i < cmdRaw.length; i += 1) {
    const part = cmdRaw[i];
    const opt = parseSecretOption(part);

    if (opt?.kind === "eq") {
      cmd.push(`${opt.prefix}${opt.name}=[REDACTED]`);
      patterns.push("secret-flag");
      found.push(opt.value);
      continue;
    }

    if (opt?.kind === "flag") {
      cmd.push(part);
      const next = i + 1 < cmdRaw.length ? cmdRaw[i + 1] : null;
      // Values are opaque and may look like options. Only another recognized secret
      // option is structural enough to process separately.
      if (next !== null && parseSecretOption(next) === null) {
        cmd.push("[REDACTED]");
        patterns.push("secret-flag");
        found.push(next);
        i += 1;
      }
      continue;
    }

    const textPart = redactEvidenceText(part, found);
    patterns.push(...textPart.patterns);
    cmd.push(textPart.text);
  }
  // Longest first, so a secret that contains another is replaced whole.
  const secrets = [...new Set(found)]
    .filter((secret) => secret.length >= MIN_ECHOED_SECRET_LENGTH)
    .sort((left, right) => right.length - left.length);
  return { cmd, applied: patterns.length > 0, patterns, secrets };
}
