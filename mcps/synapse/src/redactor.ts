// synapse — secret redaction on ingest. Best-effort floor matching agentmemory's
// v0.9.27 pattern set, plus generic key=secret. Defense-in-depth: also keep records
// short and never auto-capture transcripts.
import type { IRedactor } from "./contract.js";

const PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
  /\b(?:sk-proj|sk-ant)-[A-Za-z0-9\-_]{20,}/g,
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/g,
  /\bglpat-[A-Za-z0-9\-_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:api[_-]?key|secret|token|password|passwd|credential)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}["']?/gi,
];

export function createRedactor(): IRedactor {
  return {
    redact(text: string): { text: string; count: number } {
      let count = 0;
      let out = text;
      for (const re of PATTERNS) {
        out = out.replace(re, (m) => {
          count += 1;
          // preserve a key= prefix when present so context stays readable
          const eq = m.search(/[:=]/);
          if (eq > 0 && /^(?:api|secret|token|password|passwd|credential)/i.test(m)) {
            return `${m.slice(0, eq + 1)} [REDACTED]`;
          }
          return "[REDACTED]";
        });
      }
      return { text: out, count };
    },
  };
}
