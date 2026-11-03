---
name: dev-chore
description: "Maintain development quality by correcting local design, reuse, complexity, risk, and UX drift before it compounds."
---

## OBJECTIVE

Keep project-level development quality improving while work is still small enough to correct cheaply.

`dev-chore` is a continuous quality intervention, not merely a formatting and metadata command. It finds and corrects bounded problems such as duplicate ownership, hand-rolled replacements for existing capabilities, patching around a disproven design, speculative abstraction, disproportionate security machinery, incomplete user journeys, configuration drift, dependency hygiene, and dead code.

The governing rule is:

```text
Do not make a wrong design cleaner. Re-check the outcome, reuse what already works,
make the smallest justified correction, prove it, and then continue development.
```

This command does not replace independent review or acceptance proof. A `dev-chore` PASS means the inspected development increment meets this command's quality gates; it does not mean QA, E2E, readiness, or release approval passed.

## OPERATING MODES

### Routed worker mode

Use this mode when BOSS selected route `chore` for an explicit, bounded quality-maintenance task. `dev-chore` owns the worker artifact and may make changes inside the assigned AC and FILESCOPE.

### Embedded checkpoint mode

Use this mode when `dev-feature`, `dev-fix`, or `dev-refactor` calls `dev-chore` while implementing its own task. Inspect the current delta and return findings and decisions to the calling worker. The caller retains code, patch, evidence, and worker-artifact ownership; do not advance the workflow ledger as `dev-chore`.

### Direct mode

Use this mode when the user invokes `dev-chore` without an active workflow. Inspect the named task or current development delta, make only bounded corrections that preserve the accepted product contract, and report changed files and checks. Do not auto-commit.

## TRIGGERS

Run the quality loop at the start of a meaningful increment and whenever one of these signals appears; stop once that signal's risk is resolved:

- A new helper, type, abstraction, adapter, layer, dependency, service, configuration flag, state store, or framework is about to be added.
- A cap, limit, timeout, guard, refusal, allowlist, or validation rule is about to be added.
- The same rule, validation, mapping, retry, state, query, UI pattern, or integration is being implemented a second time.
- A design premise has been disproven, a workaround is growing, or two focused correction attempts have failed.
- The implementation diff is expanding faster than the user outcome, or support infrastructure is becoming larger than the requested behavior.
- A security control adds a new service, policy layer, approval path, or major usability cost.
- A user-visible path exists in code but has not been exercised through its real entry point, including failure and recovery.
- A local maintenance task exposes stale generated output, dependency risk, dead code, inconsistent configuration, or a broken developer workflow.

## ROUTE BOUNDARIES

`dev-chore` may:

- Replace a duplicate with an existing implementation whose semantics match.
- Remove speculative indirection, unused configuration, dead paths, and unnecessary local machinery.
- Pivot implementation strategy inside an already accepted behavior contract.
- Correct local UX behavior already implied by the AC, such as missing feedback, recovery, empty/error state, actionable CLI output, or broken focus flow.
- Perform bounded dependency, configuration, formatting, generated-metadata, and repository-health maintenance.

Route instead when:

- New product behavior or a contract change is required: `dev-feature` or `workflow-boss`.
- A proven runtime or security defect needs regression proof: `dev-fix`.
- A broad behavior-preserving structural transformation is the task: `dev-refactor`.
- The root cause, dataflow, race, or trust boundary is still unproven: `qa-trace`.
- An independent whole-diff or repository review is requested: `qa-review`.
- Product intent, architecture ownership, or a security-versus-feature decision cannot be inferred from authoritative evidence: `workflow-boss` or a human decision.

Do not expand a local quality correction into an opportunistic repository rewrite. Report important out-of-scope findings; the user decides whether to schedule them.

## DEVELOPMENT QUALITY LOOP

### Gate 1: Outcome and direction

1. State the user or developer outcome in one sentence, and the planned item it advances. If the slice already works and the increment neither advances a planned item nor fixes an observed defect, stop and propose the next planned item.
2. Identify the current implementation premise that is supposed to produce that outcome.
3. Check the premise against the task AC, repository contracts, current code, and the latest real execution evidence.
4. If the premise is false, stop extending it. Choose one result:
   - `CORRECTED`: a bounded repair preserves the current design and AC.
   - `PIVOTED`: replace the local implementation strategy while preserving the AC.
   - `ROUTE_REQUIRED`: product, contract, filescope, or architecture must change.
   - `BLOCKED`: required evidence, dependency, environment, credential, human-only action, or target selector is unavailable.

Passing tests do not rescue a design that cannot deliver the stated outcome. Repeated patches around the same false premise are evidence to pivot, not a reason to add another layer.

