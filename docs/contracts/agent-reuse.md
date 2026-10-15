# Agent-Reuse Trial Contract

Status: PREPARATION ACCEPTED FOR SUPERVISED COMPARISON, 2026-10-13; [one supervised MCP route qualified](../runbooks/pentestagent.md), wider claims pending. Scope: agent-surface's preparation and native boundary for MOMO Phase AR. Sources: [concept](../context/concept-zero.md#agent-reuse-capability-amendment), [research](../context/concept-zero-research.md#agent-reuse-native-spike-2026-10-13), [architecture](../architecture.md#agent-reuse-capability-trial), [roadmap](../roadmap.md#phase-as-ar-agent-reuse-capability-trial). MOMO's counterpart is its `docs/api/agent-reuse.md`; no MOMO file or public interface is changed here.

## Applicability

- **Domain/data: REQUIRED, reuse existing owners.** Existing registry/config ownership, upstream transient tasks/workspace files and MOMO Task/Evidence/result mapping. New database, schema migration and delegated-task entity: **NOT_APPLICABLE**.
- **Interface: REQUIRED.** Native stdio MCP, upstream provider client and returned artifacts cross boundaries. The pinned upstream tool schemas are canonical; no duplicate protocol schema, proxy or HTTP API is added. One provider/native route and supervised environment stop are observed; graceful cancellation and broader compatibility remain unqualified.

## Data and State

| State | Owner / identity | Boundary and lifecycle |
|---|---|---|
| Selected application | Upstream name + full revision, plus any repair commit and actual dependency environment | `GH05TCREW/PentestAgent` is not `0xSteph/Pentest-AI`. Package 0.2.0 and advertised MCP server `pentest-mcp` 1.0.0 are different version fields. |
| MCP configuration | Native project profile initially; existing agent-surface named config ownership only if later registered | No global default, target/model migration or category expansion. Removal disconnects configuration; it is not proof that existing work stopped. |
| Delegated task | Upstream process instance + its returned `task_id` | Process-local `pending`, `running`, `done`, `error`, `cancelled`; not a MOMO Task or durable resume handle. One active task per pilot process. |
| Notes, reports, artifacts, usage file | Upstream working directory and its active workspace | Use a fresh dedicated root/process per independent run. Do not switch the active workspace while a task runs. Retain required outputs before disposal; a path in returned text is not proof the file exists or is accessible. |
| Enclosing answer and Evidence | Existing MOMO Task, enclosing native turn and Evidence/artifact path | Delegate name/revision and result are attributed to that invocation. Do not reconstruct inner tool actions as MOMO Steps or auto-promote a foreign success to a final Finding. |
| Credentials | Existing operator secret source, selected trial process environment | No values in registry, committed host config, logs or handoff. Any temporary delivery file is private and removed after use. Do not copy unrelated HOME/SSH/provider credentials into the trial. |

There is no restart recovery promise: if the MCP process dies, retain accessible partial files, record interruption and stop. Do not automatically replay a task whose submission may have succeeded. Unknown remote/provider continuation after disconnection remains unknown until checked.

## Launch and Provider Binding

The source-backed command shape is:

```text
<absolute-installed-pentestagent> mcp_server --type stdio --model openai/<provider-model-id> --no-rag --no-mcp --target <authorized-lab-target> --scope <authorized-scope>
```

This is a design template, not an executed install or a registry-ready command. Resolve concrete paths/arguments at the trial boundary. Use an existing native host configuration that actually supplies the dedicated CWD, or an existing deployment working-directory facility; MCP stdio itself does not transmit a universal CWD setting. No shell expansion is assumed. The repository's shared service schema currently carries only literal `type`, `command`, `args`; it does not dynamically bind a per-task workspace.

GH05TCREW's [`LLM`](https://github.com/GH05TCREW/pentestagent/blob/87d763a9c830597e9b8c1d56293300f6961beec2/pentestagent/llm/llm.py) applies a custom base to `openai/<provider-model-id>`. In the child's environment, set the selected `OPENAI_API_BASE` (or `OPENAI_BASE_URL`, lower precedence) and the key expected by that endpoint. For the already configured direct Ollama Cloud route, the public documented base is `https://ollama.com/v1`; its existing Ollama credential must reach the OpenAI-compatible client under the appropriate key variable. Do not pass MOMO's `ollama-cloud/` selector as though it were a LiteLLM provider, invent a `:cloud` suffix, replace the parent's OpenAI settings, or inherit a conflicting ambient base/key accidentally. Verify the actual model identifier and tool-call/result replay on the approved route. The local authenticated Ollama-daemon route is a separate option, not an automatic fallback.

