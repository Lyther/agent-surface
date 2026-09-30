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

## OBJECTIVE

Qualify a complete coding runtime, not a model name or a successful chat response, for one bounded workflow role.

IRON LAW: NO RUNTIME ASSIGNMENT WITHOUT A TASK-SHAPED MATERIALIZATION PROBE.

A runtime is the resolved binary, version, provider, model, command or skill loader, tool protocol, working-directory behavior, filesystem reach, permission mode, output format, and authentication state. Every layer must be reachable through the exact invocation that orchestration will use.

## INPUT

```text
workflow-runtime
  --phase inspect|discovery|materialization|mcp|full
  --role boss|worker|reviewer|qa|judger|rescue
  --runtime <exact-candidate>
  --filescope <path...>
  --artifact <required-output-path>
  --time-budget <duration>
```

This is an auto-invocable Agent Skill on native skill hosts. Command-only hosts receive only the small manual-command set, so runtime qualification must prove the skill carrier that the selected host actually discovers. Explicit invocation is allowed when the probe is specifically testing invocation syntax.

`inspect` is the no-execution mode defined by the first phase gate. Use it when the caller asks to inspect, explain, or prove that this skill loaded without running a runtime probe.

For every other phase, `--role`, an exact `--runtime`, and `--time-budget` are required. `materialization` and `full` also require `--filescope` and `--artifact`. Reject missing inputs instead of guessing `auto`, selecting the current host, or broadening the phase. Invocation arguments constrain this skill: an explicit `inspect`, `reference-only`, `do not execute`, or `do not call tools` request always wins over the full-probe objective.

## EXECUTION POSTURE

This distribution uses full execution consent. Do not stop for routine per-operation approval when the selected host has a full-access, bypass, YOLO, auto-approve, or equivalent mode. Select that mode explicitly and record the observed mode.

Execution consent and role capability are different:

- a worker receives the host's unrestricted edit and shell capability;
- a reviewer, researcher, analyzer, adversary, or boss remains read-only because that is its assigned role, not because the host should prompt;
- a role boundary is enforced by the rendered agent/tool profile and filescope, not by repeated human approval dialogs.

Use only the credential required by the selected provider when the caller has authorized a provider-backed probe. Import that one named variable from a git-ignored `.env` without printing it; never use `cat`, `head`, `tail`, `sed`, `rg`, or another content-display command on the whole file. Never persist, log, or echo secret values.

Remove inherited `NODE_TLS_REJECT_UNAUTHORIZED` from networked Node launches so the probe tests the runtime's normal TLS path. Do not mistake a proxy, wrapper, stale symlink, IDE login, or cached daemon for the binary and account that the headless command actually uses.

## DRIVER AND RECURSION GATE

The runtime executing this skill is the driver. The runtime named by `--runtime` is the candidate.

A driver-owned native subagent or agent-manager tool is not an external CLI candidate. Qualify it through its native tool call, resolved model, isolated session/worktree behavior, and materialized artifact. This is the preferred path when those controls are sufficient. Do not shell-launch the driver's own executable.

Before calling an external CLI candidate:

1. Resolve the driver family and candidate family.
2. If they are the same CLI family or resolve to the same executable, stop with `BLOCKED: external_driver_required`.
3. Name a different installed runtime or a parent process as the unblock path.

Never launch a runtime from inside its own active headless session, daemon, extension host, or workflow. Self-launch can recurse, reuse session state, collide on a hub port, inherit daemon-only environment, or grade the driver instead of the candidate. A self-probe transcript is invalid even when the nested command exits zero.

## DISCOVERY GATE

Before a materialization probe:

1. Resolve the executable with `command -v`, resolve symlinks, and record `--version`.
2. Read the live subcommand help. Flags from another runtime or an older release are invalid evidence.
3. Verify authentication through the same CLI/provider path.
4. Verify the generated command, skill, workflow, recipe, agent, and MCP config at the path the runtime actually scans.
5. Invoke the generated surface through its native mechanism when one exists.

Discovery mappings:

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

If a runtime can use the raw prompt but cannot discover or invoke its generated surface, mark the skill/workflow capability `UNREACHABLE`. Do not silently fall back to pasting the skill body and call the distribution successful.

## MATERIALIZATION PROBE

Use a fresh scratch directory. Require the runtime to:

1. read one exact input file;
2. create one exact output file through its real tool path;
3. preserve specified bytes, including the trailing newline;
4. read the output back;
5. run one harmless command that reports real state;
6. return an exact final token;
7. exit cleanly.

Check the file independently with byte count and hex output. A tool transcript, `exit 0`, or `PROBE_OK` is insufficient when the file is missing, written in another working directory, or contains different bytes. Extra final prose is an output-contract failure even when world state is correct.

For MCP qualification, require `tools/list` plus one harmless real tool call through the runtime. A config file, generated schema, connected badge, or direct server test alone does not prove host reachability.

## FULL-AUTONOMY STARTING POINTS

These commands are version-sensitive starting points. Re-read live help before use.

### Codex

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -C "$repo" --ephemeral --json \
  -o "$out" -m "$model" \
  -c "model_reasoning_effort=\"$effort\"" \
  '$workflow-runtime --role worker ...'
```

Codex custom prompts are not the distribution mechanism. The compiler emits auto-invocable canonical skills, and current Codex can also resolve an explicit `$name` during qualification. Prefer `--output-schema` for role artifacts.

### Claude Code

```bash
claude -p "$prompt" \
  --model "$model" \
  --dangerously-skip-permissions \
  --output-format stream-json