### Gate 2: Existing solution before new construction

Before adding any new construct:

1. Search the repository for the concept, behavior, symbols, routes, schemas, errors, configuration keys, and tests, not only for the proposed name.
2. Inspect the standard library, framework primitives, and already-installed dependencies.
3. Compare semantics, failure behavior, lifecycle, ownership, and operational cost. Do not force reuse when behavior does not actually match.
4. Add something new only after recording the concrete gap in existing options.
5. For a new dependency, run the normal maintenance, license, advisory, install-script/native-code, transitive-footprint, compatibility, lockfile, and rollback review.

No wording games: renaming copied logic, wrapping it, placing it in another layer, or generating it does not make it a different implementation.

### Gate 3: Single ownership and duplication

Trace each changed invariant to one authoritative owner.

Reject or correct:

- Parallel implementations of the same business rule, validation, authorization decision, state transition, data shape, retry policy, or formatting rule.
- Multiple sources of truth joined by synchronization code.
- A new generic helper that overlaps an existing domain helper without replacing or delegating to it.
- Copy-pasted UI, API, query, or error-handling paths that will drift independently.
- Compatibility wrappers with no current consumer or removal condition.

Prefer deleting or consolidating the new duplicate. Do not launch a broad deduplication refactor unless it is necessary for the current task and inside FILESCOPE.

### Gate 4: Proportional design and complexity

For each new layer, abstraction, dependency, configuration option, background job, cache, queue, state store, policy mechanism, cap, limit, guard, refusal, or validation rule, require one present-tense justification, stated where the construct is defined:

- A current AC requires it.
- An observed failure cannot be solved safely at the existing boundary.
- Measured scale, reliability, or performance evidence requires it.
- It centralizes an invariant that is already duplicated.

Future flexibility, possible reuse, architectural fashion, a hypothetical input, or the ability to configure a value that has one valid setting are not sufficient. When the right correction removes behavior, remove it: a flag, fallback, or guard around code that should go is not a correction.

Compare at least these options when they are plausible: use the existing capability, make a small local change, or introduce a new abstraction. Choose the option that satisfies the outcome and non-negotiable constraints with the fewest new concepts and operational obligations.

### Gate 5: Security and feature trade-off

Security is part of the behavior, but not every imagined threat justifies a new subsystem.

1. Preserve non-negotiable trust boundaries: authentication, authorization, secret handling, cryptography, payments, destructive data mutation, customer data, and explicit project policy may not be weakened to ship a feature.
2. For other security work, name the concrete asset, actor, boundary, failure mode, impact, likelihood/exposure evidence, and smallest effective mitigation.
3. Prefer enforcement at the existing trust boundary over broad policy engines, approval ceremonies, duplicated validation, or new services.
4. Exercise the feature with the control enabled. A control that silently makes the required outcome unusable is not a successful implementation; either correct the UX or surface the real product/security decision.
5. Do not claim a security benefit from a control that has no enforced path or relevant proof.

When a required safeguard and the requested feature genuinely conflict, do not quietly remove either one. Route the explicit trade-off with evidence and a recommended decision.

### Gate 6: User and operator outcome

Treat UX and operability as functional quality, not post-implementation polish. Exercise the changed path through its real entry point against the accepted requirements, including the failures it can actually hit:

- UI: goal completion, the loading, empty, and error states the journey reaches, keyboard/focus behavior, accessibility, and no dead ends.
- CLI/API: discoverable inputs, stable contracts, actionable errors, correct exit/status behavior, promised machine-readable output, and no false success.
- Service/operations: startup, configuration failure, and the logs needed to diagnose the changed path.

Report other gaps instead of making them acceptance conditions. The implementation is not user-complete merely because a function returns, a component renders, or a mocked transcript looks correct. Real acceptance claims still belong to the verify commands and require real dependencies.

### Gate 7: Correct in small increments

1. Make one bounded correction at a time.
2. Run the cheapest meaningful check after each correction.
3. Re-run the affected real entry-point scenario when practical.
4. Stop and route if the correction requires a wider contract, filescope, or architecture than the task owns.
5. Leave the codebase easier to understand and modify than before the increment, without unrelated polish.

## COMMAND REUSE

Use existing commands as focused helpers:

