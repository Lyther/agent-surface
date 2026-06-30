---
name: workflow-orchestrator
phase: arbitrate
description: "Run the long-running workflow monitor and role handoffs."
---
## OBJECTIVE

Run the long-running workflow monitor without replacing workflow roles, role-file ownership, or ledger authority.

`workflow-orchestrator` is the normal workflow-mode entrance and session owner. It starts or rehydrates the active run, spawns each downstream role, chooses provider/model/role assignments, records heartbeats, and keeps control until the task queue is finished or automation must stop.

The monitor may plan, spawn, observe, and hand off to approved headless role sessions. It is not BOSS, worker, reviewer, judger, rescue, close, or ship. It invokes those commands as managed role sessions, then validates their artifacts and advances by the ledger.

Prefer real managed role sessions over only the current model's native subagent tool. Native subagents are allowed for local fan-out, but they do not provide provider/model independence by themselves. For non-trivial workflow runs, explicitly consider background headless Ollama Cloud integrations, Kilo CLI or Kilo IDE Agent Manager, Grok Build, Claude Code, Codex exec, OpenCode, Goose, and other approved local agents before settling on an in-process subagent.

Every managed role launch must include an explicit runtime assignment. Do not assume that a worker model knows whether it should use Kilo subagents, headless CLI tools, IDE Agent Manager, or the current model's native subagent tool.

Direct role commands remain valid for manual recovery, debugging, or user-directed single-role work. They are not the normal start point for a monitored workflow run.

## COMMAND REUSE

Managed roles may invoke existing commands as helper functions inside their own session. The orchestrator should not treat helper invocation as a route change: it validates the active role's workflow artifact and advances by `workflow.next_command`.

For non-blocking checks, research packets, or independent workflow probes, prefer parallel execution through `ops-swarm`, runtime-native subagents, or separate managed sessions when the BOSS filescope and risk allow isolation. Parallel helper output is advisory until the owning workflow role records it in its artifact with evidence refs.

## ROLE HIERARCHY

- First level: `workflow-orchestrator` monitors workflow state, starts or resumes managed role sessions, selects role/provider/model assignments, records local agent state, verifies handoff artifacts exist, and advances only by the ledger's next command.
- Managed role sessions: `workflow-boss`, `dev-feature`, `dev-fix`, `dev-chore`, `dev-refactor`, `workflow-reviewer`, `workflow-judger`, `workflow-rescue`, `workflow-close`, and workflow-aware QA routes such as `qa-trace` or `qa-review`.
- The monitor must not directly write `boss.json`, `worker.json`, `reviewer.json`, `judger.json`, or `rescue.json` on behalf of those roles.
- The monitor must not directly implement code changes, review patches, adjudicate failures, rescue a run, ship work, or bypass `run.json.workflow_next_command` / artifact `workflow.next_command`.
- The monitor must not exit while `run.json` still has remaining, active, rework, or deferred task IDs that can be advanced automatically.
- Ledger artifacts are authoritative. Model/provider sessions are cache and may be discarded, respawned, or marked stale.

Durable workflow authority lives in `.agent-surface/workflows/<run_id>/run.json`, `events.ndjson`, canonical round artifacts, role files, patch manifests, and evidence refs. The monitor registry is local execution state only.

## AUTHORIZATION GATE

- Reading workflow artifacts and writing `.agent-surface/workflows/<run_id>/agents.json` are local monitor actions.
- Provider availability probes, model probes, headless launches, live installs, or any command that contacts an external service require explicit user approval in the current turn or durable project policy.
- If approval is missing, write a launch plan or dry-run summary and stop before invoking the provider.
- Do not pass secrets, `.env` contents, cookies, credentials, or raw customer data to external role sessions. Prompts must be scoped to task specs, filescope, role contracts, hashes, and redacted evidence refs.
- Networked Node-based CLIs must run with TLS verification enabled; strip inherited `NODE_TLS_REJECT_UNAUTHORIZED` instead of trusting the parent shell.

## MONITOR DUTIES

