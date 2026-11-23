# Concept Zero: Skill Quality and Distribution

Status: PROPOSED
Last updated: 2026-11-20
Baseline: `main` at `f93fda4` (2026-11-15)
Scope: agent-surface's canonical skills and commands, how hosts surface and load them, how their effect is measured, a skill-by-skill comparison with obra/superpowers, the default development path, and how assets reach hosts. Separate from [runtime refresh](../context/concept-zero.md) and [computer use](../computer-use/concept-zero.md). The [Grimoire evaluation contract](../contracts/grimoire-evaluation.md) is the binding experiment method. Evidence IDs (`E-nn`) refer to the [research ledger](concept-zero-research.md).

## Executive Decision

Build an evaluation lab before changing any skill or delivery route, and pass every change through it.
- **The lab adopts existing runners:**
  - Harbor for container runs across hosts;
  - BenchFlow and SkillsBench where official tasks fit;
  - Claude Code's `claude plugin eval` for checks on Claude Code alone.
- **We build only what none of them has:**
  - arms written by agent-surface's own installer into each attempt's fresh HOME;
  - a skill-load detector that works on every host;
  - graders that check world state;
  - the ledger and analysis conventions GR2 already used.
- **The lab's first job is a measurement:** do hosts surface and load our skills at all? In the last native task run, none was loaded (`E-01`).

Then three content changes run through it:
- **Descriptions** move to the trigger form the operator chose. A host adopts it only where trigger and outcome cohorts show it is no worse than today. A what-plus-when arm runs beside it, because vendor guidance differs (`E-22`).
- **The high-stakes assets get outcome cohorts.** These are `dev-fix`, `verify-test`, `qa-review`, the `ship-commit` command and the workflow roles.
- **Each Superpowers skill is compared** with our closest asset in parallel investigation packets. Only refinements that win a cohort ship, written in our own words.

Distribution follows the same evidence, per host and per output kind.
- **Replacement:** a native plugin manager, the shared `.agents/skills` location, or an existing tool replaces our code where a live parity test shows the same model-visible assets and our ownership guarantees.
- **The installer keeps what nothing else carries:**
  - always-on rules and settings;
  - MCP merges that keep the operator's fields;
  - first-party service provisioning;
  - pruning only what we own;
  - hosts without a plugin manager.

The default development path becomes one short documented route with the alternatives listed. It follows the operator's own scenario research.

Not included: any context or token reduction, a skill-size cap, a transcript-diagnosing skill, removing skills, or copying Superpowers text.

## Problem and Evidence

| ID | Claim | Evidence | Confidence | Impact |
|---|---|---|---|---|
| `P-01` | FACT: no measurement shows that an agent-surface skill changes agent behaviour, and in the only native task run no skill body was loaded. | `E-01` | high | Every skill decision so far rests on review, not evidence. |
| `P-02` | FACT: 60 of 62 canonical descriptions say what the skill does, not when to use it. The description is the only routing surface the hosts document. | `E-02`, `E-23`, `E-29` | high | Under-triggering is plausible and unmeasured. |
| `P-03` | FACT: Claude Code and Codex cap the skill listing at 1% and 2% of the context window. About 100 skills are installed with the external packs. INFERENCE: on smaller windows some descriptions are silently dropped. | `E-24`, `E-25`, `E-26` | medium | A wording test is meaningless where the description never reaches the model. |
| `P-04` | FACT: the distribution layer is 10.6k lines over 28 adapters. Every QA round finds installer defects, and one partial run deleted the external packs from 26 targets. | `E-03`, `E-04` | high | Code we own where native routes may now exist. |
| `P-05` | FACT: Superpowers ships 15 skills through native plugin managers on about 15 hosts with no build step. It tests skills against a no-skill baseline. | `E-11`, `E-12`, `E-14` | high | A reference for method and delivery, not for content. |
| `P-06` | FACT: one recorded development flow found disjoint misses by single-family reviewers and findings lost to compaction. | `E-07` | medium | Concrete refinement hypotheses already exist. |
| `P-07` | FACT: overlapping `dev-`, `qa-`, `verify-` and `workflow-` skills have no single documented default route. | `E-09` | high | Agents and operator pick inconsistently. |

