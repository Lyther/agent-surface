// synapse MCP — Redactor: strip secrets from text BEFORE persistence.
// Implements IRedactor. Patterns cover the agentmemory v0.9.27 set as the
// floor, plus common dev/token formats. Deterministic (no randomness).

import type { IRedactor } from "./contract.js";

interface RedactPattern {
  name: string;
  // Either a single-line regex or a multiline block matcher.
  re: RegExp;
  replacement: string;
}

const PATTERNS: RedactPattern[] = [
  // Bearer tokens
  { name: "bearer", re: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, replacement: "Bearer [REDACTED]" },
  // OpenAI keys
  { name: "openai-project", re: /sk-proj-[A-Za-z0-9_\-]{20,}/g, replacement: "sk-proj-[REDACTED]" },
  { name: "openai-ant", re: /sk-ant-[A-Za-z0-9_\-]{20,}/g, replacement: "sk-ant-[REDACTED]" },
  { name: "openai-generic", re: /sk-[A-Za-z0-9]{20,}/g, replacement: "sk-[REDACTED]" },
  // GitHub tokens
  { name: "github-pat", re: /gh[pousr]_[A-Za-z0-9]{36,}/g, replacement: "gh[pousr]_[REDACTED]" },
  // GitLab PAT
  { name: "gitlab-pat", re: /glpat-[A-Za-z0-9_\-]{20,}/g, replacement: "glpat-[REDACTED]" },
  // Slack tokens
  { name: "slack", re: /xox[bpoas]-[A-Za-z0-9\-]{10,}/g, replacement: "xox-[REDACTED]" },
  // AWS access key id
  { name: "aws-akid", re: /AKIA[0-9A-Z]{16}/g, replacement: "AKIA[REDACTED]" },
  // Private key blocks (multiline)
  { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, replacement: "[REDACTED:private-key]" },
  // Password / secret / token / api_key assignments
  { name: "password-assign", re: /((?:password|passwd|pwd)\s*[:=]\s*["']?)[^\s"']{4,}/gi, replacement: "$1[REDACTED]" },
  { name: "apikey-assign", re: /(?:api[_-]?key)\s*[:=]\s*["']?[^\s"']{8,}/gi, replacement: "[REDACTED]" },
  { name: "secret-assign", re: /(?:secret)\s*[:=]\s*["']?[^\s"']{8,}/gi, replacement: "[REDACTED]" },
  { name: "token-assign", re: /(?:token)\s*[:=]\s*["']?[^\s"']{12,}/gi, replacement: "[REDACTED]" },
];

export function createRedactor(): IRedactor {
  return {
    redact(text: string): { text: string; count: number } {
      let result = text;
      let count = 0;
      for (const p of PATTERNS) {
        const matches = result.match(p.re);
        if (matches) {
          count += matches.length;
          result = result.replace(p.re, p.replacement);
        }
      }
      return { text: result, count };
    },
  };
}

export { PATTERNS };