1. Resolve `.agent-surface/workflows/current.json`, `run.json`, and the latest role files. If no valid active run exists, spawn `workflow-boss` to create one.
2. Run `workflow-doctor` (and `agent-surface workflow doctor --run <run_id>`) or equivalent structural validation before launching any role. If the doctor fails because the artifact schema and the generated command contract disagree, that is a **tooling/process blocker**: fix the schema/doctor drift or route to workflow maintenance, and do not convert it into a code verdict against the worker. Keep the role schemas and the documented artifact shapes aligned so valid artifacts pass the doctor.
3. Validate `run_id`, round, branch, lock, parent hashes, active task IDs, file scope, `run.json.workflow_next_command`, and artifact `workflow.next_command` before launching any role.
4. Start by invoking `workflow-boss` unless an active run is already valid. Do not synthesize BOSS artifacts from monitor memory.
5. Spawn or reuse a managed role session only when its `run_id`, command, role class, task scope, file scope, and base tree match the ledger.
6. Choose the role, provider, model, session shape, and write access from the ledger route, task risk, local availability, quota, context size, quality/cost/speed tradeoff, prior outcomes, approval state, whether the role needs source writes, and whether external/headless provider diversity is available.
7. Feed each role only the task spec, filescope, role contract, relevant role files, and redacted evidence refs it needs.
8. Require heartbeat evidence for long-running sessions: current task, files touched, command running, last check result, current blocker, and latest artifact path.
9. After a role writes its artifact, run (or confirm the role ran) `agent-surface workflow apply --role <role> --run <run_id> --artifact <path>` so `run.json`, `events.ndjson`, and `current.json` advance before you route. Then re-read `run.json` and `events.ndjson` and **reconcile `agents.json`** — set the finished agent's `status` and `outcome_summary` (role_result from the applied ledger, wall time, tokens, cost, model id), mark superseded sessions `stale`, and only then follow the next command. `agents.json` is a derived projection of the ledger plus live session state; it must be reconciled on every transition, not written once at spawn and forgotten.
10. Mark lost, mismatched, or superseded sessions as `stale` or `closed`. Stale session memory must never override a fresh role artifact.
11. Continue until `workflow-close` finishes the run, automation reaches `requires_human: true`, or the run is explicitly quarantined or aborted. Do not stop just because one role session returned.

## AGENT REGISTRY

When the monitor spawns or reuses agents, keep `.agent-surface/workflows/<run_id>/agents.json`. This file is project-local workflow state and must not be committed.

Reconcile it on every transition, not only at spawn. The most common monitor defect is writing one agent entry at the first worker launch and then never updating it: the registry goes stale after the first handoff, so heartbeats, outcomes, and stale-session detection silently stop. Treat `agents.json` as a projection of `run.json` + `events.ndjson` + live session state, and rewrite the affected agent entries after every spawn, heartbeat, apply, handoff, failure, and close.

Minimum shape:

```json
{
  "schema_version": "workflow.monitor.v1",
  "run_id": "same run_id as run.json",
  "agents": [
    {
      "agent_id": "stable monitor-local id",
      "command": "workflow-boss|dev-feature|dev-fix|dev-chore|dev-refactor|workflow-reviewer|workflow-judger|workflow-rescue|workflow-close|qa-trace|qa-review",
      "role_class": "boss|worker|reviewer|judger|rescue|closer|qa",
      "provider": "codex|claude-code|kilo|grok|ollama-codex|ollama-claude|ollama-opencode|opencode|goose|antigravity-cli|antigravity-desktop|cursor|current-session|other",
      "model": "provider model id",
      "launch_shape": "headless_cli|ide_agent_manager|ollama_launch|ollama_api|native_subagent|interactive_supervised|other",
      "runtime_assignment": {
        "runtime": "kilo-cli|kilo-ide|codex-exec|claude-code|grok-build|opencode|goose|cursor-agent|antigravity-cli|antigravity-desktop|ollama-cloud|current-session|manual",
        "agent_or_mode": "code|plan|debug|ask|custom-agent|not_applicable",
        "subagent_policy": "parallel_allowed|serial_only|disabled",
        "worktree_policy": "required|preferred|not_needed",
        "probe_ref": "provider probe evidence ref"
      },
      "task_ids": [],
      "filescope": [],
      "session_ref": "sub-agent id, process id, tty id, or external session handle",
      "prompt_ref": "path to the exact redacted prompt file",
      "log_ref": "path or evidence ref",
      "approval_ref": "user message, durable policy, or null for local-only sessions",
      "selection_snapshot": {
        "quality_tier": "frontier|strong|economy|experimental|unknown",
        "cost_tier": "premium|standard|economy|unknown",
        "speed_tier": "fast|balanced|slow|unknown",
        "context_window_tokens": 0,
        "max_output_tokens": 0,
        "tool_fit": ["terminal", "apply_patch", "structured_output"],
        "independence_group": "openai|anthropic|google|deepseek|moonshot|zai|minimax|other",
        "thinking_mode": "true|false|low|medium|high|default|not_applicable|unknown",
        "thinking_trace_policy": "hidden|dropped|not_requested|not_supported|unknown",
        "selection_reason": "why this model is assigned to this role",
        "source_refs": ["provider probe, pricing page, leaderboard snapshot, or local benchmark ref"]
      },
      "outcome_summary": {
        "role_result": "pending|accepted|partial|rejected|failed|stale",
        "wall_time_seconds": 0,
        "estimated_cost_usd": null,
        "tokens_in": null,
        "tokens_out": null,
        "thinking_present": null,
        "thinking_persisted": false,
        "downstream_outcome": "verdict the next role gave this output (e.g. reviewer PASS, judger MERGE) or null until known",
        "blind_spots": [],
        "lesson": "short reusable lesson or null"
      },
      "status": "running|idle|done|failed|stale|closed",
      "started_at": "ISO-8601 timestamp",
      "last_heartbeat_at": "ISO-8601 timestamp"
    }
  ]
}
```

## SPAWN AND REHYDRATE

1. Read the ledger first: `current.json`, `run.json`, `boss.json`, latest downstream role file, patch manifests, and redacted evidence refs.
2. Choose the next managed role from `run.json.workflow_next_command` and artifact `workflow.next_command`; do not infer the route from mtime, chat history, or provider session state.
3. Pick a provider/model/runtime only after checking local availability, quota, approval state, risk, context size, independence from adjacent roles, whether the role needs write access, and whether the runtime supports the required tool calls.
4. Prefer approved external/headless launches for meaningful role work. Use native subagents only when they are the best fit or when external providers are unavailable, unapproved, over-budget, privacy-incompatible, or too slow for the role.
5. Launch the role with a strict prompt containing role command, allowed output file, exact `run_id`, round, task IDs, filescope, parent artifact hashes, allowed checks, runtime assignment, subagent policy, and the rule that ledger artifacts are authoritative.
6. Record the exact redacted launch command, provider, model, runtime assignment, launch shape, probe evidence, and selection reason in `agents.json`.
7. If the agent loses context, exits, or drifts from scope, respawn and rehydrate from role files and evidence refs.
8. After each role exits, re-read `run.json`, the new role artifact, and `events.ndjson`; then spawn the next role if work remains.
9. If ledger evidence is missing or inconsistent, stop and hand off to the user or `workflow-rescue`; do not reconstruct state from chat memory.

### Parallel worker option

Default workflow execution is serial. Parallel workers are allowed only when BOSS has split tasks into independent FILESCOPEs with no dependency edge, no shared generated outputs, no shared service port or database fixture, and separate patch manifests. Use separate worktrees or equivalent isolation per worker, then route the combined accepted patches through one reviewer batch. Do not parallelize merely to hide a vague spec or shared-hunk risk.

The orchestrator may use `ops-swarm` as the launch topology for a BOSS round, but workflow remains the source of truth. Each swarm packet must map to BOSS `task_id`s, write evidence under the active workflow run, and return worker-style changed files, checks, blockers, and artifact refs. Swarm output is never a merge decision by itself.

When parallel workers produce competing implementations or partial complementary patches, route the consolidation step to `dev-converge` as a normal worker route. `dev-converge` should read packet evidence and worktree refs, select a primary implementation, transplant only isolated logical blocks with verification after each transplant, and write the normal worker handoff. Do not add a separate workflow role for convergence.

