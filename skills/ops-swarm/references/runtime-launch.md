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
| Droid | `droid exec --cwd "$repo" -m "$model" -r "$effort" -o stream-json "$packet"` (read-only by default) | add `--auto low` for edits or `--auto medium` for installs, builds, and local git; `--cwd "$repo"` already places it in the packet's worktree, so do not add `-w`, which would create a second one | Custom droids through the Task tool, at `--auto high` only; `--mission` |
| Codex | `codex exec -m "$model" -c "model_reasoning_effort=\"$effort\"" -C "$repo" -s read-only --ephemeral --json "$packet"` | `-s workspace-write` instead of `-s read-only` | Subagents spawned by the parent session |
| Claude Code | `claude -p "$packet" --model "$model" --permission-mode plan --output-format json` | `--permission-mode acceptEdits` instead of `plan`, plus one `--allowedTools` prefix rule per verification command, such as `"Bash(npm test:*)"`, since `-p` cannot approve other shell commands | Agent tool or agent teams |
| Grok Build | none verified: `--permission-mode plan` is not shown to block shell writes | `grok --cwd "$repo" -m "$model" --reasoning-effort "$effort" --permission-mode dontAsk --allow "$rule" -p "$packet" --output-format json --max-turns "$turns"`, with one `--allow` per tool the packet needs, such as `Read`, `Grep`, `Edit`, and each verification command, because `dontAsk` silently denies everything else; never `bypassPermissions`, which also permits `git push` | `.grok/agents` roles (1.0.46 or later) |
| Cursor Agent | none verified: `--mode ask` is reported to still run shell commands | `cursor-agent -p --force --workspace "$repo" --model "$model" --output-format json "$packet"`; `--force` allows commands unless explicitly denied | not verified |
| Kimi Code | none: `--plan` cannot be combined with `-p`, and prompt mode runs tool calls automatically | `kimi -m "$model" -p "$packet" --output-format stream-json`, started inside the packet's worktree | not verified |
| Kilo CLI | `kilo run --dir "$repo" --model "$model" --variant "$effort" --agent ask --format json "$packet"` | `--auto --agent code` instead of `--agent ask` | Task tool or `@agent-name` subagents |
| DSH | none verified | `dsh --profile headless "$packet"` | not verified |

`$repo` is the packet's own worktree. Claude Code, Kimi, and DSH take no directory flag, so start them
from inside it. Record the model that ran, as `runtime-catalog.md` describes, in the packet's
`probe_ref`.

Grok, Cursor, Kimi, and DSH have no verified read-only launch, so never assign them research,
analysis, or critic packets; give them only packets that may write, each in a disposable worktree.
Claude Code's `plan` mode blocked a shell write in a 2026-10-15 probe; Kilo's `ask` agent is
unverified while its CLI is blocked.

A worktree does not stop host reads, network access, pushes, or deploys, and a forbidden-actions list
in the prompt is not an authorization boundary. Deny those with the runtime's own controls, such as
Claude Code's `--disallowedTools`, Grok's `--deny`, Droid's `block` rules, or Cursor's
`--sandbox enabled`. Launch a runtime that has no such control, such as Kimi or DSH, without push or
deploy credentials.

An untrusted target, such as an outside repository, web page, or artifact, can inject instructions into
any packet. Read-only modes still read files and the environment, verification commands such as
`npm test` run the checkout's own scripts with your identity, and the model's output leaves the host.
Run every packet over an untrusted target, whatever its runtime or role, in an isolated container or VM
with a scrubbed home and environment, no credentials, and restricted network.

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
- The Task tool that runs custom droids (`.factory/droids/`, which agent-surface installs) is allowed only at `--auto high` or `--skip-permissions-unsafe` in 0.241.1, and `--auto high` also permits pushes and deploys, which neither a worktree nor the prompt can stop. Before running a Droid lead, add `block` rules for push and deploy commands to Droid's command permission rules and confirm each by running, for example, `droid rules check --command 'git push'` from `$repo`, the directory the lead runs in, so the check reads the same settings the lead will; without them, keep Droid packets single-agent.
- `--mission` hands orchestration to Droid: it starts its own workers (`--worker-model`) and validators (`--validator-model`) and auto-approves their proposals, and it requires `--auto high`. Use it only with the same `block` rules in place and when the packet's whole write scope is isolated, and treat its validation as packet-internal evidence, not the swarm's verifier.

Kilo:

- When Kilo VS Code is the driver, query `agent_manager_models`, then call `agent_manager` with an explicit model, provider, and variant; do not shell out to another Kilo process. Those tools do not exist in Kilo CLI.
- Kilo CLI exposes `kilo run`, `kilo serve`, `kilo agent`, `kilo models`, and `kilo roll-call`. `--auto` grants full access; record the effective mode.
- Kilo subagents run isolated sessions with their own prompts, models, tools, and permissions. Primary agents invoke them through the Task tool, and users through `@agent-name`. The dedicated Orchestrator mode is deprecated; any agent with full tool access can run subagents.
- If Kilo config validation fails, do not launch packet work. Record `probe_result=failed` and choose another approved runtime or ask for config repair.

Others:

- Claude Code: use the Agent tool or agent teams for small fan-out, and dynamic workflows only for large repeatable fan-out where script-managed orchestration is worth the overhead.
- Codex: ask the parent session to spawn one subagent per independent point, wait for all results, and summarize. Use `codex exec` for a single-role session unless the current surface confirms subagent visibility.
- Antigravity CLI: validate the staged plugin under `~/.gemini/antigravity-cli/plugins/agent-surface`, register it with `agy plugin install`, then use its agents.