- `boot-context`: stale or missing repository context.
- `ops-deps`: dependency capability, risk, maintenance, license, advisory, and lockfile review.
- `ops-doctor`: repository and tooling health.
- `qa-trace`: verify a suspected wrong premise, root cause, ownership path, race, or trust boundary before changing it.
- `lint-python`, `lint-rust`, `lint-go`, `lint-typescript`, `lint-shell`, `lint-kernel`: touched-file language checks.
- `dev-spec`, `verify-test`, `verify-coverage`, `verify-edge`, `verify-performance`, `verify-prove`: focused specification and proof for the accepted behavior and real user path.
- `qa-review`: independent broad review after implementation, not a substitute for this in-development loop.
- `ops-swarm`: parallel read-only discovery when scopes are independent and synthesis remains with the current owner.

Helper output is evidence, not a different ownership or completion model.

## WORKFLOW MODE

Workflow worker mode is ON only when `.agent-surface/workflows/<run_id>/run.json` is active, the lock is valid, BOSS uses `schema_version: workflow.v3`, `boss.workflow.route = "chore"`, and `run.json.workflow_next_command = "dev-chore"`.

Protocol:

1. Validate `run.json`, `boss.json`, branch, baseline, lock, round, parent hashes, active task IDs, AC, FILESCOPE, and latest reviewer/judger/rescue handoff.
2. Start from `boss.context_capsule`; inspect deltas unless evidence is missing, stale, contradictory, or changed.
3. For each active task, apply the gates its scope and risk call for before editing, and record the decisions that matter once, in `summary` and `decisions`.
4. Scope autofix and generated-output refreshes to FILESCOPE. Repo-wide mutation requires BOSS scope and a recorded reason.
5. When `task.patch_required=true`, wrap it with `agent-surface workflow patch begin/end/verify`. Otherwise record ordinary diff evidence and mark it ineligible for partial merge.
6. Run task verify commands through:

```text
agent-surface run --task <task_id> --class <class> --timeout <ms> --out .agent-surface/workflows/<run_id>/rounds/round-<round_id>/evidence/<task_id> -- <command...>
```

7. A corrected or pivoted task is `PASS` only when its AC and verify gates pass. A checkpoint that finds no required edit may also be `PASS`, with the inspected delta and decisions recorded.
8. Before marking a task blocked, apply Blocker Discipline. Do not skip ahead after a blocker.
9. Write the canonical worker artifact to `.agent-surface/workflows/<run_id>/rounds/round-<round_id>/worker.json` and the latest copy to `.agent-surface/workflows/<run_id>/worker.json`.
10. Set `workflow.owner = "dev-chore"` and `workflow.next_command = "workflow-reviewer"`, then advance with `agent-surface workflow apply --role dev-chore --run <run_id> --artifact .agent-surface/workflows/<run_id>/worker.json`. Do not hand-edit `run.json`.

Use the normal `workflow.worker.schema.json` shape. A completed task should make its quality decisions inspectable, for example:

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

## BLOCKER DISCIPLINE

Do not emit a blocker until safe discovery or repair available to the worker has been attempted.

- Not blockers: repository search, identifying existing capabilities, selecting checks from manifests/CI, scoped lint/test failures in owned files, simplifying a local design, or exercising a local real entry point. Resolve these first.
- Conditional worker-owned recovery: generated refresh is allowed only when assigned or required by the repository generator/check; record the command and keep the generated-file gate green.
- Direction recovery: when a premise is disproven, pivot inside the accepted contract if evidence identifies a bounded alternative. Do not spend two more attempts repairing the premise.
- Human-required blockers: a missing product or architecture decision, a literal human-only login/device action, or required files outside FILESCOPE that cannot be split safely. Secret use, dependency work, destructive operations, database mutation, deployment, production data, and service calls proceed under full-execution consent when they are in scope.
- Repeated failure: after two distinct focused attempts on the same valid approach, stop with `blocker.type = "repeated_failure"` unless the next safe action is mechanical. Include both attempts and the recommended pivot or decision.
- Every new blocker includes `type`, `detail`, `needs`, `resolution_class`, `attempts`, and `recommended_decision`.

## SAFETY AND TRUTH

- Never weaken tests, linters, compiler settings, authorization, validation, or security controls to make a task pass.
- Never present a mock, fake, fixture, stub, emulator, synthetic/recorded response, local substitute, or renamed equivalent as real integration, E2E, UX, deployment, security, or readiness evidence.
- Do not invent product behavior, APIs, dependencies, threat models, performance needs, scale, or future requirements.
- Run repo-wide formatting, destructive cleanup, dependency mutation, and external commands only with the required task scope and research; do not add a separate approval gate.
- In routed workflow mode, edit only the worker artifact, assigned files, per-task patch/evidence files, and this role's event.
- In embedded checkpoint mode, do not create or apply a `dev-chore` worker artifact; the calling worker remains responsible for implementation and evidence.

## OUTPUT

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