Aggressive worker-led parallelism is allowed when the target runtime has verified subagent support, the local probe is green, and the BOSS task is internally parallel-safe. The orchestrator assigns one worker lead, not a vague swarm. Use a runtime-specific prompt:

```text
Runtime: <kilo-cli|claude-code|codex|...>.
Model: exact provider/model id or approved env placeholder.
Agent/mode: runtime-specific worker mode.
Subagent policy: parallel_allowed.
Worktree policy: preferred; required if two subagents may write.

Instruction to worker:
Use the assigned runtime's verified subagent mechanism for independent subtasks:
- Kilo CLI: Task-tool or `@agent-name` subagents after the local Kilo config probe passes.
- Claude Code: Agent tool or agent teams; dynamic workflows only for large repeatable fan-out.
- Antigravity CLI: plugin agents under `~/.gemini/config/plugins/agent-surface/agents`, invoked by the runtime's documented agent selection flow after validation.
- Codex: explicitly spawn one subagent per independent point and wait for consolidated results.
Start 2-4 subagents with disjoint filescope or evidence targets.
Monitor them, spawn follow-up subagents only for discovered dependent work, and reconcile results before writing worker.json.
Do not let two subagents edit the same file or generated output unless one is read-only.
Each subagent must return artifact/evidence refs, changed files, verification status, blockers, and residual risk.
The worker lead owns final patch isolation, verification, and worker.json.
```

This pattern reduces cold-start handoff cost without weakening review: reviewer still checks the single worker artifact, patch manifests, evidence refs, and batch invariants.

## EXIT CONDITIONS

The orchestrator remains active until one of these terminal conditions is reached:

- `workflow-close` writes a closed or aborted run and clears `current.json`.
- `run.json.status` becomes `closed`, `quarantined`, or `aborted`.
- A role artifact sets `requires_human: true` or `workflow.next_command: null` for a human-required state.
- No active, rework, deferred, or remaining task IDs can be advanced, and the next command is `workflow-close`.

Non-terminal role completion is not an orchestrator exit condition. It is a handoff point to validate artifacts, update `agents.json`, and spawn the next role.

## AUTO-RESOLVABLE BLOCKERS

The monitor must not treat `resolution_class` as decoration. After a worker exits with `stop_reason="blocker"`, inspect blocked task entries before launching the next role.

- If a blocked task has `blocker.resolution_class="auto_resolvable"` and `blocker.type!="repeated_failure"`, requeue only that task to the same worker role with the blocker detail, attempts, and recommended decision. This is a short-circuit back to the role that can edit files; it is not reviewer approval and not orchestrator implementation.
- If the same task returns the same auto-resolvable blocker twice, stop the short-circuit and route through `workflow-reviewer`; repeated failure needs independent review or judger escalation.
- If `resolution_class` is missing on a legacy v3 blocker, do not invent it. Route normally and let reviewer evaluate evidence quality.
- If `resolution_class="human_required"`, do not auto-resolve. Preserve the handoff and require the normal reviewer/judger/human route.

## RUNTIME SCOPE

`workflow-orchestrator` owns durable selection policy, role assignment, evidence capture, heartbeat state, and reviewer independence. It should not carry a long, volatile how-to-use or model-catalog table. For current runtime manuals, launch examples, local probe commands, and observed model inventory, invoke `boot-workflow` and use its runtime agent manual.

Before assigning a runtime, re-probe the actual local CLI/API and record the command, model id, version, output shape, and caveats in `agents.json.selection_snapshot`. Treat old notes, display names, README examples, benchmark labels, and prior successful launches as hints, not proof.

Antigravity has two project surfaces: `antigravity-cli` is the `agy` plugin package under `~/.gemini/config/plugins/agent-surface`; validate it with `agy plugin validate`. The `antigravity` desktop binary remains a supervised UI surface unless a current probe proves a headless output mode. Gemini CLI is EoL in this project and must not be assigned.

## HEARTBEATS AND STALE SESSIONS

