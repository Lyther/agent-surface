---
name: workflow-runtime
description: "Prove skill or workflow discovery, full-autonomy tool execution, and task-shaped materialization before assigning a CLI, extension, provider, or model to a workflow role."
---

## PHASE GATE - EVALUATE FIRST

Parse the invocation before applying any other section.

If `--phase inspect` is present, or the caller says `reference-only`, `do not execute`, or `do not call tools`:

1. Do not call any tool, including shell, file-read, MCP, search, or `echo`.
2. Do not inspect the runtime, repository, environment, credentials, or filesystem.
3. Return only the explanation or exact text the caller requested.
4. Stop. None of the execution, discovery, probe, result-schema, or verdict instructions below apply.

Every remaining section applies only to `discovery`, `materialization`, `mcp`, or `full`.

## Objective

Qualify a complete coding runtime for one bounded workflow role, not a model name or a successful chat response. Never assign a runtime without a task-shaped materialization probe. A runtime is the resolved binary, version, provider, model, command or skill loader, tool protocol, working-directory behavior, filesystem reach, permission mode, output format, and authentication state; every layer must be reachable through the exact invocation orchestration will use.

## Input

```text
workflow-runtime
  --phase inspect|discovery|materialization|mcp|full
  --role boss|worker|reviewer|qa|judger|rescue
  --runtime <exact-candidate>
  --filescope <path...>
  --artifact <required-output-path>
  --time-budget <duration>
```

- `inspect` is the phase gate's no-execution mode: use it to inspect, explain, or prove this skill loaded without running a runtime probe. An explicit `inspect`, `reference-only`, `do not execute`, or `do not call tools` request always wins over the full-probe objective.
- Every other phase requires `--role`, an exact `--runtime`, and `--time-budget`; `materialization` and `full` also require `--filescope` and `--artifact`. Reject missing inputs instead of guessing `auto`, selecting the current host, or broadening the phase.
- This is an auto-invocable Agent Skill on native skill hosts. Command-only hosts receive only the small manual-command set, so qualification must prove the skill carrier the selected host actually discovers. Use explicit invocation only when the probe tests invocation syntax.

## Execution Posture

- Full execution consent applies: select the host's full-access, bypass, YOLO, auto-approve, or equivalent mode explicitly, record the observed mode, and do not stop for routine per-operation approval.
- Consent is not role capability. A worker gets the host's unrestricted edit and shell capability; a reviewer, researcher, analyzer, adversary, or boss stays read-only because that is its role. The rendered agent/tool profile and filescope enforce the boundary, not approval dialogs; never give a read-only role write tools because consent is full.
- For an authorized provider-backed probe, use only the selected provider's credential: import that one named variable from a git-ignored `.env` without printing it, and never run `cat`, `head`, `tail`, `sed`, `rg`, or another content-display command on the whole file. Never persist, log, or echo secret values.
- Remove inherited `NODE_TLS_REJECT_UNAUTHORIZED` from networked Node launches so the probe tests the runtime's normal TLS path.
- Do not mistake a proxy, wrapper, stale symlink, IDE login, or cached daemon for the binary and account the headless command actually uses.

## Driver and Recursion Gate

The runtime executing this skill is the driver; the `--runtime` value is the candidate.

- A driver-owned native subagent or agent-manager tool is not an external CLI candidate. Qualify it through its native tool call, resolved model, isolated session/worktree behavior, and materialized artifact; prefer this path when those controls suffice. Never shell-launch the driver's own executable.
- Before calling an external CLI candidate, resolve the driver and candidate families. If they are the same CLI family or resolve to the same executable, stop with `BLOCKED: external_driver_required` and name a different installed runtime or a parent process as the unblock path.
- Never launch a runtime from inside its own active headless session, daemon, extension host, or workflow: self-launch can recurse, reuse session state, collide on a hub port, inherit daemon-only environment, or grade the driver instead of the candidate. A self-probe transcript is invalid even when the nested command exits zero.

## Discovery Gate

Before a materialization probe:

1. Resolve the executable with `command -v`, resolve symlinks, and record `--version`.
2. Read the live subcommand help; flags from another runtime or an older release are invalid evidence.
3. Verify authentication through the same CLI/provider path.
4. Verify the generated command, skill, workflow, recipe, agent, and MCP config at the path the runtime actually scans.
5. Invoke the generated surface through its native mechanism when one exists.

