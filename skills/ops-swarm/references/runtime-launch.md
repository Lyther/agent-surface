# ops-swarm runtime launch shapes

Companion reference for `ops-swarm`. Read it once a packet has a runtime and a model. The rule that a
packet must name its runtime before launch is in `SKILL.md`; this file records how each host runs one
packet, how far it may write, and how it fans out.

These shapes track host CLIs and change with them; re-read the host's help before use. The
full-autonomy commands that qualify a runtime are in `workflow-runtime`. A swarm packet takes the least
permission its question needs.

## One packet per launch

Give research, analysis, and critic packets a read-only launch. Give a writing packet its own worktree
and only the autonomy its write scope needs.

| Runtime | Read-only packet | Writing packet changes | Native fan-out |
|---|---|---|---|
| Droid | `droid exec --cwd "$repo" -m "$model" -r "$effort" -o stream-json "$packet"` (read-only by default) | add `--auto low` for edits or `--auto medium` for installs, builds, and local git; add `-w "swarm-$run-$packet_id"` for its own worktree | Custom droids through the Task tool, at `--auto high` only; `--mission` |
| Codex | `codex exec -m "$model" -c "model_reasoning_effort=\"$effort\"" -C "$repo" -s read-only --ephemeral --json "$packet"` | `-s workspace-write` instead of `-s read-only` | Subagents spawned by the parent session |
| Claude Code | `claude -p "$packet" --model "$model" --permission-mode plan --output-format json` | `--permission-mode acceptEdits` instead of `plan` | Agent tool or agent teams |
| Grok Build | `grok --cwd "$repo" -m "$model" --reasoning-effort "$effort" --permission-mode plan -p "$packet" --output-format json --max-turns "$turns"` | `--permission-mode acceptEdits` instead of `plan` | `.grok/agents` roles (1.0.46 or later) |
| Cursor Agent | `cursor-agent -p --workspace "$repo" --mode ask --model "$model" --output-format json "$packet"` | omit `--mode` and add `--force`, which allows commands unless explicitly denied | not verified |
| Kimi Code | none: `--plan` cannot be combined with `-p`, and prompt mode runs tool calls automatically | `kimi -m "$model" -p "$packet" --output-format stream-json`, started inside the packet's worktree | not verified |
| Kilo CLI | `kilo run --dir "$repo" --model "$model" --variant "$effort" --agent ask --format json "$packet"` | `--auto --agent code` instead of `--agent ask` | Task tool or `@agent-name` subagents |
| DSH | `dsh --profile headless "$packet"` | not verified | not verified |

`$repo` is the packet's own worktree. Claude Code, Kimi, and DSH take no directory flag, so start them
from inside it. Grok's `--permission-mode plan` is unverified as read-only; confirm it blocks edits
before relying on it, and give Kimi only packets that may write. Record the model that ran, as
`runtime-catalog.md` describes, in the packet's `probe_ref`.

When the driver's own subagent or agent-manager tool can select the model, isolate the packet, and
return its artifact, use it instead of a headless subprocess. Launch a subprocess when the packet needs
another provider family or a capability the native tool lacks.

## Worker-led packets

Assign a worker lead only on a runtime whose fan-out the probe confirmed, and name that mechanism in the
prompt. A generic "use subagents" instruction is not an assignment.

```text
Runtime: <runtime and version from the probe>.
Model: <model that ran>; subagents: <model or tier per subtask>.
Fan-out: <Task tool | custom droids | Agent tool | @agent-name | parent-spawned subagents>.
Write scope: <worktree path and files>, or read-only.
Forbidden: <push, deploy, production access, and anything else outside the packet>.

You are the worker lead for packet <packet_id>.
Start 2-4 subagents in parallel, each with a distinct filescope or evidence target.
Spawn follow-ups only for newly discovered dependent work, and stop when the evidence is sufficient.
Never let two subagents edit the same file or generated output unless one is read-only.
Collect each subagent's artifact or evidence reference, reconcile conflicts, and run the assigned verification.
Return one summary with changed files, evidence, blockers, residual risk, and the models that actually ran.
```

## Host notes

Droid:

- `droid exec` is read-only by default. `--auto low|medium|high` widens it step by step; `--skip-permissions-unsafe` bypasses every check and belongs only in a disposable environment.
- The Task tool that runs custom droids (`.factory/droids/`, which agent-surface installs) is allowed only at `--auto high` or `--skip-permissions-unsafe` in 0.241.1, and `--auto high` also permits `git push`. Give such a lead its own worktree (`-w`) and list push and deploy as forbidden actions.
- The `-w` name selects the branch to use or create, so make it unique per run; a reused name reuses that branch and its worktree.
- `--mission` hands orchestration to Droid: it starts its own workers (`--worker-model`) and validators (`--validator-model`) and auto-approves their proposals, and it requires `--auto high`. Use it only when the packet's whole write scope is isolated, and treat its validation as packet-internal evidence, not the swarm's verifier.

Kilo:

- When Kilo VS Code is the driver, query `agent_manager_models`, then call `agent_manager` with an explicit model, provider, and variant; do not shell out to another Kilo process. Those tools do not exist in Kilo CLI.
- Kilo CLI exposes `kilo run`, `kilo serve`, `kilo agent`, `kilo models`, and `kilo roll-call`. `--auto` grants full access; record the effective mode.
- Kilo subagents run isolated sessions with their own prompts, models, tools, and permissions. Primary agents invoke them through the Task tool, and users through `@agent-name`. The dedicated Orchestrator mode is deprecated; any agent with full tool access can run subagents.
- If Kilo config validation fails, do not launch packet work. Record `probe_result=failed` and choose another approved runtime or ask for config repair.

Others:

- Claude Code: use the Agent tool or agent teams for small fan-out, and dynamic workflows only for large repeatable fan-out where script-managed orchestration is worth the overhead.
- Codex: ask the parent session to spawn one subagent per independent point, wait for all results, and summarize. Use `codex exec` for a single-role session unless the current surface confirms subagent visibility.
- Antigravity CLI: validate the staged plugin under `~/.gemini/antigravity-cli/plugins/agent-surface`, register it with `agy plugin install`, then use its agents.
