# SOP and runbook template

Companion reference for `ops-docs` standalone mode. This file fixes the structure of a standard operating procedure and its lighter runbook profile. The rules about evidence, scope, and self-containment are in `SKILL.md`.

An SOP is an executable document. Its reader is performing the procedure, often under time pressure, possibly for the first time. Write for that reader.

## Choosing the profile

| Profile | Use when | Header carries |
|---|---|---|
| Controlled SOP | The procedure is a product or business commitment: a customer promises on it, an auditor may read it, or an owner must approve changes | Full identity block with approval and review cadence |
| Runbook | The procedure is internal operational knowledge: deploys, incident response steps, recovery drills | Owner and last-verified date only |

Both share the same body. The runbook profile drops approval, effective date, review due date, and records retention; it keeps everything that makes the procedure executable.

## Identity block

Uses the shared standalone document identity from `SKILL.md`, plus the control fields.

```markdown
| Field | Value |
|---|---|
| Document type | Standard operating procedure |
| Document ID | SOP-<area>-NNN |
| Version | 1.0 |
| Effective date | YYYY-MM-DD |
| Review due | YYYY-MM-DD |
| Owner | <role, not a person> |
| Approver | <role> |
| Audience | <who performs this> |
| Classification | Internal |
| Supersedes | <document ID and version, or none> |
```

Runbook profile:

```markdown
| Field | Value |
|---|---|
| Document type | Operational runbook |
| Owner | <team or role> |
| Last verified | YYYY-MM-DD against <environment or build> |
| Audience | <who performs this> |
```

## Body

1. **Purpose and outcome.** What this procedure achieves, in one or two sentences, stated as the end state — not as the activity.
2. **Scope and applicability.** When to use this procedure, when not to, and the nearest alternative procedure for the cases it excludes.
3. **Roles and responsibilities.** Who performs, who approves, who is informed. Roles, never individual names.
4. **Prerequisites.** Access and permissions, tools and versions, inputs and data, environment state, safety or change-control conditions, and the estimated duration. A reader who cannot satisfy the prerequisites must discover that here, not at step 7.
5. **Procedure.** Numbered steps. Each step states one action, the exact command or UI path, and the expected result that proves the step worked. Mark destructive or irreversible steps and give each a precondition check immediately before it.
6. **Verification.** How the performer knows the whole procedure succeeded — an observable world state, not a feeling. Name what to check and what the correct value looks like.
7. **Rollback.** How to undo, or the explicit statement that the procedure is irreversible past a named step and what to do instead.
8. **Escalation.** What counts as failure, who to contact, what information to bring, and the time bound for escalating rather than retrying.
9. **Records.** What the performer must log or retain, where, and for how long. Controlled SOP only.
10. **Revision history.** Version, date, author, and what changed. Controlled SOP only; runbooks rely on version control.

## Step shape

```markdown
### 5. Confirm the node is ready and schedulable

Run:

    kubectl get node <node>

**Expected:** one row whose `STATUS` column reads exactly `Ready`.

**If not:** any other value — `NotReady`, `Unknown`, or `Ready,SchedulingDisabled` (already cordoned) — means the node is not in the state this procedure assumes. Stop before step 6, record the status line, and follow the escalation section. Do not try to change the node's state from here.
```

## Rules

- One procedure per document. A document that covers three procedures is an index, not an SOP.
- Every step has an expected result. A step whose outcome cannot be observed cannot be verified and cannot be handed to someone else.
- Commands are copy-pasteable, with placeholders visibly marked. Do not embed environment-specific values that will silently rot; name them as inputs in the prerequisites.
- No step may say "verify it works". Name the observable.
- Write for the least experienced authorized performer, not for the author.
- Keep judgment calls explicit: where a step requires a decision, state the criteria and both branches.
- Date the last verification against a real environment. An SOP no one has executed since a platform change is a claim, not a procedure.
- Secrets never appear in the document. Reference the secret store path and the access mechanism.
