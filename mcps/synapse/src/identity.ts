// synapse — identity auto-derivation. Never throws; always returns a valid AgentId
// (matches /^[A-Za-z0-9._:-]+$/). Identity is provenance only; it never gates a write.
const VALID = /[^A-Za-z0-9._:-]+/g;

function sanitize(raw: string): string {
  const s = raw.trim().replace(VALID, "-").replace(/^-+|-+$/g, "").slice(0, 128);
  return s.length > 0 ? s : "";
}

/**
 * Resolve an agent id from, in order: explicit value (env/header) → MCP client name
 * → a stable per-process fallback. Always valid, never empty.
 */
export function deriveAgentId(explicit?: string, clientName?: string): string {
  for (const candidate of [explicit, clientName]) {
    if (candidate) {
      const s = sanitize(candidate);
      if (s) return s;
    }
  }
  return `agent-${process.pid}`;
}
