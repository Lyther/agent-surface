# ops-swarm runtime launch shapes

Companion reference for `ops-swarm`. Read it once a packet's runtime is chosen and a host-specific
launch shape is needed. The rule that a packet must name its runtime before launch is in `SKILL.md`;
this file only records how each host spells it.

These shapes track host CLIs and change with them. Re-read the host's own help output before use.

Use runtime-specific prompt variants instead of a generic "use subagents" instruction:

- Kilo CLI: use Task-tool or `@agent-name` subagents after `kilo run --help`, `kilo agent list`, and model/config probes pass.
- Kilo VS Code: query `agent_manager_models`, then use `agent_manager` with explicit task model/provider/variant overrides; do not shell out to another Kilo process.
- Claude Code: use the Agent tool or agent teams for small fan-out; use dynamic workflows only for large repeatable fan-out where script-managed orchestration is worth the overhead.
- Antigravity CLI: validate the staged plugin under `~/.gemini/antigravity-cli/plugins/agent-surface`, register it with `agy plugin install`, then use its agents.
- Codex: explicitly ask the parent Codex session to spawn one subagent per independent point, wait for all results, and summarize. Use `codex exec` for single role sessions unless the current Codex surface confirms subagent visibility.

For aggressive Kilo worker assignment, use a prompt shape like this after probing the exact model id with `kilo models` or a configured project profile:

```text
Runtime: Kilo CLI.
Model: $KILO_WORKER_MODEL, expected to resolve to an ID returned by the current `kilo models` output.
Agent/mode: code or the configured implementation agent.
Launch: kilo run --auto --dir "$repo" --model "$KILO_WORKER_MODEL" --variant "$KILO_WORKER_EFFORT" --agent code --format json --title "$packet_id" "<packet prompt>"

You are the worker lead for packet <packet_id>.
Use Kilo subagents in parallel via the Task tool when subtasks are independent.
Start with 2-4 subagents, each with a distinct filescope or evidence target.
Monitor subagent progress, spawn follow-up subagents only for newly discovered dependent work, and stop spawning when evidence is sufficient.
Do not let two subagents edit the same file or generated output unless one is read-only.
Collect each subagent's artifact/evidence reference, reconcile conflicts, run the assigned verification, then return one summary with changed files, evidence, blockers, and residual risk.
```

Kilo-specific notes from current docs and local probe:

- Kilo CLI exposes `kilo run`, `kilo serve`, `kilo agent`, `kilo models`, and `kilo roll-call`.
- `kilo run` accepts `--model`, `--agent`, `--format json`, `--dir`, `--variant`, and `--auto`; use `--auto` for this distribution and record the effective full-access mode.
- Kilo subagents run isolated sessions with tailored prompts, models, tool access, and permissions. Primary agents can invoke them through the Task tool, and users can invoke configured subagents with `@agent-name`.
- Kilo Agent Manager is an extension feature. When the driver is Kilo VS Code, use its native model search and session tools; do not assume those tools exist in Kilo CLI.
- Current Kilo docs say dedicated Orchestrator mode is deprecated; agents with full tool access now support subagents natively. Prefer explicit agent/mode assignment over relying on a legacy orchestrator label.
- If Kilo config validation fails, do not launch packet work. Record the config error as `probe_result=failed` and choose another approved runtime or ask for config repair.