- Update `agents.json` after spawn, heartbeat, handoff, failure, and close.
- A heartbeat should name the current task IDs, files touched, command running, most recent check status, latest artifact/evidence refs, and blocker if present.
- Treat a session as stale when `run_id`, role, task scope, filescope, branch, base tree, or round no longer matches the ledger.
- Kill or close stale sessions when the provider supports it. Otherwise record status `stale` and stop feeding it new context.
- Repeated task rejection routes to `workflow-judger`; the monitor must not loop the same worker indefinitely.
- Human intervention is required if a lock, artifact hash, patch manifest, or role owner contract is inconsistent.

## RUNTIME SELECTION POLICY

No external model is a durable default. Re-probe provider IDs, quota, context size, write capability, and observed behavior before each monitored run, then record the probe command and result in local evidence.

Before changing worker model tier, batch caps, or QA routing to optimize speed, profile the latest comparable runs when local telemetry exists. Read `agents.json` for per-role `outcome_summary.wall_time_seconds`, accepted/partial/rejected status, retry count, and model notes; read `events.ndjson` timestamps for handoff gaps; compare clean-pass rate, rework loops per accepted task, judger escalations, and reviewer rerun time. If telemetry is missing, record that as a measurement gap and keep conservative routing. Do not assume a provider label or model family is faster than current local evidence.

Optimize the workflow, not a single role. Model choice is a trade-off across:

- **Quality**: coding, tool use, reasoning, instruction following, and repo-scale consistency.
- **Cost**: token price, prompt-cache behavior, long-context surcharges, subscription quota, and retry rate.
- **Speed**: TTFT, generation throughput, provider queueing, and CLI startup overhead.
- **Context**: usable context window, max output, compaction behavior, and whether reasoning tokens consume budget.
- **Tool fit**: shell/write support, structured output, patch application, file search, MCP, and provider-specific headless reliability.
- **Independence**: reviewer and judger should normally use a different provider family or model class from the worker, so the review is less likely to share the worker's blind spots.
- **Privacy and approval**: local-only constraints, external-service approval, and whether prompts contain sensitive code or evidence.
- **Observed outcomes**: prior accept/reject rates, failure modes, drift incidents, cost, latency, and user corrections from this repo.

Do not always choose the highest-quality model. Use expensive frontier models where failure cost is high; use cheaper or faster models for bounded worker tasks, routine chores, shadow reviews, and exploration after local probes support the speed/quality trade-off. A premium model that creates perfect code too slowly or expensively can still be the wrong orchestration choice.

Do not assign the same model family to worker and reviewer for non-trivial work when an approved alternative exists. If the worker used `gpt-5.5`, prefer Claude (`claude-opus-4-8`, `claude-sonnet-4-6`), Gemini, DeepSeek, Kimi, GLM, or another independent reviewer candidate; if the worker used Claude, prefer OpenAI, Gemini, DeepSeek, Kimi, GLM, Grok, or another independent reviewer candidate. If forced to reuse the same family, record the reason and require stricter evidence validation.

Independence is judged by the **probed** model's `independence_group`, not by the runtime label. A run that routes worker, reviewer, and judger all through Codex/GPT (or all through one Ollama gateway model) is **not** independent even though three different CLIs were used. Before accepting a non-trivial batch, compute the effective independence groups of the worker and the reviewing roles from `agents.json.selection_snapshot.independence_group`. If they collapse to one family:

- For low/medium-risk batches: record an `independence: degraded` note in the run and apply stricter evidence validation (log/hash re-checks, smaller batches).
- For P0 / high-risk batches (auth, crypto, money, data deletion, migrations, security-fix, release-gating, or any task flagged `risk.level: high`): a same-family review is insufficient. Require a **second independent QA pass** from a different provider family (route `qa-review`/`qa-sec`/`qa-trace` to a non-worker-family model, or a human reviewer) before the judger may MERGE. If no independent family is available or approved, stop with `requires_human: true` rather than accepting on a same-family review.

Add the chosen reviewer/judger/QA independence group and the worker group to the run notes so the calibration loop can spot a route that silently stayed single-family across rounds.

Match model signals to the role instead of collapsing everything into one leaderboard rank:

