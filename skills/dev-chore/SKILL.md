---
name: dev-chore
description: "Maintain development quality by correcting local design, reuse, complexity, risk, and UX drift before it compounds."
---

## Objective

Keep development quality improving while problems are still cheap to correct. Find and correct bounded problems: duplicate ownership, hand-rolled replacements for existing capabilities, patching around a disproven design, speculative abstraction, disproportionate security machinery, incomplete user journeys, configuration drift, dependency hygiene, and dead code. Do not make a wrong design cleaner: re-check the outcome, reuse what already works, make the smallest justified correction, prove it, then continue development.

A `dev-chore` PASS means the inspected increment meets these gates; it is not independent review, QA, E2E, readiness, or release approval.

## Modes

- Routed worker: BOSS selected route `chore` for an explicit, bounded quality-maintenance task. `dev-chore` owns the worker artifact and may change files inside the assigned AC and FILESCOPE.
- Embedded checkpoint: `dev-feature`, `dev-fix`, or `dev-refactor` calls `dev-chore` during its own task. Inspect the current delta and return findings and decisions; the caller keeps code, patch, evidence, and worker-artifact ownership, so never create or apply a `dev-chore` worker artifact or advance the ledger.
- Direct: invoked without an active workflow. Inspect the named task or current delta, make only bounded corrections that preserve the accepted product contract, report changed files and checks, and do not auto-commit.

## Triggers

Run the loop at the start of a meaningful increment and whenever one of these appears; stop once that signal's risk is resolved:

- A new helper, type, abstraction, adapter, layer, dependency, service, configuration flag, state store, or framework is about to be added.
- A cap, limit, timeout, guard, refusal, allowlist, or validation rule is about to be added.
- The same rule, validation, mapping, retry, state, query, UI pattern, or integration is being implemented a second time.
- A design premise was disproven, a workaround is growing, or two focused correction attempts failed.
- The diff grows faster than the user outcome, or support infrastructure outgrows the requested behavior.
- A security control adds a service, policy layer, approval path, or major usability cost.
- A user-visible path exists in code but has not run through its real entry point, including failure and recovery.
- Maintenance exposes stale generated output, dependency risk, dead code, inconsistent configuration, or a broken developer workflow.

## Scope

`dev-chore` may replace a duplicate with an existing implementation whose semantics match; remove speculative indirection, unused configuration, dead paths, and unnecessary local machinery; pivot implementation strategy inside an accepted behavior contract; correct local UX the AC already implies (missing feedback, recovery, empty/error state, actionable CLI output, broken focus flow); and do bounded dependency, configuration, formatting, generated-metadata, and repository-health maintenance.

Route instead:

- New product behavior or a contract change: `dev-feature` or `workflow-boss`.
- A proven runtime or security defect needing regression proof: `dev-fix`.
- A broad behavior-preserving structural transformation: `dev-refactor`.
- An unproven root cause, dataflow, race, or trust boundary: `qa-trace`.
- A requested independent whole-diff or repository review: `qa-review`.
- Product intent, architecture ownership, or a security-versus-feature decision that authoritative evidence cannot settle: `workflow-boss` or a human decision.

Never grow a local correction into an opportunistic repository rewrite; report important out-of-scope findings for the user to schedule.

## Quality Loop

### Gate 1: Outcome and Direction

1. State the user or developer outcome in one sentence and the planned item it advances. If the slice already works and the increment neither advances a planned item nor fixes an observed defect, stop and propose the next planned item.
2. Name the implementation premise that should produce that outcome, and check it against the task AC, repository contracts, current code, and the latest real execution evidence.
3. If the premise is false, stop extending it and choose one result:
   - `CORRECTED`: a bounded repair preserves the current design and AC.
   - `PIVOTED`: a new local implementation strategy preserves the AC.
   - `ROUTE_REQUIRED`: product, contract, filescope, or architecture must change.
   - `BLOCKED`: required evidence, dependency, environment, credential, human-only action, or target selector is unavailable.

Passing tests do not rescue a design that cannot deliver the outcome; repeated patches around the same false premise call for a pivot, not another layer.

### Gate 2: Reuse Before Construction

Before adding a construct, search the repository for its concept, behavior, symbols, routes, schemas, errors, configuration keys, and tests (not only the proposed name), then the standard library, framework primitives, and installed dependencies. Compare semantics, failure behavior, lifecycle, ownership, and operational cost; do not force reuse when behavior differs. Add something new only after recording the concrete gap in existing options; a new dependency also gets the maintenance, license, advisory, install-script/native-code, transitive-footprint, compatibility, lockfile, and rollback review. Renamed, wrapped, relocated, or generated copies of logic are still the same implementation.

