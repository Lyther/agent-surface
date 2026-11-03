// synapse — secret redaction on ingest. Best-effort floor matching agentmemory's
// v0.9.27 pattern set, plus generic key=secret, Basic auth and URL credentials.
// Defense-in-depth: also keep records short and never auto-capture transcripts.
import type { IRedactor } from "./contract.js";

// A pattern's capture group, when it has one, is a key/header/scheme prefix kept so context stays readable.
const PATTERNS: RegExp[] = [
  // First, so a quoted value is consumed whole and counted once. Matching starts at the keyword itself,
  // so any prefix (DB_PASSWORD, client_secret, x-api-key, dbPassword) and a separated suffix
  // (AWS_SECRET_ACCESS_KEY) qualify while the scan stays linear; the optional quote admits JSON/YAML
  // keys. Values under 8 characters stay, so `token: string` in a code note survives.
  /((?:api[_-]?key|secret|token|password|passwd|credential)(?:[_-][A-Za-z0-9]+)*["']?\s*[:=]\s*)(?:"[^"\r\n]{8,}"|'[^'\r\n]{8,}'|[^\s"',;]{8,})/gi,
  /Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
  /(\bAuthorization["']?\s*[:=]\s*["']?Basic\s+)[A-Za-z0-9+/]{4,}={0,2}/gi,
  // User and password stop at quotes and commas, so a URL inside JSON never swallows its neighbours. The
  // scheme is capped at 32 characters (real schemes are short), which keeps a long hyphenated run linear.
  /\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s:@/"',]*:[^\s@/"',]+(?=@)/gi,
  /\b(?:sk-proj|sk-ant)-[A-Za-z0-9\-_]{20,}/g,
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/g,
  /\bglpat-[A-Za-z0-9\-_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function createRedactor(): IRedactor {
  return {
    redact(text: string): { text: string; count: number } {
      let count = 0;
      let out = text;
      for (const re of PATTERNS) {
        out = out.replace(re, (_m: string, keep: unknown) => {
          count += 1;
          // without a capture group, replace passes the match offset (a number) here instead
          return typeof keep === "string" ? `${keep}[REDACTED]` : "[REDACTED]";
        });
      }
      return { text: out, count };
    },
  };
}