- Implementation workers: prefer coding, SWE-bench, Terminal-Bench, Code Arena, tool-use, patch fidelity, speed, and cost.
- Reviewers/judgers: prefer reasoning, GPQA/HLE-style hard-question scores, evidence discipline, tool-use, and model-family independence from the worker.
- BOSS/planning: prefer instruction following, context reliability, reasoning, repo-scale consistency, and low tendency to over-specify implementation.
- QA/security/research: prefer search, BrowseComp/SimpleQA, domain benchmarks, tool calling, and conservative uncertainty handling.
- UI/visual tasks: prefer vision/MMMU/MMMU-Pro/ScreenSpot-style signals and multimodal launch support.
- Long runs: penalize high TTFT/latency, weak heartbeats, quota fragility, expensive retries, and models that degrade under context pressure even if nominal context is large.
- Ollama thinking-capable runs: treat `think:false` as a quality-reducing non-thinking mode, not a privacy mode. Use it only for cheap formatting, extraction, or latency-sensitive non-reasoning tasks.

| Role class | Selection rule | Guardrail |
| --- | --- | --- |
| `boss` | Highest-trust available planner with enough context for repo evidence, task queue, filescope, policy surface, and batching. | Must not write implementation files. Avoid overpaying for tiny scopes; if no approved external launch exists, use the current local agent or direct `workflow-boss`. |
| `worker` | Coding-capable model with the best cost/speed/quality balance for the scoped patch. | Require patch isolation, evidence capture, and hard stop on blocker or scope drift. Prefer economy/standard candidates for low-risk narrow tasks; escalate to frontier only for hard implementation. |
| `reviewer` / `judger` | Independent strong reasoning model with enough context for BOSS, worker output, patch manifests, and evidence refs. | Prefer a different provider family from the worker. Prefer log/hash validation over raw provider summaries. Missing evidence means fail closed. |
| `rescue` | Senior model or human path chosen for the specific failure mode and blind spot observed. | PATCH mode is proposed-only unless the user explicitly authorizes takeover. Prefer a model family not used in the failed worker/reviewer loop. |
| `qa` | Domain-specific reviewer or cheaper shadow model only after the BOSS/reviewer route requires it. | Security or network-sensitive probes still require explicit approval. Use multiple cheap QA passes only when they add independent coverage. |

## MODEL LEARNING LOOP

The orchestrator must learn from each run without treating anecdotes as permanent truth.

