# Skill Evaluation Contract

Status: DRAFT for operator review, 2026-11-21. No cohort has run under it; the SQ1 preregistration is separate and waits on the open items in the last section.
Scope: [skill-quality concept](../skill-quality/concept-zero.md) and [architecture](../architecture.md#skill-quality-and-distribution), phase [SQ](../roadmap.md#phase-sq-skill-quality-and-distribution). Ids such as `G-SQ-02`, `Q-SQ-04` and `OQ-SQ-02` come from the concept; `E-nn` from its [research ledger](../skill-quality/concept-zero-research.md). The lab is `evals/`; see its [README](../../evals/README.md).

## Relation to the Grimoire Contract

The [Grimoire evaluation contract](grimoire-evaluation.md) stays binding. This contract does not restate it; it adds what a skill cohort needs.

| Inherited unchanged | Where |
|---|---|
| Failed, aborted, missing and `BLOCKED` attempts stay in the denominator; no replacement by a retry | Data and State, Attempt |
| Preregister source, models, harness, tool access, budgets, scorer, order and exclusions before outcomes; paired observations; one run is exploratory | Comparison and Decision, 3 |
| A hit or load is not a benefit claim; task benefit needs an official or authorized verifier | Comparison and Decision, 5 |
| Tune and evaluate on different labels; a tuned set cannot later be cited as held-out | Comparison and Decision, 1; Held-Out Relevance |
| Prefer the smaller change when results are indistinguishable within the experiment's precision | Comparison and Decision, 6 |
| Simple retained JSON and JSONL; no credentials, hidden reasoning or private content in receipts | Data and State |
| Compare in fresh HOME and workspace; inspect the actual manifest, not the intended flags; no solutions or memory carried between arms | Category ROI Boundary |

| Extended here | Section |
|---|---|
| Description arms and outcome arms materialised as rendered arm directories on host images | Arms |
| Trigger, confusion, timing and outcome metrics computed from ledger fields | Metrics |
| Host-recorded load detection and its qualification | Detector Rules |
| Listing classification as a precondition of description cohorts | Listing Rules |
| Validity gates for outcome scenarios | Validity Gates |
| Promotion of a description or skill change | Promotion Rules |
| Secret and machine isolation | Isolation and Secrets |

## Arms

**Description arms** compare how one skill's `description` is worded. Each is a source overlay on the full profile, so competing skills are present.

| Arm | Description | Role |
|---|---|---|
| A | The current canonical description | Control |
| B | Trigger form: "Use when …, before …"; what the skill does moves into the body | Candidate (`G-SQ-03`) |
| C | What it does plus when to use it | Diagnostic: Anthropic's and agentskills.io's guidance differ (`E-22`, `E-23`) |

Only the `description` field of the skills under test differs between arms. Bodies, names, other skills and the rest of the profile are byte-identical.

**Outcome arms** compare the full profile with and without one asset (`G-SQ-04`). They run the hidden-verifier scenarios and change nothing but the asset's presence. A listing-only effect and a body effect are not separated by this comparison; step completion (Validity Gates) helps to separate them.

**Materialisation.**
- Each profile is a directory rendered by the production installer (`install --target <host> --scope user --dest <dir> --no-mcps`, general first, then each category) from a recorded source commit, then packed (`evals/arms.py`). A render writes nothing outside `--dest` and holds no absolute path, so the same tarball serves every lab host. The sources are never edited: a profile without a skill renders from a copy with that skill removed.
- The profiles are `dev-minus-dev-fix`, `dev`, `full` and `full-minus-dev-fix`. `images.py arms` checks each rendered arm (`dev-fix` present or absent as named, `full` containing `dev`, each `-minus-dev-fix` differing from its parent by exactly `dev-fix`) and records the installed skills; a cohort starts only when every arm passes. The arm tarball's sha256 is a ledger field.
- One image per host holds the pinned base and the host CLI at its pinned version. Each attempt starts a fresh container from it and extracts the arm tarball into HOME before the agent starts, so HOME and workspace are pristine and the arm is data, not an image.
- The profile names are not the description arms above; `desc_arm` names the description variant and is separate (`A` for the committed descriptions). Description arms and `full` with an asset removed need new source overlays (`full-minus-dev-fix` is the first); see Known Deviations.

**Held constant across arms of one comparison:** no MCP servers (`--no-mcps` renders none, so all arms have the same tools), the same host CLI version, the same model and the same scenario instruction and tools. The runner (Harbor 0.26.0), source commit and per-attempt resource caps are part of the preregistration. A run that mixes versions inside an arm is invalid.

## Metrics

Every metric is computed from ledger fields (see Ledger Fields) per host and per arm. Denominators count every planned attempt of the cell, including failed, aborted and `BLOCKED` ones. A cell with attempts that failed before the agent started also reports the metric over completed attempts, labelled as a sensitivity result; the preregistration names which of the two is primary.

| Metric | Definition | Unit | Interval |
|---|---|---|---|
| Should-trigger recall (skill `s`) | attempts on should-trigger queries targeting `s` with `s` in `skills_loaded`, over all such attempts | proportion | Wilson 95% for a single cell; arm differences by paired percentile bootstrap over queries (repetitions of one query are not independent) |
| Near-miss false-trigger rate (`s`) | attempts on near-miss queries for `s` with `s` in `skills_loaded`, over all such attempts | proportion | as above |
| Cross-skill confusion | on should-trigger queries targeting `s`, attempts that load an installed skill `t` other than `s`; reported as a target-by-loaded matrix, with the share that loads `t` and not `s` | proportion per cell | as above |
| Time to first load | seconds from the start of agent execution to the first load of the target skill, and the number of tool calls before it | seconds, count | median with bootstrap interval, over attempts that loaded; always shown with the load count |
| Verifier reward | `verifier_reward` per attempt (0 to 1; the SQ0.6 verifiers give 0 or 1); an attempt with no reward counts as 0 and is listed | mean per scenario | paired by scenario and repetition; with few scenarios report each scenario's difference and the share of scenarios better, and no pooled interval |
| Load rate per arm | attempts in which the asset under test is in `skills_loaded`, over all attempts of the arm | proportion | Wilson 95% |

Rules:
- Loads of skills the host adds itself (OpenCode 1, Droid 21) are reported separately and are not cross-skill confusion unless the preregistration names them.
- Time to first load is censored by attempts that never loaded. Do not average it, and do not compare arms on it without the load counts.
- The load rate of the without-asset arm is 0 by construction. The outcome comparison is intention-to-treat. A reward split by "loaded or not" inside the with-asset arm is descriptive only, because loading is not randomised.
- "Not detected" is reported as such, never as equivalence. A claim that two arms are no worse needs an interval inside a preregistered margin (Promotion Rules).
- A metric computed from a host or cell whose detector is not qualified or whose listing check failed is not reported.

## Detector Rules

The detector is `evals/detect.py`.

- **A load** is one of: a host-recorded skill-tool call (OpenCode `skill`, Droid `Skill`) naming the skill, or a read-class tool call or shell command whose target is an installed `<skill>/SKILL.md`. The evidence mechanism is stored per skill (`load_evidence`).
- **The file-open audit** (`inotifywait`, events after the startup scan) is a cross-check only. Both hosts open every `SKILL.md` at startup, so opens before `startup_end` are not loads. Droid's `Skill` tool opens no file, so the audit cannot see it; OpenCode's skill tool shows only a directory open.
- **Disagreements** are kept in `audit_disagreements` with a cause and never resolved by dropping either side. Two kinds exist:
  - expected: the audit cannot see the mechanism. They do not count against the cell.
  - unexplained: an audit open after the scan with no matching host record, or a recorded load the audit should have seen. They are counted per cell and may mean a detector miss. The preregistration sets how many block the cell.
- **Workspace exposure.** Some scenarios place a copy of the agent-surface repository, with its own `skills/` tree, in the workspace (the SQ0.6 scenarios, in `/app`). A load counts only for skills in the installed skill roots of the host. A read of any other `SKILL.md` is recorded as `workspace_skill_reads` and used as an exposure covariate: results are reported with and without attempts that have such reads. This rule is being added to `detect.py`; until it lands, scenario cohorts do not report load metrics.
- **Qualification.** A host is qualified when the three controls behave as designed: use-by-name and use-by-file loads are detected and the no-skill control shows no load. SQ0.2 observed 2/2, 2/2 and 0 loads with 2 repetitions per host, on OpenCode 1.19.6 and Droid 0.244.0, arm B only.
- **Requalify** before a cohort whenever the host CLI version changes, a new host is added, or `detect.py` or the image's audit setup changes. Until it passes, the host's load metrics are not reported. A failed control is a host finding, not a data exclusion.

## Listing Rules

A description arm can only be compared on a host that shows the description to the model. The listing code is `evals/listing.py`.

- **Capture, per host.**
  - OpenCode: the `<available_skills>` block of the model request, kept by a forwarding proxy that stores no request headers.
  - Droid: the "Available skills" reminder in the session transcript.
  - Other hosts need their own capture method, qualified against the host's real request, before they join a cohort.
- **Classification.** Each installed skill is `surfaced` (name and description shown), `name-only` or `absent`. A surfaced description that is a shortened prefix of the installed one is also flagged `truncated`. Skills the host adds itself are listed as `not_installed_but_listed`.
- **When.** Capture on every host and profile of a cohort, including each description arm, before the cohort and again after any host or image change. The result is a ledger input for the cohort. Per-attempt capture is not implemented.
- **Gate.** A host and skill whose description is not `surfaced` untruncated in the arm under test is excluded from that skill's description cohort and reported as a host finding. A truncated description may be studied only when the preregistration treats truncation as the factor.
- **Observations, not conclusions** (SQ0.3; to re-test in SQ1.1):
  - OpenCode surfaced every installed skill with its full description in all images (57, 58 and 84 for A, B and F).
  - Droid shortens descriptions to 200 characters; this hit 9 skills in A and B and 25 in F. In F it listed the last skill, `workflow-runtime`, by name only, which suggests a listing budget. The 200-character limit and the budget are not yet characterised, and whether trigger-form wording falls inside the limit is untested.

## Ledger Fields

One JSONL row per attempt, written by `evals/cohort.py`, append-only. "Exists" means written at `6af59b4`; "To add" means this contract needs it and the code does not write it yet.

| Field | Meaning | Source |
|---|---|---|
| `scenario`, `profile`, `desc_arm`, `host`, `model`, `rep` | The cell. `profile` is the rendered arm; `desc_arm` the description variant (`A` today) | Exists |
| `harbor`, `cli_version` | Runner and host CLI versions as reported in the trial | Exists, from Harbor's `result.json` |
| `source_commit`, `arm_sha256`, `image_id` | Which sources, arm tarball and host image the attempt ran on | Exists, from `arms.json` and `hosts.json` |
| `started`, `ended`, `harbor_exit`, `exception` | Timing and how the runner ended; kept for failed attempts | Exists |
| `skipped` | Row for a cell not run because of a stop rule or a missing credential; counts as `BLOCKED` in the denominator | Exists |
| `verifier_reward` | The hidden verifier's reward, null when it did not run | Exists, from Harbor's `result.json` |
| `skills_loaded`, `load_evidence` | Skills loaded by the detector rule, and the mechanism per skill | Exists, from `detect.verdict` |
| `audit_loads`, `audit_disagreements`, `skill_files_scanned` | The audit's view and each disagreement with its cause | Exists |
| `dev_fix_installed` | Whether the asset under test was installed; generalise to `asset_installed` | Exists for `dev-fix` |
| `cost_usd`, `factory_credits`, `tokens_in`, `tokens_out`, `tokens_cache`, `model_requests` | Spend per attempt; `tokens_in` is the whole prompt summed over requests and `tokens_cache` its cached part; null when the host does not report it | Exists, from the agent result |
| `seconds_setup`, `seconds_agent`, `seconds_verifier`, `seconds_total` | Phase times | Exists |
| `key_files_remaining` | Count of retained files that still hold the key | Exists; replaced by the scrubber result (see Isolation and Secrets) |
| `query_id`, `query_class`, `target_skill`, `split` | Trigger cohorts: the query, `should-trigger` or `near-miss`, the skill it targets, and `dev` or `held-out` | To add |
| `first_load_seconds`, `calls_before_first_load` | Time to first load, from the start of agent execution, and the call index | To add, from the host record |
| `workspace_skill_reads` | `SKILL.md` reads outside the installed roots | Exists |
| `listing` | Per target skill, `surfaced`, `name-only` or `absent`, and `truncated`; or the id of the image-level capture | To add; captured by `listing.py` per image |
| `pressure`, `steps_done` | Outcome cohorts: the pressure stratum, and the required steps whose world-state artifact exists | To add |
| `prereg` | Id of the preregistration that planned the attempt | To add |

`order.json` holds the seeded cell order; `hosts.json` one record per host image and `arms.json` one per host and profile. All are part of the receipt.

## Validity Gates

Adopted from the SQ4 research (`T6`), as lab design only; none creates a skill.

**Baseline must fail.** A scenario's without-asset arm must show the failure the asset targets. In a pilot of control runs on the without-asset arm, a scenario whose pass rate is above a preregistered ceiling cannot show an outcome effect. It is excluded or rebuilt, and the decision is made before any scored outcome. Pilot runs use their own seeds and are never scored. This is separate from qualification of the verifier, which SQ0.6 does by the reference fix scoring 1, the untouched state 0 and a fix without a test 0.

**Step completion, for the description trap.** A description that summarises the procedure may let the agent act on the summary without loading the body. For skills with a staged body, each required stage leaves a world-state artifact that the scenario's checks can see, such as a failing test before the code change or both sections in a review file. Report, per arm, the share of required steps done, split by whether the body loaded. A skill whose steps are done as often without the body as with it shows nothing about the body.

**Pressure strata.** Outcome cohorts for discipline-shaped assets (`dev-fix`, `verify-test`, workflow roles) run each scenario with and without stacked task-prompt pressure (time, sunk cost, authority, exhaustion). The stratum is a ledger field and results are reported per stratum, not pooled. A refusal is an attempt with a reward, never a discard.

**Counter-rules on held-out scenarios.** A rule added to a skill because a run failed is tested on scenarios that were not used to find the failure. The gap between the discovery scenario and the held-out scenarios is the overfit estimate and is reported. Failure excerpts are kept for people to read and are never grader input.

**Rejected.** Grading on the agent's narration, a stated choice, or its own report of what it did. Every grade is world state: repository, files, git and hook state, and test runs in the verifier's own sandbox.

## Promotion Rules

All thresholds, margins and repetition counts are set in the preregistration (`OQ-SQ-02`), from SQ0 variance, by the operator with a lab peer. The only prior precedent is GR2: a practical effect of +0.10 with a majority of tasks better.

| Change | Promotes when (all hold, per skill and host) | Otherwise |
|---|---|---|
| Description form B instead of A (`ADR-SQ3`) | Listing gate passes for both arms. On the held-out queries, the interval of B minus A on recall lies inside the margin on the no-worse side, and likewise near-miss false triggers and cross-skill confusion. No existing outcome cohort for the skill regresses. | Keep A. Inconclusive and "not detected" results keep A. |
| C over B | C beats B by the preregistered practical threshold on the held-out queries | Operator decision (reopen trigger); B stays meanwhile |
| A skill body or rule change | The with-change arm beats the current arm by the practical-effect rule on the outcome cohort, on held-out scenarios when the change came from a failure, with no regression on near-miss tasks | Keep the current version |
| Per-host divergence in descriptions | Results differ between hosts beyond the margin | Operator decision |

Rules:
- A result is claimed only for its cohort's hosts, versions, models and scenarios.
- Cost and time per attempt are reported beside every decision; the smaller change wins when effects are indistinguishable.
- Descriptions and queries are frozen before outcomes. A description edited after seeing outcomes is a new arm with fresh held-out queries.
- Operator decisions: thresholds and margins, C over B, per-host divergence, spend above the cap, credentials, and the go or no-go on the lab.
- **Reopen** the concept when the first slice cannot classify surfacing or decide three skills, when C beats B, when an existing tool matches our delivery guarantees (`S-SQ-07`), or when the operator's default-path research changes the scenario list.

## Isolation and Secrets

- Cohorts run on a disposable Linux host with Docker, never on the operator's machine, with per-attempt CPU and memory caps and a bounded concurrency. The values come from SQ0.5's dynamic half.
- Before and after every cohort and local step, compare against a baseline: `~/.local/bin`, `brew list`, `uv tool list` and the hash of the git config. Any difference stops the cohort and is reported.
- Credentials follow the [SQ0.4 handling](../../evals/README.md): read from the first stdin line of the cohort process, passed to the container with `docker exec -e NAME`, never in argv, an image, a build argument, a scenario folder, an overlay, a ledger row or a receipt. Auth files are not copied in.
- The scrubber `evals/scrub.py` scans each attempt directory for the exact injected values and for credential patterns after the container is removed. A hit quarantines the attempt directory, writes a `quarantined` row without the matched bytes, and stops the cohort. The whole output tree is scanned again before it leaves the lab host. A leak is quarantined, never edited into looking clean.
- Receipts are private (`.agent-surface/research/<date>-sq-<id>/`). Only accepted summaries are copied into this contract or the roadmap.
- Per-cohort spend is capped in the preregistration, and attempts stop at the cap. Attempts not run are `BLOCKED` rows.

## Preregistration Template

Frozen in one JSON file before the first scored attempt. An amendment is a separate file that states what it changes and why. Values are set at SQ0.7's preregistration step; blank here.

| Field | Content | Value |
|---|---|---|
| `id`, `frozen_at`, `contract_commit` | Cohort id, time of freezing, this contract's commit | to set |
| `hypothesis` | The decision the cohort serves, stated so that a result can contradict it | to set |
| `arms` | Profiles with arm tarball hashes and the source commit; the description text of each description arm | to set |
| `hosts` | Hosts, CLI versions, models, runner version, resource caps | to set |
| `credentials` | Which hosts run, and the credential decision for each | to set by the operator |
| `scenarios` or `queries` | Ids and hashes of scenarios or of query files, with the `dev` and `held-out` split and how queries were written | to set |
| `pilot` | Baseline-must-fail pilot: runs per scenario, ceiling, separate seeds | to set |
| `repetitions` | Per cell | to set |
| `seeds` | Order seed and any query or scenario sampling seed | to set |
| `metrics` | Primary and secondary metrics, primary denominator rule, intervals | to set |
| `thresholds` | Margins and practical-effect rule per promotion row | to set (`OQ-SQ-02`) |
| `detector` | Qualification evidence per host and the unexplained-disagreement limit | to set |
| `listing` | The listing capture per image and the gate outcome | to set |
| `exclusions` | Scenarios, hosts or attempts excluded in advance and why | to set |
| `stop_rules` | Conditions that stop the cohort: scrubber hit, machine diff, failure rate, spend | to set |
| `cost_cap` | Cap per cohort and per attempt, in the host's own unit | to set |
| `analysis` | The script and the order of analyses | to set |

## Known Deviations and Open Items

- **Claude Code ran without rules before the import step.** Every Claude Code attempt before the arms carried `~/.claude/CLAUDE.md` with `@agent-surface/rules.md` ran without the agent-surface rules; those results are not comparable with later ones. Token fields before the unified definition (`tokens_in` as the whole prompt) differ per host.
- **No MCP servers.** Arms render with `--no-mcps`, so they measure instruction ROI with the same tools. A real profile also carries Synapse and Grimoire; effects that depend on them are outside these cohorts.
- **Repository skills in the workspace.** The SQ0.6 scenarios unpack the agent-surface repository, with its own `skills/` tree, into `/app`. Loads are restricted to installed roots and workspace reads are a covariate, but an agent may still learn from them.
- **OpenCode on the rendered-arm path.** Its free model hit the provider's usage limit during the arm rework, so its controls were not re-run; the detector and arms are the same code as for the other hosts, and its SQ0.2 results predate the change. Re-run them when the limit resets.
- **Audit rescans.** On the rendered-arm path the audit sees a mass reopening of `SKILL.md` files after the first tool call for Claude Code, and of skill directories for OpenCode; it is not caused by file mtimes. The detector reports it as one disagreement and loads come from the host record.
- **Hosts.** Only OpenCode (free model) and Droid (approved key) are `ready`. Claude Code, Codex, Kiro CLI and Kilo need an operator credential that is not decided. The roadmap's SQ1.3 names Claude Code, which cannot run until then.
- **Models.** OpenCode's free model and Droid's model differ, so host comparisons mix host and model.
- **Capacity.** Per-attempt wall time and safe concurrency are unmeasured. Lab hosts behind a corporate proxy need it passed into containers, which is untested, and the public-network lab host also serves production.
- **Code gaps** against this contract: the remaining To add ledger fields (query, first-load and step fields), description-arm overlays (`full-minus-dev-fix` exists; description variants do not), and `analyze.py`. Scenarios that carry their own `environment/Dockerfile` are layered on the host image by `write_task` but have not been built on it yet.
- **Open numbers**: margins, ceilings, repetitions, query counts, disagreement limit and spend caps are not set here, because OQ-SQ-02 sets them from SQ0 variance.