### Gate 3: Single Ownership

Trace each changed invariant to one authoritative owner. Correct parallel implementations of one business rule, validation, authorization decision, state transition, data shape, retry policy, or formatting rule; multiple sources of truth joined by synchronization code; a generic helper that overlaps a domain helper without replacing or delegating to it; copy-pasted UI, API, query, or error paths that will drift; and compatibility wrappers with no current consumer or removal condition. Prefer deleting or consolidating the new duplicate; deduplicate broadly only when the current task needs it and it is inside FILESCOPE.

### Gate 4: Proportional Design

Every new layer, abstraction, dependency, configuration option, background job, cache, queue, state store, policy mechanism, cap, limit, guard, refusal, or validation rule needs one present-tense justification, stated where it is defined: a current AC requires it; an observed failure cannot be solved safely at the existing boundary; measured scale, reliability, or performance evidence requires it; or it centralizes an invariant that is already duplicated. Future flexibility, possible reuse, architectural fashion, a hypothetical input, or configurability of a value with one valid setting do not count. When the right correction removes behavior, remove it; a flag, fallback, or guard around code that should go is not a correction. Compare the plausible options (existing capability, small local change, new abstraction) and choose the one that meets the outcome and non-negotiable constraints with the fewest new concepts and operational obligations.

### Gate 5: Security Versus Feature

1. Never weaken non-negotiable trust boundaries to ship a feature: authentication, authorization, secret handling, cryptography, payments, destructive data mutation, customer data, and explicit project policy.
2. For other security work, name the concrete asset, actor, boundary, failure mode, impact, likelihood/exposure evidence, and smallest effective mitigation; not every imagined threat justifies a new subsystem.
3. Enforce at the existing trust boundary rather than through broad policy engines, approval ceremonies, duplicated validation, or new services.
4. Exercise the feature with the control enabled. A control that silently makes the required outcome unusable is not a successful implementation: correct the UX or surface the real product/security decision.
5. Claim no security benefit from a control without an enforced path and relevant proof.

When a required safeguard and the requested feature genuinely conflict, quietly remove neither; route the explicit trade-off with evidence and a recommended decision.

### Gate 6: User and Operator Outcome

UX and operability are functional quality, not polish. Exercise the changed path through its real entry point against the accepted requirements, including the failures it can actually hit:

- UI: goal completion, the loading, empty, and error states the journey reaches, keyboard/focus behavior, accessibility, and no dead ends.
- CLI/API: discoverable inputs, stable contracts, actionable errors, correct exit/status behavior, promised machine-readable output, and no false success.
- Service/operations: startup, configuration failure, and the logs needed to diagnose the changed path.

Report other gaps instead of making them acceptance conditions. A returning function, rendering component, or correct-looking mocked transcript is not user-complete; real acceptance claims belong to the verify commands and require real dependencies.

### Gate 7: Small Increments

Make one bounded correction at a time, run the cheapest meaningful check after each, and re-run the affected real entry-point scenario when practical. Stop and route when the correction needs a wider contract, filescope, or architecture than the task owns. Leave the code easier to understand and modify than before, without unrelated polish.

## Helpers

Helper output is evidence, not a different ownership or completion model.

- `boot-context`: stale or missing repository context.
- `ops-deps`: dependency capability, risk, maintenance, license, advisory, and lockfile review.
- `ops-doctor`: repository and tooling health.
- `qa-trace`: verify a suspected wrong premise, root cause, ownership path, race, or trust boundary before changing it.
- `lint-python`, `lint-rust`, `lint-go`, `lint-typescript`, `lint-shell`, `lint-kernel`: touched-file checks.
- `dev-spec`, `verify-test`, `verify-coverage`, `verify-edge`, `verify-performance`, `verify-prove`: specification and proof for the accepted behavior and real user path.
- `qa-review`: independent broad review after implementation, never a substitute for this in-development loop.
- `ops-swarm`: parallel read-only discovery when scopes are independent and synthesis stays with the current owner.

## Workflow Mode

Routed worker mode is ON only when `.agent-surface/workflows/<run_id>/run.json` is active, BOSS uses `schema_version: workflow.v3`, `boss.workflow.route = "chore"`, and `run.json.workflow_next_command = "dev-chore"`.