| Runtime | Generated surface | Discovery or explicit invocation |
|---|---|---|
| Codex | Agent Skill | model selection or `$<name>` |
| Claude Code | Agent Skill | model selection or the host skill picker |
| Cline | Agent Skill | model `use_skill` action |
| Kilo | Agent Skill | native skill tool |
| Kimi Code | Agent Skill | model selection or `/skill:<name>` |
| OpenCode | Agent Skill | native skill tool |
| Goose | Agent Skill | native Agent Skills loader |
| Antigravity CLI | plugin skill | plugin skill mechanism after `agy plugin validate` and `agy plugin enable` |

Generated files alone do not prove discovery. If a runtime can use the raw prompt but cannot discover or invoke its generated surface, mark the skill/workflow capability `UNREACHABLE`; never fall back to pasting the skill body, or count a command fallback as native Agent Skill discovery, and call the distribution successful.

## Materialization Probe

In a fresh scratch directory, require the runtime to (1) read one exact input file, (2) create one exact output file through its real tool path, (3) preserve the specified bytes, including the trailing newline, (4) read the output back, (5) run one harmless command that reports real state, (6) return an exact final token, and (7) exit cleanly.

Check the file independently with byte count and hex output; trust inspected world state over final narration. A tool transcript, `exit 0`, or `PROBE_OK` is insufficient when the file is missing, written in another working directory, or contains different bytes. Extra final prose is an output-contract failure even when world state is correct. A `Reply OK only` exchange grades nothing.

For MCP qualification, require `tools/list` plus one harmless real tool call through the runtime; a config file, generated schema, connected badge, or direct server test alone does not prove host reachability.

Assign no long unattended work until progress, cancellation, timeout, and artifact liveness are proven.

## Full-Autonomy Starting Points

These commands are version-sensitive; re-read live help before use.

### Codex

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -C "$repo" --ephemeral --json \
  -o "$out" -m "$model" \
  -c "model_reasoning_effort=\"$effort\"" \
  '$workflow-runtime --role worker ...'
```

Custom prompts are not the distribution mechanism: the compiler emits auto-invocable canonical skills, and current Codex also resolves an explicit `$name` during qualification. Prefer `--output-schema` for role artifacts.

### Claude Code

```bash
claude -p "$prompt" \
  --model "$model" \
  --dangerously-skip-permissions \
  --output-format stream-json
```

Verify `claude auth status` first; an IDE subscription session does not prove CLI authentication.

### Cline

Resolve and version the exact binary before building a command. Headless surfaces are incompatible across releases: recent Node CLI builds expose `--cwd`, `--provider`, `--model`, `--thinking`, `--auto-approve`, and `--json`; legacy Core CLI builds use `--oneshot`, `--yolo`, `--output-format`, and settings-owned model selection. This machine exposed both families during the 2026-09-03 probe, so no unversioned Cline command is a valid standing recipe.

Configure the Ollama integration with `ollama launch cline --model "$ollama_model" --config`, then re-read the resolved `cline --help` and run a task-shaped probe. Only the Cline CLI and Cline's SDK-based extension read the shared `~/.cline` MCP settings file; the pre-SDK extension most installs run reads its IDE's `globalStorage` file. A plain prompt without a skill-selection event proves the agent, not skill discovery.

### Kilo and OpenCode

```bash
kilo run --auto --dir "$repo" --model "$provider_model" --variant "$effort" --agent code --format json "$prompt"
opencode run --auto --dir "$repo" --model "$provider_model" --variant "$effort" --agent build --format json "$prompt"
```

Before either launch, inspect the effective runtime config and require `share` to be exactly `disabled`: an inherited `auto` setting publishes every new session even when the command omits `--share`. If a probe creates a share, stop, revoke it through the runtime's unshare operation, and exclude that transcript from evidence. Never print or retain a share secret or URL.

Require the live runtime to list or resolve the generated skill through its native skill tool. Credentials and model aliases are runtime-specific: an extension login does not prove the headless CLI, and a raw Ollama `:cloud` ID is not necessarily the runtime's `provider/model` selector.

### Grok Build

```bash
grok --cwd "$repo" \
  --permission-mode bypassPermissions \
  -p "$prompt" -m "$model" \
  --reasoning-effort "$effort" \
  --output-format json --max-turns "$max_turns"
```

Confirm entitlement and the resolved model. Remove thought-like fields before retaining output.

### Antigravity CLI

```bash
agy --dangerously-skip-permissions \
  --add-dir "$repo" \
  --print "$prompt"
