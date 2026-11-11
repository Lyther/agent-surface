# REA MCP

[Reverse Engineer Anything](https://github.com/morluto/rea) provides JavaScript/Electron analysis and adapters for native-analysis tools. It is an explicit opt-in service named `rea`, outside the general, development and cybersecurity profiles. Agent-surface registers the native `rea mcp` command; it does not install REA, its providers, or its bundled skill.

## Install the reviewed source

The `external/rea` submodule pins revision [`5fde39454e5457448c87b107c0fc034d1674a74b`](https://github.com/morluto/rea/tree/5fde39454e5457448c87b107c0fc034d1674a74b), matching the service registry. The npm release `rea-agents@6.8.0` is older despite sharing the version number: it lacks tool-family selection and includes affected runtime dependencies. Executable detection does not verify an existing installation's revision.

Build this revision with **Node 24.22.1**. Its build scripts use `stripTypeScriptTypes({mode: "transform"})`, which Node 26 removed. Upstream declares runtime support for Node 22.23.4+, 24.22.1+, and 26.12.1+ within its supported major lines. Use the same Node 24 installation for the commands below and for `agent-surface install`, whose runtime launcher supplies Node to the child.

Linux also needs a procps-compatible `ps`. Run these commands on macOS/Linux from an agent-surface checkout you intend to keep; the launcher points into its submodule:

```sh
git submodule update --init -- external/rea
cd external/rea
npm ci --ignore-scripts
npm run build
npm prune --omit=dev --omit=optional --ignore-scripts
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/scripts/rea.mjs" "$HOME/.local/bin/rea"
```

The runtime installation omits development dependencies and optional native integrations, including Frida's affected dependency chain. The build needs its platform compiler packages, so omit optional dependencies **after** building. Rerun `npm ci` before rebuilding. Native backends, instrumentation and browser/device features need their own upstream prerequisites; a tool appearing in the catalog does not establish that its backend is installed.

Keep host registration with agent-surface: do not also run `rea setup`, which manages the same host configs and copies its large skill into native skill directories. No REA skill or new always-on instructions are distributed here.

## Select the service

From the agent-surface checkout, choose the host you use (Codex is the example):

```sh
node scripts/agent-surface.mjs install --target codex --scope user --category mcps --service rea --dry-run
node scripts/agent-surface.mjs install --target codex --scope user --category mcps --service rea --allow-scope-root
```

The installer checks `~/.local/bin/rea`, `~/.local/bin/rea.cmd` and `PATH`, then writes the resolved launch path through its existing runtime launcher where necessary. A missing executable reports an unmet prerequisite and leaves REA unwired. This service needs no model credential for static analysis, and the generated command receives no credential file. A later general full sync removes managed optional entries; reselect REA after that sync if wanted.

The upstream full tool catalog is retained. For a focused session, supported source builds accept `REA_MCP_TOOL_FAMILIES` in the host's REA environment; see [upstream configuration](https://github.com/morluto/rea/blob/5fde39454e5457448c87b107c0fc034d1674a74b/docs/getting-started/installation.md). Family selection and hot/cold catalog refresh are not enabled by this integration.

## Verify the installed route

With the reviewed `rea` executable on `PATH`, run:

```sh
AGENT_SURFACE_LIVE_REA=1 node tests/suites/live-rea.test.mjs
```

This opt-in check creates disposable homes and host configs, compares the JSON and TOML launch entries, starts the exact generated command with a minimal `PATH` from another working directory, and analyzes an Electron source fixture. It requires two parsed JavaScript files, one exposed API, and a matched renderer/main IPC pair. It does not execute the fixture, call a model, download packages, or qualify Ghidra, IDA, Hopper, Frida or a host's model behavior.

Verified on Linux with Node 24.22.1 at the revision above: MCP initialization, discovery and all fixture assertions passed with networking disabled. The pruned runtime dependency audit reported zero advisories. Native Windows/macOS execution and model-driven use remain unqualified.
