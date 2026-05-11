## OBJECTIVE

Route an incoming task to the lightest agent-surface path that can handle it safely.

`flow` is a router, not an implementer. It decides whether the next step should be direct work, workflow mode, audit, parallel exploration, or shipping.

## SYNTAX

```text
/flow [goal] [--risk low|medium|high|critical|auto] [--mode direct|workflow|audit|parallel|ship|auto] [--autonomy low|normal|high]
```

Defaults:

```text
--risk auto
--mode auto
--autonomy normal
```

## ROUTING MODEL

Use the smallest path that preserves evidence and safety.

```text
direct:
  trivial mechanical edit, single-file doc tweak, obvious config correction

dev-fix:
  small bug with clear reproduction and bounded filescope

workflow:
  medium/high-risk, multi-step, cross-file, security-sensitive, data-sensitive, or ambiguous implementation

audit:
  unknown risk, suspected vulnerability, broad design review, claim verification

parallel:
  independent exploration branches or competing implementation approaches

ship:
  accepted local changes need commit, push, release, or deployment
```

## LIFECYCLE MAP

```text
Observe:   boot-context, ops-report, ops-learn
Decide:    ops-ask, arch-roadmap, workflow-boss
Build:     dev-feature, dev-fix, dev-refactor, dev-chore
Verify:    verify-test, verify-spec, verify-coverage, verify-performance, verify-edge, verify-prove
Review:    qa-review, qa-sec, qa-trace, workflow-reviewer
Arbitrate: workflow-judger, workflow-rescue
Ship:      ship-commit, ship-artifact, ship-cicd, ship-release, ship-deploy
Close:     workflow-close
```

## RISK RULES

```text
low:
  direct path is allowed if filescope is obvious

medium:
  prefer workflow when changes span multiple modules or contracts

high:
  use workflow-boss before implementation; reviewer required

critical:
  workflow-boss plus workflow-reviewer required; workflow-judger required for repeated failure or partial merge
```

High/critical triggers:

```text
auth, crypto, payments, migrations, production data, deployment, secrets, dependency graph, CI release gates, security findings, workflow artifact repair
```

## AUTONOMY

```text
low:
  ask before assumptions, dependencies, risky commands, or protected files

normal:
  proceed with reversible assumptions; record assumptions; ask only on blockers

high:
  proceed until blocked by P0 safety, destructive action, secret access, deployment, or live external effect
```

## OUTPUT

Return one routing object.

```json
{
  "recommended_path": "direct|dev-fix|workflow|audit|parallel|ship",
  "risk": "low|medium|high|critical",
  "autonomy": "low|normal|high",
  "why": "short evidence-backed reason",
  "next_command": "command name or null",
  "required_artifacts": [],
  "human_approval_needed": false,
  "approval_reason": null
}
```

## HARD RULES

1. Do not route high/critical implementation directly to a worker.
2. Do not route audit findings straight to implementation without turning them into verifiable tasks.
3. Do not use workflow mode for trivial edits unless the user explicitly requests it.
4. If the route depends on unavailable evidence, choose `boot-context`, `ops-report`, or `qa-trace` before implementation.
5. If a workflow is already active, run `workflow-doctor` before starting a competing workflow.