```

The CLI may execute from its own scratch project; an explicit absolute materialization path is required to prove reach into the requested workspace.

### Factory Droid

```bash
droid exec --skip-permissions-unsafe \
  --cwd "$repo" \
  --output-format stream-json \
  "$prompt"
```

Do not substitute `--auto high`; the unsafe bypass is the CLI's actual no-check mode.

### Cursor Agent

```bash
cursor_agent="$(command -v cursor-agent)"
"$cursor_agent" --print \
  --force --sandbox disabled --approve-mcps \
  --workspace "$repo" \
  --model "$model" \
  --output-format stream-json \
  "$prompt"
```

Never rely on the bare `agent` command, which several products claim; resolve `cursor-agent` or the editor's `cursor agent` subcommand and record the real executable.

### DSH

```bash
dsh --profile headless "$prompt"
```

DSH headless has no per-run model flag; its `agent-default-model` settings or a deliberate `--patch` select `{ provider, model, reasoningEffort? }` for new agents. For Ollama-backed use, configure with `ollama launch dsh --model "$ollama_model" --config`, then probe the resulting headless path. Do not claim a dated DeepSeek snapshot from the unversioned native default.

### Kimi Code

```bash
env -u NODE_TLS_REJECT_UNAUTHORIZED \
  kimi -m "$model" -p "$prompt" \
  --output-format stream-json
```

Prompt mode is already non-interactive and rejects `--auto` combined with `-p`. The native current model alias is `kimi-code/k3`; `-m` selects the alias, not an effort flag, so verify configured effort separately.

### Goose

```bash
goose run --no-session --quiet \
  --provider "$provider" --model "$model" \
  --output-format json \
  -t "$prompt"
```

Current `goose run` has no separate bypass flag; do not invent one. Prove actual tool execution, and treat a missing provider as a runtime blocker.

### Pi

```bash
pi --provider "$provider" --model "$model" \
  --no-session --print "$prompt"
```

Pi enables its built-in tools by default. Ensure the `node` its shebang selects satisfies the installed package's engine requirement.

### Poolside

```bash
pool exec --unsafe-auto-allow \
  --directory "$repo" \
  --output json \
  --prompt "$prompt"
```

### OpenHands

```bash
LLM_API_KEY="$key" \
LLM_BASE_URL="$base_url" \
LLM_MODEL="$model" \
openhands --headless --json --always-approve \
  --exit-without-confirmation --override-with-envs \
  -t "$prompt"
```

### Ollama

The raw generation API proves model access only; use an agent CLI when filesystem and shell tools are required:

```bash
curl -sS http://localhost:11434/api/generate \
  -d '{"model":"glm-5.2:cloud","prompt":"Reply OK only.","stream":false,"think":true}'
```

`think:false` disables reasoning; hiding a trace does not. Do not persist reasoning traces.

## Result (Non-Inspect Phases)

```json
{
  "runtime": "exact runtime id",
  "version": "observed version",
  "provider": "provider id",
  "requested_model": "requested id or null",
  "resolved_model": "observed id or unknown",
  "role": "worker",
  "surface": {
    "kind": "skill|command|workflow|recipe|prompt-only",
    "path": "observed path",
    "invocation": "exact invocation",
    "reachable": true
  },
  "capabilities": {
    "read_repo": true,
    "run_commands": true,
    "write_exact_bytes": true,
    "read_back": true,
    "materialize_artifact": true,
    "mcp_list": true,
    "mcp_call": true,
    "structured_output": true
  },
  "permissions": {
    "mode": "observed full-access mode",
    "prompted": false,
    "role_restriction": "worker|read-only"
  },
  "output_shape": "text|json|jsonl|stream-json|mixed",
  "world_state_match": true,
  "final_contract_match": true,
  "exit_status": 0,
  "latency_ms": 0,
  "probe_refs": [],
  "caveats": [],
  "eligible": true
}
```

Any required capability set to false makes the runtime ineligible for that role. `prompt-only` cannot prove a generated skill/workflow claim. Unknown model identity degrades independence claims even when the runtime is operational.

## Verdict

- `ELIGIBLE`: the exact orchestration invocation, generated surface, full-autonomy mode, world state, and output contract passed.
- `PARTIAL`: real tool execution passed, but skill discovery, exact output, liveness, or MCP reachability failed.
- `UNREACHABLE`: the runtime cannot discover or invoke a claimed generated surface.
- `BLOCKED`: authentication, entitlement, missing binary, unsupported account, or a missing real dependency prevents the probe.

Never replace a blocked real runtime with a mock, fixture, fake provider, copied skill body, or direct MCP call and report it as passed.