Set and record `PENTESTAGENT_AGENT_MAX_ITERATIONS` for the small probe; its default is 30 and it is not a time or cost ceiling. Record the actual wall-clock stop mechanism, provider limits and available usage. The first trial does not turn on RAG, extra MCP connections, crew mode or optional heavy dependencies. Installing an application/virtualenv does not sandbox its shell; use the approved disposable execution environment and its existing lifecycle controls.

## Native Interface

Canonical definitions: upstream [`mcp_tools.py`](https://github.com/GH05TCREW/pentestagent/blob/87d763a9c830597e9b8c1d56293300f6961beec2/pentestagent/mcp/server/mcp_tools.py) and [`mcp_core.py`](https://github.com/GH05TCREW/pentestagent/blob/87d763a9c830597e9b8c1d56293300f6961beec2/pentestagent/mcp/server/mcp_core.py). This table is a use contract, not a new wire representation.

| Operation | Source behavior | Trial obligation |
|---|---|---|
| `initialize`, `tools/list` | Advertises protocol `2024-11-05`; tools use input schemas but many errors are returned as ordinary text | Establish compatibility with the selected maintained native client. Discovery is not provider/task proof. |
| `run_task_async(task, target?, scope?)` | Creates runtime before acknowledgement, allocates a process-local task handle, starts the loop; no idempotency key | Submit once with explicit supplied scope/objective. Do not retry blindly after an ambiguous transport failure. No concurrent tasks in the pilot. |
| `get_task_status(task_id)` | Text status and limited result preview | Poll in the same server session; `done` only describes loop termination. Missing handle is an error, not completion. |
| `get_task_result(task_id)` | Text summary, call records, notes; successful tool-result excerpts limited to 200 characters | Inspect actual output/errors and collect workspace artifacts separately. No assumed standalone CLI report export or complete transcript. |
| `cancel_task(task_id)` | Immediately marks task cancelled; loop observes it at a later yield; does not cancel the saved work or stop its runtime | Treat as cancellation requested, not stopped. Verify the real process/provider boundary as below. |
| `run_task`, `await_tasks` | Handler blocks the ordinary stdio reader until it returns; wait timeout does not cancel work | Do not use for the cancellable pilot. Use asynchronous submission and short polls, not a second control transport. |

Task results are untrusted upstream text, not MOMO storage rows or authoritative verdicts. A provider exception may be rendered as `LLM Error` and still produce `done`; iteration exhaustion can also yield partial results under `done`. The parent must distinguish actual task outcome from these terminal labels. No brittle success-regex adapter is introduced; observed false-success behavior should be repaired upstream or handled by the existing enclosing result review.

Record the exact loop and prompt used. MCP mode uses `run_mcp`/`pa_mcp` and excludes `finish`; it does not import the standalone planning/completion discipline. If the useful strategy belongs to CLI/playbook mode, invoke that through the native harness's existing command tools instead. Keep the same selected mode in upstream-alone and MOMO-integrated comparisons.

Target/scope arguments can be changed through upstream calls and are used in the prompt; they are not a network authorization filter. Authorization comes from the supplied task and the operator's actual execution boundary. The pilot neither creates a new approval loop nor claims that prompt instructions enforce containment.

## Stop and Failure Contract

The acceptance question is what remains active after cancellation, not whether the tool returned text. Observe three cases: explicit `cancel_task` during a real outstanding operation; command timeout; parent interruption/connection loss. Include child processes and target requests, and distinguish requests already submitted to the model provider from new work. Set the observation deadline and effective environment stop method before starting; disclose any residual provider-side uncertainty or charge.

At the reviewed pin, `_drive_task` does not stop its runtime, and `LocalRuntime.execute_command` removes timed-out/cancelled subprocesses from tracking without terminating them. A returned cancellation or timeout must therefore not satisfy acceptance by itself. For this supervised disposable comparison, an observed environment-level stop is sufficient to establish an effective local stop; it does not prove `cancel_task`, graceful cleanup, MOMO interruption propagation or cancellation of already submitted provider work. Do not postpone the bounded capability comparison solely for a graceful-cancellation repair. If an effective stop cannot be demonstrated, repair the smallest real cleanup boundary or compare the next candidate before running the trial. No unattended adoption without its own operating and stopping proof.

Connection closure loses process-local handles; reconnection does not imply resumption. Unknown submission outcome means inspect the surviving instance or retain an interrupted outcome, not resend. No automatic alternate-provider/model retry. Existing internal rate-limit retries must be included in the resource allowance. Provider failure, partial completion, cancellation and inaccessible artifacts stay visible in the parent result.

## Result, Artifact and Usage Mapping

- **Text/report:** return it to the invoking parent and retain upstream attribution through MOMO's existing Evidence path. Exact challenge answers remain exact; do not prefix attribution into answer bytes.
- **Files:** verify actual content and parent access from the dedicated workspace, then use existing artifact retention under the enclosing turn. Do not expose MOMO's internal evidence root or import every upstream file blindly. Raw tool evidence may contain task credentials and stays in the established private evidence boundary.
- **Outcome:** app-native solved flags are the benchmark oracle. Schema validity, a `final` status, model assessment and independently reproduced exploit evidence are separate claims; record which MOMO actually established. Delegate claims do not become independently verified Findings merely through ingestion or finalization.
- **Usage:** retain whatever the provider/upstream actually reports, with scope. Upstream token persistence is best-effort and workspace-wide; it is not a guaranteed per-task bill. Fresh roots improve attribution but do not prove complete accounting. Unknown is not zero, and counts from the parent exclude the delegate unless explicitly shown otherwise.

## Matched Comparison

MOMO owns execution and its existing scorer; this contract adds no benchmark engine or data schema. First exercise one actual MOMO Task through invocation, substantive result retrieval and Evidence/artifact retention, including the trial controller's effective cleanup. The accepted external spike is preparation evidence, not that MOMO journey. Record the actual MOMO parent runtime/version and selected upstream loop; the initial comparison uses pinned `run_mcp` / `pa_mcp`.

| Arm | Delegate A | Methodology B |
|---|---|---|
| Baseline | Absent | Absent |
| A | Available through the qualified project-local route | Absent |
| B | Absent | `web-api-followthrough`, project-local |
| A+B | Same configuration as A | Same asset as B |

Start baseline versus A; add B and A+B independently. Every parent keeps its normal task-authorized native tools. Use equivalent target-facing tool versions, model/runtime settings, scope, access and resource controls across arms; vary only the delegate and selected methodology. Do not transplant the smoke parent's MCP/read/sleep permissions, 12-step limit or file-task prompt. Delegate settings and any intrinsic tool differences stay explicit and fixed between A and A+B. A later CLI/playbook strategy is a separately qualified variant, not an unnoticed replacement.

Reset target state and use fresh run workspaces without prior answers, notes or skill carry-over. Keep scorer-only solutions out of agent input. Record whether A was actually invoked and B actually loaded/used; availability or discovery alone is not behavioral contribution. Native-harness-alone and upstream-alone remain optional diagnostic comparators.

Predeclare the same total resource allowance, including delegated work, and name which limits the existing controller/provider actually enforces. Parent-only token or step limits do not bound the combined run. Incomplete usage must be reported; it prevents a matched-token or cost-efficiency claim, not a supervised comparison under another enforceable common allowance. No new accounting service is required. Retain unsuccessful/partial runs and report scorer-confirmed solves, marginal coverage/overlap, elapsed time and available usage separately from model assessments or independently reproduced Findings. Repeat promising configurations before claiming dependable improvement.

## Admission, Checks and Handoff

The first deliverable is the qualified native configuration and runbook, not necessarily a service entry. A later `pentestagent` entry can reuse `optional-services.json`, detection-only prerequisites and existing credential delivery only if they express the proven setup. No automatic recipe, category membership or default enablement; `pentest-ai` remains untouched. Broad native-host support requires its own evidence and is not inherited from one successful pair.

Checks are task-shaped: real provider tool round trip; native submission/execution/retrieval and actual artifact; timeout/cancellation/parent interruption; error/partial-result handling; then generated-launch and unchanged-profile proof if registration is added. No test substitutes qualify these boundaries. Documentation/link/schema checks qualify only this design and later configuration shape.

Handoff includes source plus any repair, dependency/runtime identities, exact non-secret setup and launch, model/endpoint identity, task/scope, artifact locations, observed lifecycle behavior, usage scope and unrun limits. The [runbook](../runbooks/pentestagent.md) identifies the canonical private development-host bundle; one preparation owner maintains it. Transfer only selected setup/assets/evidence, never the project `.env` or unrelated HOME files. A duplicate deployment is a separate corroboration record, not a substitute bundle or a reason to repeat the spike. MOMO then runs its existing catalog/Evidence integration and matched comparison. Capability improvement, unattended readiness and wider distribution remain unproven until their respective real runs.
