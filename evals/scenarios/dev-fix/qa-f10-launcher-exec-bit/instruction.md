A real Synapse shell shim in a disposable user profile had its owner execute bit removed (0755 to 0655). Both preview and install classified the bridge as available, and install exited 0 with the generated Codex MCP pointing directly at it. Launching exactly that command returned EACCES before initialize. Restoring 0755, without changing the generated config, initialized Synapse and listed seven tools.

Impact: prerequisite detection certifies an unusable first-party service and skips its repair.

The repository is in `/app` (node 22). Run commands as the unprivileged user `qa`; root bypasses file-permission checks. Fix it.