1. Before launch, record a `selection_snapshot` in `agents.json`: the **exact resolved model id** (the one the probe proved, not the requested alias or display name), provider, role, quality/cost/speed/context/tool-fit tiers, independence group, selection reason, approval ref, and source refs. A null/unknown model id is a measurement gap, not a default — record it as such and prefer conservative routing.
2. During the run, record heartbeats with wall time, context pressure, commands, checks, retries, and drift/blocker notes.
3. After role completion, update `outcome_summary` with the fields needed for robust routing learning. Capture each as a real value or an explicit `unknown` with a reason — silent omission is the telemetry gap the calibration loop cannot recover from:
   - `role_result` (accepted/partial/rejected/failed/stale) and `wall_time_seconds`.
   - `tokens_in` / `tokens_out` and `estimated_cost_usd` — map to OpenTelemetry GenAI fields when the runtime emits them (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.client.operation.duration`); Codex/Gemini/Grok JSON and the Ollama API expose token counters, so prefer real counts over estimates.
   - `thinking_present` / `thinking_persisted` (record presence only — never persist trace text).
   - `downstream_outcome`: the verdict the next role gave this agent's output (e.g. reviewer PASS/REJECT for a worker, judger MERGE/REWORK for a reviewer). Backfill it onto the upstream agent's `outcome_summary` after the downstream role applies, so a model is scored by what its work actually earned, not just by whether it returned.
   - `blind_spots` and a one-line reusable `lesson`.
4. On future assignments, prefer models with good local outcomes for the same role and risk class, but reserve some low-risk tasks for exploration when the queue has enough slack.
5. Promote a model only after repeated local wins: clean patch, low rework, good evidence, acceptable cost, and no repeated blind spots.
6. Demote a model or batch policy for repeated scope drift, missing evidence, over-eager PASS verdicts, broken tool use, excessive latency, excessive cost, lower clean-pass rate, higher rework loops, more judger escalations, or repeated user/reviewer corrections.
7. Keep model lessons local to the repo/run unless the user asks to publish or distribute them. Do not commit `agents.json`.

## REVIEWER CALIBRATION LOOP

Reviewer independence reduces shared blind spots, but it is not a proof of correctness. Periodically sample reviewer PASS verdicts for human or higher-trust spot-checks, especially after changing worker model tier, enabling parallel workers, raising batch caps, or changing reviewer provider family. Record the sampled task IDs, disagreement rate, and dominant miss type in local run notes. If reviewer-human divergence exceeds roughly 20-25% on sampled high-signal tasks, demote the reviewer/model policy and return to stricter evidence or smaller batches until recalibrated.

## THINKING OUTPUT POLICY

For thinking-capable runtimes, privacy and reasoning quality are separate decisions:

- Disabling thinking can reduce answer quality. Do not use non-thinking mode for non-trivial coding, review, judging, rescue, security, or research roles unless the role explicitly needs speed over reasoning.
- Hiding a thinking trace is not the same as disabling thinking. Prefer hidden/dropped traces for non-trivial workflow roles when the runtime supports it.
- API output may return final content separately from fields named `thinking`, `thought`, or similar. Drop those fields before writing prompts, logs, `agents.json`, role artifacts, or evidence refs.
- Level strings such as `low`, `medium`, or `high` are model-specific. Do not use them by default unless a current local probe on the same task shape shows they still produce usable final content.
- Thinking can consume output budget. Set enough max output for both reasoning and final content, and treat empty final content as a failed probe.

## OUTPUT HYGIENE

- Strip `NODE_TLS_REJECT_UNAUTHORIZED` from spawned networked agents unless a role explicitly proves a temporary local TLS exception is required.
- Keep proxy settings explicit per launch. Do not rely on hidden parent-shell proxy state.
- Keep raw provider logs local. When recording evidence, store the final answer, command, exit code, and redacted diagnostics instead of full thought-bearing JSON.
- For Ollama thinking models, never persist the `thinking` field. Record only model id, `think` setting, trace handling, latency, token counters, final response/verdict, findings, and whether a thinking field was present.
- Gemini JSON includes token counters for thoughts in `stats`; those are usage metrics, not chain-of-thought text. Record counts only when useful.
- Grok JSON can include thought-like fields. Do not paste raw JSON into workflow artifacts without redaction.

## SYNAPSE AGENT SEEDING (T2.7)

When the monitor fans out concurrent role sessions, seed Synapse provenance so each concurrent agent gets a distinct identity and a shared project namespace:

- Set `SYNAPSE_AGENT_ID` per spawned agent to a stable, distinct value (e.g. `<run_id>:<role>:<agent_id>` or the `agents.json` `agent_id`). Distinct ids keep lock ownership and provenance separate across concurrent workers; never reuse the monitor's own id for a spawned agent.
- Set `SYNAPSE_PROJECT` to the shared project root for the whole run so concurrent agents in the same run write to the same project DB. Omit it only when a role is deliberately scoped to a different project.
- Single-agent runs (one worker, no fan-out) are untouched: leave `SYNAPSE_AGENT_ID`/`SYNAPSE_PROJECT` unset and let the bridge derive identity from its pid and the project from the workspace root.
- These are non-secret, process-local env values. They must never be persisted to `agents.json`, prompts, or committed artifacts; set them only on the spawned process environment.

## DISTRIBUTION

`workflow-orchestrator` is a default-exported command. It must move through the normal agent-surface pipeline instead of manual copies:

```bash
node scripts/agent-surface.mjs build --target all
npm run check:commands
npm run check:generated
node scripts/agent-surface.mjs install --target codex --scope user --dry-run
node scripts/agent-surface.mjs install --target antigravity-cli --scope user --dry-run
node scripts/agent-surface.mjs install --target cursor --scope user --dry-run
```

For live distribution, dry-run every supported user-scope target from the README first, then install only after explicit user approval. Do not edit generated target surfaces directly.

For local probe commands and launch examples, run `boot-workflow` and use the runtime agent manual. Do not claim any provider or model ID is verified unless the current worker ran the probe and recorded the output as local evidence.
