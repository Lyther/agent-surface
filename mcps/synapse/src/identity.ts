// synapse MCP — Identity: resolve agent_id + namespace + db path from env.
// Per-process trust (asserted, not cryptographic). Mutating tools require a
// resolvable agentId or fail IDENTITY_REQUIRED.

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IIdentity } from "./contract.js";

export class EnvIdentity implements IIdentity {
  private _agentId: string | null;
  private _namespace: string;
  private _dbPath: string;

  constructor(opts?: { agentId?: string | null; namespace?: string; dbDir?: string }) {
    // agentId: env > constructor > MCP client info (set later by server) > null
    this._agentId = opts?.agentId ?? process.env.SYNAPSE_AGENT_ID ?? null;
    // namespace: env > constructor > project-root hash
    this._namespace =
      opts?.namespace ??
      process.env.SYNAPSE_NAMESPACE ??
      this.defaultNamespace();
    // db path: <dbDir>/<namespace>.sqlite (mode 600 directory)
    const dbDir = opts?.dbDir ?? process.env.SYNAPSE_DB_DIR ?? join(homedir(), ".synapse");
    mkdirSync(dbDir, { recursive: true, mode: 0o700 });
    this._dbPath = join(dbDir, `${this._namespace}.sqlite`);
  }

  agentId(): string | null {
    return this._agentId;
  }

  /** Called by the server after receiving the MCP initialize clientInfo. */
  setAgentId(id: string): void {
    if (!this._agentId) {
      this._agentId = id;
    }
  }

  namespace(): string {
    return this._namespace;
  }

  dbPath(): string {
    return this._dbPath;
  }

  private defaultNamespace(): string {
    // Hash the CWD to create a stable namespace per project.
    const cwd = process.cwd();
    return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  }
}