## Users and Stakeholders

| Actor | Need | Constraints | Success signal |
|---|---|---|---|
| Operator (single maintainer) | Evidence that a skill or route helps before it ships; one update path per host. | Owns every product decision; budget approved for experiments. | Accept/reject decisions cite cohort results with intervals and cost. |
| Host sessions (agents) | The right skill surfaced and loaded at the right moment, with a body they can execute. | Host listing budgets, deferred tools, model version. | Measured trigger recall and outcome uplift per host. |
| Peer reviewers (peer#3, cross-family reviewers) | Reproducible evidence and stable branches to review. | Review the same artefacts the operator sees. | Findings reproduce from retained receipts. |
| Excluded | Public users of a marketplace. ASSUMPTION: delivery stays private until the operator decides otherwise. | — | — |

## Goals, Non-Goals, and Constraints

| ID | Type | Statement | Evidence |
|---|---|---|---|
| `G-SQ-01` | goal | An evaluation lab runs isolated, repeated, preregistered experiments on real host CLIs, graded on world state, with variance and cost per attempt. | USER_DECISION 2026-11-20 ("we need experiments", budget approved); `E-05`, `E-06` |
| `G-SQ-02` | goal | For each host in scope, know whether each installed skill is surfaced (description visible) and loadable, before any wording comparison. | `E-01`, `E-24`–`E-26` |
| `G-SQ-03` | goal | Every canonical description takes the trigger form "Use when …, before …", with what-it-does moved into the body. It ships per host where cohorts show it no worse than the current description. | USER_DECISION 2026-11-20; `E-22`, `E-23` |
| `G-SQ-04` | goal | `dev-fix`, `verify-test`, `qa-review`, `ship-commit` and the workflow roles each have an outcome cohort that measures their marginal effect on seeded tasks. | USER_DECISION 2026-11-20 |
| `G-SQ-05` | goal | Every Superpowers skill (except `diagnosing-superpowers`) is compared with our closest asset. Refinements become hypotheses and ship only with cohort evidence, in our own words. | USER_DECISION 2026-11-20; `E-11`, map in the ledger |
| `G-SQ-06` | goal | Per host and output kind, a native or existing route replaces agent-surface code where it gives the same model-visible result and our guarantees. Ours stays only where it is better. | USER_DECISION 2026-11-20; `E-30`–`E-35` |
| `G-SQ-07` | goal | One short default development path is documented, with alternatives (one-shot, test-first, front-end first, complex workflow and others) listed as optional. | USER_DECISION 2026-11-20; `E-09` |
| `N-SQ-01` | non-goal | No context or token reduction: always-on rules keep their size and skills keep their bodies. Raising a host's listing budget is allowed, because it adds context. | USER_DECISION 2026-11-20 |
| `N-SQ-02` | non-goal | No skill-size cap. | USER_DECISION 2026-11-20 |
| `N-SQ-03` | non-goal | No transcript-diagnosing skill. | USER_DECISION 2026-11-20 (duplicated) |
| `N-SQ-04` | non-goal | No skill is removed; merging or retiring one is a separate decision. | USER_DECISION 2026-11-20 |
| `N-SQ-05` | non-goal | No Superpowers text or structure is copied. | USER_DECISION 2026-11-20 |
| `N-SQ-06` | non-goal | No new benchmark platform, scorer service or schema registry. | `E-05` |
| `N-SQ-07` | non-goal | The default-path scenario research is the operator's; this program only consumes its result. | USER_DECISION 2026-11-20 |
| `C-SQ-01` | constraint | Experiments never touch the operator's real HOME, accounts, package managers or main checkout. Disposable containers and homes only; machine snapshot unchanged. | dev-flow feedback (`E-07`); project memory |
| `C-SQ-02` | constraint | Preregister before outcomes. Failed and aborted attempts stay in the denominator. No result is claimed beyond its cohort. | `E-05` |
| `C-SQ-03` | constraint | Host availability changes, so re-probe before each cohort. As of 2026-11-15, six hosts run unattended and several are blocked by account state. | `E-08` |
| `C-SQ-04` | constraint | Credentials enter containers at run time and never appear in retained receipts. A secret scan runs over every receipt. | P0 rules |
| `C-SQ-05` | constraint | Each cohort has a spend cap and records per-attempt cost, even with the approved budget. | `E-06` (GR2 credit cap) |
| `C-SQ-06` | constraint | Any distribution change keeps owned-only pruning, `UNOWNED_DESTINATION` protection and operator-field-preserving MCP merges. | `E-04`, README |
| `C-SQ-07` | constraint | Signed local commits, no AI attribution, no host product names in commit messages, worktrees under `/tmp`. | repository and operator rules |

## Unacceptable Outcomes

| Outcome | Why it matters | Prevention / detection |
|---|---|---|
| A rewritten description lowers triggering or task outcomes on a host. | The change exists to raise both. | Paired cohorts with held-out queries; adoption per host; the old description stays restorable from git. |
| An experiment grades what the agent says instead of what it did. | Narration is not evidence (`verify-prove`). | World-state graders only; transcripts used to classify mechanism, never to score. |
| An experiment mutates the operator's machine or leaks a credential. | P0. | Containers and disposable homes, a snapshot diff after every cohort, a secret scan of receipts. |
| A delivery migration deletes operator files or drops operator config fields. | That is the 2026-11-18 failure class (`E-04`). | Parity tests and ownership semantics checked per host before any switch; a staged switch with rollback. |
| A cohort too small to decide is read as "no effect". | GR2's two tasks carried all its variance (`E-01`). | Precision targets in the preregistration; cheap trigger cohorts sized for their intervals; "not detected" is never reported as equivalence. |
| A host silently drops descriptions and the loss is blamed on the wording. | It confounds every description result (`E-24`). | Record the real listing in each attempt; raise listing budgets where hosts allow it. |
| Dependence on an unlicensed or abandoned tool. | Reuse must stay legal and maintained. | Quorum is a reference only; adopted runners are Apache-2.0 and active (`E-17`–`E-19`). |

## Glossary

| Term | Meaning |
|---|---|
| Surfacing | The host puts a skill's name and description into the model's context. |
| Triggering | The model loads a skill's body for a request. |
| Arm | One experimental condition, such as the current description, the trigger form, or the profile without a skill. |
| Cohort | A preregistered set of attempts: scenarios × arms × repetitions × hosts. |
| World state | What can be checked without the agent's account of itself: git state, files, test results, commands run, files opened. |
| Native route | A host's own plugin or extension manager, or a standard location it reads. |
| Parity test | A live check that a route delivers the same model-visible assets, invocation and removal as the installer does today. |
| Default path | The development route used when no other route is chosen. |

## Critical Journeys

| Journey | Current pain | Proposed experience | Evidence needed |
|---|---|---|---|
| The operator changes a skill. | Accepted by review alone; the effect is unknown. | Runs the skill's preregistered cohort and sees trigger and outcome deltas with intervals and cost before accepting. | Lab fit for purpose (`S-SQ-01`–`S-SQ-03`). |
| A host session meets a request a skill covers. | The skill may be invisible or ignored (`P-01`–`P-03`). | The description is surfaced, the body loads, and its steps happen. | Surfacing probe and trigger cohorts per host. |
| The operator installs or updates a host. | One custom installer for 26 targets, with ordered steps that can be skipped. | One native command where a host has one; the installer only where it adds a guarantee; `doctor` confirms parity. | Capability matrix and parity pilot. |
| A developer starts work. | Many overlapping skills and no named default. | One short default path, with alternatives listed by scenario. | The operator's research; later, optional outcome cohorts by scenario. |

## Quality Scenarios

| ID | Scenario | Measure | Later architecture gate |
|---|---|---|---|
| `Q-SQ-01` | A cohort is rerun with identical frozen inputs. | Arm means fall inside the preregistered tolerance. ASSUMPTION: ±10 points for trigger rates at 100 trials per arm. | Preregistration format and seeds. |
| `Q-SQ-02` | Any cohort finishes. | Operator machine snapshot diff is empty; the secret scan of receipts is clean. | Runner isolation and credential path. |
| `Q-SQ-03` | A surfacing probe runs on a host with the full real profile. | Each installed skill is classified as surfaced, name-only or absent, from the host's real listing. | Listing capture per host (`S-SQ-03`). |
| `Q-SQ-04` | A trigger cohort compares description arms. | Per skill and host: should-trigger recall and near-miss false-trigger rate, both with 95% intervals. Thresholds are preregistered (SPIKE_REQUIRED). | Detector and query sets. |
| `Q-SQ-05` | An outcome cohort compares the profile with and without one skill. | Paired task differences against a preregistered practical-effect rule. GR2 used +0.10 with a majority of tasks better. | Seeded scenarios and graders. |
| `Q-SQ-06` | A native route is tried for one host and output kind. | Discovery, invocation and removal match the installer route. Operator-owned files and fields are unchanged. | Parity harness. |
| `Q-SQ-07` | Any attempt runs. | Tokens or credits, cost and wall time are recorded; the cohort stops at its cap. | Ledger fields. |

## Research Landscape

| Capability | Candidate route | Evidence | Verdict |
|---|---|---|---|
| Cross-host runner | Harbor; BenchFlow and SkillsBench; Inspect AI; Quorum | `E-17`–`E-20` | Harbor, after a spike on arm injection and result fields. BenchFlow as fallback (re-verify after 0.6.3 → 0.9.3). Quorum is reference only (no license). |
| Claude Code runner | `claude plugin eval` | `E-15` | Adopt for Claude Code trigger checks and simple outcome checks; it has no git or test graders. |
| Description-tuning method | skill-creator trigger loop; agentskills.io guidance | `E-16`, `E-23` | Adapt the method (should and near-miss queries, held-out split, repetitions) and run it through our runner on every host. |
| Arm injection | agent-surface installer into a fresh HOME | `E-06` | Reuse: it already knows every host's discovery path. |
| World-state grading | Runner verifier scripts | `E-18`, `E-19` | Build per scenario in the runner's verifier format. |
| Skill-load detection | Host tool-call logs; file-open audit in the container | `E-24`, `E-29` | Spike both; prefer the host-independent audit. |
| Distribution | Native plugin managers; Agent Plugins 1.0; `.agents/skills`; `skills`, rulesync, add-mcp | `E-30`–`E-35` | Partial replacement is supported, full replacement is not. Decide per host and output kind by parity. |
| Skill content | Superpowers' 15 skills | `E-11`–`E-13`, skill map | Compare each, take hypotheses only, prove each in a cohort. |

## Adopt / Adapt / Build Decisions

| Capability | Decision | Rationale | Risk |
|---|---|---|---|
| Container runner | Adopt Harbor (fallback BenchFlow) | Apache-2.0, active, covers most runnable hosts. | Per-arm skill injection unverified (`S-SQ-01`). Droid is not among its adapters, so Droid keeps the GR2 harness. |
| Claude Code checks | Adopt `claude plugin eval` | Native with/without arms, repetitions and cost caps. | Weak graders; its scaffold script runs unsandboxed, so scaffold inside containers only. |
| Trigger method | Adapt from skill-creator and agentskills.io | The only published method that tests descriptions directly. | Claude-only as shipped; we port the method, not the code. |
| Arms | Build, thin: the installer writes each arm into the attempt's HOME | Production delivery is what we want to measure. | The installer must run inside or against the container (`S-SQ-01`). |
| Graders | Build per scenario | No runner checks our world state. | Grader bugs read as skill effects; every verifier is qualified with a reference solution, as in GR2. |
| Ledger and analysis | Adapt GR2 scripts | Proven preregistration and ledger shape (`E-06`). | Private receipts; summaries go into a contract doc. |
| Skill-by-skill comparison | Build, as `ops-swarm` packets | One packet per Superpowers skill, independent and parallel. | Copying risk (`N-SQ-05`); reviewers check memos and drafts for copied passages. |
| Skill delivery where native routes exist | Adopt per host after parity | The operator's direction; less code where defects recur. | Updates differ per host; ownership semantics differ (`E-35`). |
| Rules, settings, MCP merges, provisioning, pruning | Keep ours | No surveyed tool gives these guarantees (`E-33`, `E-35`). | — |

## Candidate Concepts

### Candidate A: Evidence lab first, then gated changes and staged delivery (selected)

- **Experience:** the operator runs a cohort and gets a decision table. Hosts keep working throughout.
- **Boundary:** the lab runs real host CLIs in containers on remote Linux servers (`ops-server`). Analysis and receipts stay local and private.
- **Order:**
  1. Lab and surfacing probe.
  2. Trigger and outcome cohorts for the high-stakes assets.
  3. Description rollout per host.
  4. Superpowers-derived refinements.
  5. Distribution pilots by parity.
  6. Default path once the operator's research lands.
- **Not built:** a benchmark platform, a scorer service, a new installer.
- **Strongest risk:** the lab costs more than it learns. Falsified if the first slice cannot classify surfacing on two hosts, or cannot produce trigger intervals narrow enough to decide three skills.

### Candidate B: Delivery first, evaluation after

- **Approach:** move every host with a plugin manager to native plugins and `.agents/skills` now, then build the lab.
- **Gain:** removes installer code sooner.
- **Strongest risk:** no instrument exists to prove parity or catch a regression in what hosts surface. That is the failure class of 2026-11-18, at larger scale.
- **Verdict:** rejected. The lab is needed for parity anyway, so building it first costs nothing in the end.

### Candidate C: Hand distribution to existing tools wholesale

- **Approach:** rulesync, `skills` and add-mcp become the engine, and agent-surface keeps only sources and the lab.
- **Strongest risk:** they sweep orphans by diffing directories, not by per-file ownership. They don't document operator-field-preserving merges and they don't provision services (`E-34`, `E-35`).
- **Verdict:** rejected for now. It is reopened if `S-SQ-07` shows equal guarantees on three hosts.

## Adversarial Review

| Finding | Revision |
|---|---|
| The lab could grow into the benchmark platform the contract forbids. | Adopted runners, scenario folders, one aggregator and private receipts; no service, schema registry or dashboard. |
| Comparing wordings on a host that never surfaces skills measures nothing (`E-01`). | The surfacing probe comes first; non-surfacing hosts are excluded from description cohorts and reported as host failures. |
| Always-on rules already mandate some procedures (a regression test first, truthful reporting), so a skill can look useless. | Outcome arms are "profile without the skill" versus "full profile", with the rules present in both; a raw host arm is a reference only. |
| Grading a review skill by LLM judge is narration grading. | Seeded defects with deterministic matchers (file, line window, defect class); a blind judge only adjudicates unmatched findings, under the GR1 dual-grading standard. |
| Trigger rewrites may lengthen descriptions and push skills out of the listing. | The surfacing probe reruns after each rollout. Listing budgets are raised where hosts allow it (`E-24`, `E-25`), which `N-SQ-01` permits. |
| A Droid run that loads nothing could be read as a wording failure. | Droid's surfacing is probed separately; a no-load result is a host finding, not a description result (`E-01`, `E-29`). |
| Seeded tasks written in-project are tuned to our skills. | Primary outcome tasks are real defects from this repository's QA history, rebuilt at their pre-fix commits with the real fix's tests hidden; SkillsBench tasks are used where they cover a skill. |
| Delivery migration could run ahead of evidence. | Each host and output kind switches only after its parity test; installer code is deleted only after the switch holds for a release. |

## Selected Concept HLD

**Evaluation lab.**
- **Location:**
  - scenario folders in the runner's task format under a versioned `evals/` tree;
  - preregistrations and attempt ledgers under `.agent-surface/research/<date>-<cohort>/`, kept private;
  - accepted results summarised in a contract document.
- **Attempt flow:**
  1. The runner starts one container per attempt on a remote Linux server.
  2. agent-surface installs the arm's profile into the container's HOME.
  3. The host CLI runs the scenario with credentials injected at run time.
  4. A file-open audit records which skill files were read.
  5. The verifier scores world state in its own sandbox.
  6. The ledger records arm, host, model, versions, the real listing, cost and time.
- **Analysis:** reports per-cell means and intervals, paired differences, and cost.

**Description program.**
- **Inputs:** per skill, should-trigger and near-miss query sets with a held-out split.
- **Arms:**
  - A, the current description;
  - B, the trigger form;
  - C, a short what-clause plus "Use when", as a diagnostic.
- **Adoption rule:** B ships per host when it is no worse than A on recall and on false triggers, and on outcomes where a cohort exists. If C beats B by the practical threshold, the operator decides; the lab never switches silently.

**Outcome program.**
- **Assets:** `dev-fix`, `verify-test`, `qa-review`, `ship-commit` and the workflow roles.
- **Arms:** the profile without the asset versus the full profile.
- **Scenarios:**
  - rebuilt QA-history defects, with hidden regression tests and checks that no existing test was weakened;
  - seeded test-weakening for `verify-test`;
  - staged changes with hooks and a throwaway signing key for `ship-commit`;
  - ledgers validated by `agent-surface workflow doctor` for the workflow roles.

**Comparison program.**
- **Packets:** fourteen `ops-swarm` packets, one per Superpowers skill. Each produces a memo covering triggers, procedure, the failure modes it addresses, evidence gates and outputs, ending in testable hypotheses.
- **Path to shipping:** the operator selects hypotheses, and each ships only after it wins its cohort.
- **Seed hypotheses:** `E-07` adds cross-family review, layout round-trips in self-critique, and persisting findings outside chat.

**Listing budgets.** If the surfacing probe shows dropped descriptions, generated host settings raise the listing budget, for example Claude Code's `skillListingBudgetFraction` and Codex's `skills.max_context_tokens`.

**Delivery program.**
1. Complete the capability matrix for the unresearched hosts and define the guarantees a route must meet.
2. Run a parity pilot on Claude Code: a plugin built from our sources and installed through its marketplace, compared with installer delivery on the same cohort.
3. Use one shared `.agents/skills` copy for hosts that read it, replacing per-host copies, with ownership still tracked.
4. Adopt existing tools for an output kind only after `S-SQ-07`.

**End state:** the installer owns always-on rules, settings, MCP merges and provisioning, owned-only pruning, and hosts with no native route.

**Default path.** One documented route and a list of alternatives, in the workflow map that `boot-workflow` shows, written after the operator's research. No skill is removed.

**Operations, failure and cost.**
- **Operations:** cohorts are batch jobs on remote servers, with no long-running service.
- **Failure handling:**
  - an unavailable host makes its cells `BLOCKED`, never dropped;
  - an aborted attempt stays in the denominator;
  - a failed verifier qualification stops the cohort before any arm runs.
- **Cost drivers:** model tokens × arms × repetitions × hosts, then container compute. Trigger cohorts are short, outcome cohorts long.

## First Production Slice

Real hosts, real installs and real graders, preregistered:
1. **Surfacing probe:** every runnable host (`E-08`) with the full real profile (all categories and external packs), classifying each skill as surfaced, name-only or absent.
2. **Trigger cohort:**
   - skills: `dev-fix`, `verify-test` and `qa-review`;
   - arms: A, B and C;
   - about 20 queries per skill (should-trigger and near-miss), 5 repetitions;
   - hosts: Claude Code and one of Codex or OpenCode, in containers on `ops-server`.
3. **Outcome cohort:**
   - asset: `dev-fix`;
   - scenarios: three to five rebuilt QA-history defects;
   - arms: without versus with `dev-fix`;
   - 5 repetitions on the same two hosts.

Exit: a description decision for the three skills, and a go/no-go on the lab for the remaining assets.

## Open Questions and Spikes

| Question | Why it matters | How to resolve | Owner / next command |
|---|---|---|---|
| `S-SQ-01` Can Harbor install a per-arm profile through our installer, and what result and cost fields does it return? | Decides the runner. | One scenario on two hosts. | lab peer; `dev-core` |
| `S-SQ-02` How is a skill load detected on each host? | Trigger metrics depend on it. | Compare a file-open audit with host logs on three hosts. | lab peer |
| `S-SQ-03` What does each host actually list with about 100 skills installed? | Confounds every description result. | Capture Claude Code `/context` and debug output, Codex warnings, and Droid and OpenCode listings. | lab peer |
| `S-SQ-04` How do credentials reach containers per host, within each provider's terms? | Isolated homes start logged out (`E-08`). | API-key mode per host; receipt secret scan. | operator plus lab peer |
| `S-SQ-05` What capacity, Docker support and egress do the remote servers have? | Concurrency and cost. | Probe through `ops-server`. | lab peer |
| `S-SQ-06` Can QA-history defects be rebuilt as tasks with hidden verifiers? | Realistic, checkable outcome tasks. | Rebuild F10, F13 and F14 at their pre-fix commits; qualify each verifier with the real fix. | lab peer |
| `S-SQ-07` Do rulesync and `skills` keep our ownership guarantees? | Reopens Candidate C. | Code read plus a live parity run on three hosts. | research peer |
| `S-SQ-08` Does a Claude Code plugin match installer delivery? | First delivery switch. | Parity pilot reusing the live plugin test pattern. | delivery peer |
| `OQ-SQ-01` What is the default path, and which alternatives fit which scenarios? | `G-SQ-07`. | The operator's research, with the brief below. | operator |
| `OQ-SQ-02` What practical-effect thresholds and repetition counts apply per cohort type? | Decision rules must precede outcomes. | Preregistration after the first slice's variance is known. | operator plus lab peer |
| `OQ-SQ-03` Does delivery stay private or become a public marketplace? | Changes packaging and support. | Operator decision; default private. | operator |

**Research brief for `OQ-SQ-01`**, for the operator's research agent:
- **Goal:** choose one small default development path for coding agents (Claude Code, Codex, Droid, OpenCode and similar), plus a short list of optional paths, each tied to the scenario where it wins.
- **Paths to compare:**
  - one-shot (implement, then verify);
  - test-first;
  - spec or plan, then execute;
  - front-end or prototype first;
  - a subagent per task with review;
  - parallel multi-agent;
  - cross-model review gates;
  - spike, then rewrite.
- **For each path:**
  - when it wins or loses, by task size, ambiguity, risk, codebase familiarity, UI versus backend, and greenfield versus legacy;
  - measured evidence (benchmarks, controlled studies, vendor guidance, practitioner data with sample sizes);
  - cost in tokens, wall time and human attention;
  - failure modes and required tooling.
- **Evidence rules:** separate measured evidence from opinion, cite primary sources with dates, and flag anything older than twelve months.
- **Deliver:**
  - a scenario → path → evidence-strength table;
  - a recommended default with its justification;
  - the minimal signals an agent can use to leave the default.

## Handoff to Architecture and Roadmap

`arch-roadmap` must carry forward:
- **Decisions:**
  - evaluation before change, with the lab as the gate;
  - adopted runners, with the installer as the arm injector;
  - per-host description adoption by cohort;
  - delivery delegation only by parity, with the installer keeping rules, settings, MCP merges and provisioning, and owned-only pruning;
  - Superpowers as a hypothesis source only;
  - a documented default path with nothing removed.
- **Quality scenarios:** `Q-SQ-01` to `Q-SQ-07`.
- **Constraints:** `C-SQ-01` to `C-SQ-07`.
- **Non-goals:** `N-SQ-01` to `N-SQ-07`.
- **Spikes:** `S-SQ-01` to `S-SQ-08`, and the first production slice as the first vertical.
- **Reopen triggers:**
  - the first slice cannot classify surfacing or decide three skills;
  - `S-SQ-07` shows equal guarantees in an existing tool;
  - arm C beats arm B;
  - the operator's default-path research changes the scenario list.