```

Verify `claude auth status` first. An IDE subscription session does not prove CLI authentication.

### Cline

Resolve and version the exact binary before constructing a command. Current Cline releases have incompatible headless surfaces: recent Node CLI builds expose `--cwd`, `--provider`, `--model`, `--thinking`, `--auto-approve`, and `--json`; legacy Core CLI builds use `--oneshot`, `--yolo`, `--output-format`, and settings-owned model selection. This machine exposed both families during the 2026-09-03 probe, so no unversioned Cline command is a valid standing recipe.

Use `ollama launch cline --model "$ollama_model" --config` when configuring the Ollama integration, then re-read the resolved `cline --help` and run a task-shaped probe. Only the Cline CLI and Cline's SDK-based extension read the shared `~/.cline` MCP settings file; the pre-SDK extension most installs run reads its IDE's `globalStorage` file. A plain prompt without a skill-selection event proves the agent, not skill discovery.

### Kilo and OpenCode

```bash
kilo run --auto --dir "$repo" --model "$provider_model" --variant "$effort" --agent code --format json "$prompt"
opencode run --auto --dir "$repo" --model "$provider_model" --variant "$effort" --agent build --format json "$prompt"
```

Before either launch, inspect the effective runtime config and require `share` to be exactly `disabled`. An inherited `auto` setting publishes every new session even when the command omits `--share`. If a probe creates a share, stop, revoke it through the runtime's unshare operation, and exclude that transcript from evidence. Never print or retain a share secret or URL in the report.

Require the live runtime to list or resolve the generated skill through its native skill tool. Provider credentials and model aliases are runtime-specific; an extension login does not prove the headless CLI, and a raw Ollama `:cloud` ID must not be assumed to equal the runtime's `provider/model` selector.

### Grok Build

```bash
grok --cwd "$repo" \
  --permission-mode bypassPermissions \
  -p "$prompt" -m "$model" \
  --reasoning-effort "$effort" \
  --output-format json --max-turns "$max_turns"
```

Confirm entitlement and resolved model. Remove thought-like fields before retaining output.

### Antigravity CLI

```bash
agy --dangerously-skip-permissions \
  --add-dir "$repo" \
  --print "$prompt"
```

The CLI may execute from its own scratch project. An explicit absolute materialization path is required to prove reachability to the requested workspace.

### Factory Droid

```bash
droid exec --skip-permissions-unsafe \
  --cwd "$repo" \
  --output-format stream-json \
  "$prompt"
```

Do not substitute `--auto high`: the unsafe bypass is the CLI's actual no-check mode.

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

Do not rely on the bare `agent` command. Multiple products claim that name; resolve `cursor-agent` or the editor's `cursor agent` subcommand and record the real executable.

### DSH

```bash
dsh --profile headless "$prompt"
```

DSH headless has no per-run model flag. Its `agent-default-model` settings or a deliberate `--patch` select `{ provider, model, reasoningEffort? }` for new agents. For Ollama-backed use, configure the integration with `ollama launch dsh --model "$ollama_model" --config`, then probe the resulting headless path. Do not claim a dated DeepSeek snapshot from the unversioned native default.

### Kimi Code

```bash
env -u NODE_TLS_REJECT_UNAUTHORIZED \
  kimi -m "$model" -p "$prompt" \
  --output-format stream-json
```

Kimi prompt mode is already non-interactive and rejects `--auto` combined with `-p`. The native current model alias is `kimi-code/k3`; verify configured effort separately because `-m` selects the alias, not an effort flag.

### Goose

```bash
goose run --no-session --quiet \
  --provider "$provider" --model "$model" \
  --output-format json \
  -t "$prompt"
```

Current `goose run` has no separate bypass flag. Do not invent one. Prove actual tool execution, and treat a missing provider as a runtime blocker.

### Pi

```bash
pi --provider "$provider" --model "$model" \
  --no-session --print "$prompt"
```

Pi enables its built-in tools by default. Ensure the `node` selected by its shebang satisfies the installed package's engine requirement.

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

Use an agent CLI when filesystem and shell tools are required. The raw generation API proves model access only:

```bash
curl -sS http://localhost:11434/api/generate \
  -d '{"model":"glm-5.2:cloud","prompt":"Reply OK only.","stream":false,"think":true}'
```

`think:false` disables reasoning; hiding a trace does not. Do not persist reasoning traces.

## REQUIRED RESULT FOR NON-INSPECT PHASES

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

## VERDICT

- `ELIGIBLE`: the exact orchestration invocation, generated surface, full-autonomy mode, world state, and output contract passed.
- `PARTIAL`: real tool execution passed, but skill discovery, exact output, liveness, or MCP reachability failed.
- `UNREACHABLE`: the runtime cannot discover or invoke a claimed generated surface.
- `BLOCKED`: authentication, entitlement, missing binary, unsupported account, or missing real dependency prevents the probe.

Do not replace a blocked real runtime with a mock, fixture, fake provider, copied skill body, or direct MCP call and report it as passed.

## ANTI-PATTERNS

- Do not grade a runtime from `Reply OK only`.
- Do not equate an IDE login with headless CLI authentication.
- Do not equate generated files with host discovery.
- Do not equate a connected MCP badge with a real tool call.
- Do not trust a final narration over independently inspected world state.
- Do not count a command fallback as proof that a runtime discovered its native Agent Skill.
- Do not give a read-only role write tools merely because host execution consent is full.
- Do not launch the candidate from the same runtime family that is executing this skill.
- Do not read or print an entire credential file to discover one provider key.
- Do not assign long unattended work until progress, cancellation, timeout, and artifact liveness are proven.