1. Validate `run.json`, `boss.json`, branch, baseline, round, parent hashes, active task IDs, AC, FILESCOPE, and the latest reviewer/judger/rescue handoff.
2. Start from `boss.context_capsule`; inspect deltas unless evidence is missing, stale, contradictory, or changed.
3. For each active task, apply the gates its scope and risk call for before editing, and record the decisions that matter once, in `summary` and `decisions`.
4. Keep autofix and generated-output refreshes inside FILESCOPE; repo-wide mutation needs BOSS scope and a recorded reason.
5. When `task.patch_required=true`, wrap the task with `agent-surface workflow patch begin/end/verify`; otherwise record ordinary diff evidence and mark it ineligible for partial merge.
6. Run task verify commands through `agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>`.
7. A corrected or pivoted task is `PASS` only when its AC and verify gates pass; a checkpoint that finds no required edit may also be `PASS`, with the inspected delta and decisions recorded.
8. Apply Blocker Discipline before marking a task blocked, and never skip ahead after a blocker.
9. Write the canonical `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and the latest copy `.agent-surface/workflows/<run_id>/worker.json` in the normal `workflow.worker.schema.json` shape.
10. Set `workflow.owner = "dev-chore"` and `workflow.next_command = "workflow-reviewer"`, then run `agent-surface workflow apply --role dev-chore --run <run_id> --artifact .agent-surface/workflows/<run_id>/worker.json`. Never hand-edit `run.json`.

Edit only the worker artifact, assigned files, and per-task patch and evidence files; the role's event comes from `workflow apply`. A completed task makes its quality decisions inspectable:

```json
{
  "task_id": "T1",
  "status": "PASS",
  "patch_required": true,
  "summary": "PIVOTED: reused the existing session boundary and removed a parallel token cache",
  "files_changed": ["src/session.ts"],
  "name_status_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.name-status.txt",
  "patch_ref": ".agent-surface/workflows/<run_id>/rounds/round-001/patches/T1.patch",
  "patch_hash": "sha256:...",
  "pre_tree_hash": "1111111111111111111111111111111111111111",
  "post_tree_hash": "2222222222222222222222222222222222222222",
  "applies_cleanly": true,
  "evidence_refs": [],
  "verify_results": [],
  "self_audit": [
    {"check": "direction still reaches accepted outcome", "result": "pass"},
    {"check": "existing solution searched before new construction", "result": "pass"},
    {"check": "changed invariants have one owner", "result": "pass"},
    {"check": "complexity and security controls are proportionate", "result": "pass"},
    {"check": "real user or operator path exercised", "result": "pass"}
  ],
  "decisions": ["Reused src/session.ts; rejected a second cache because it duplicated expiry ownership"],
  "assumptions": [],
  "known_limitations": [],
  "user_visible_behavior_changed": false,
  "contracts_touched": [],
  "blocker": null
}
```

## Blocker Discipline

Attempt the safe discovery or repair available to the worker before emitting a blocker.

- Not blockers; resolve them first: repository search, identifying existing capabilities, choosing checks from manifests/CI, scoped lint/test failures in owned files, simplifying a local design, or exercising a local real entry point.
- Refresh generated output only when assigned or required by the repository generator/check; record the command and keep the generated-file gate green.
- When a premise is disproven and evidence identifies a bounded alternative, pivot inside the accepted contract instead of spending two more attempts repairing the premise.
- Human-required: a missing product or architecture decision, a literal human-only login/device action, or required files outside FILESCOPE that cannot be split safely. In-scope secret use, dependency work, destructive operations, database mutation, deployment, production data, and service calls proceed under full-execution consent.
- After two distinct focused attempts on the same valid approach, stop with `blocker.type = "repeated_failure"` unless the next safe action is mechanical; include both attempts and the recommended pivot or decision.
- Every new blocker has `type`, `detail`, `needs`, `resolution_class`, `attempts`, and `recommended_decision`.

## Safety

- Never weaken tests, linters, compiler settings, authorization, validation, or security controls to make a task pass.
- Never present a mock, fake, fixture, stub, emulator, synthetic or recorded response, local substitute, or renamed equivalent as real integration, E2E, UX, deployment, security, or readiness evidence.
- Invent no product behavior, APIs, dependencies, threat models, performance needs, scale, or future requirements.
- Run repo-wide formatting, destructive cleanup, dependency mutation, and external commands only with the required task scope and research; add no separate approval gate.

## Output

```text
Development quality: PASS|CORRECTED|PIVOTED|ROUTE_REQUIRED|BLOCKED
Outcome: <user/developer outcome inspected>
Direction: <premise retained, corrected, or rejected and why>
Reuse/ownership: <existing capability used or concrete gap; invariant owner>
Complexity/risk: <trade-off and rejected unnecessary machinery>
UX/operations: <real path exercised and result, or not run with reason>
Changed: <files or none>
Size: <lines added/removed in code, tests, and docs>
Checks: <command/scenario -> passed/failed/not run>
Remaining: <real issue or none>
Workflow: <worker path and next command when routed worker mode is active>
```
