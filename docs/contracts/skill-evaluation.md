# Skill Evaluation Contract

Status: DRAFT for operator review, 2026-11-23, aligned with the lab as built at the SQ0.7 contract pass. The lab is built and tested; no scored cohort ran, and the operator stopped SQ experiments on 2026-11-23 after qualification and pilots. The last section lists the open decisions and pending lab changes for a later resumption.
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

**Description arms** compare how one skill's `description` is worded. Each is the full profile with the `description` line of the skills under test replaced, so competing skills are present.

| Arm | Description | Role |
|---|---|---|
| A | The current canonical description | Control |
| B | Trigger form: "Use when …, before …"; what the skill does moves into the body | Candidate (`G-SQ-03`) |
| C | What it does plus when to use it | Diagnostic: Anthropic's and agentskills.io's guidance differ (`E-22`, `E-23`) |

The texts of B and C are preregistration inputs, one line of at most 200 characters each so that every host lists them whole, and are never revised after an outcome. Only the `description` field of the skills under test differs between arms. Bodies, names, other skills and the rest of the profile are byte-identical.

**Outcome arms** compare the full profile with and without one asset (`G-SQ-04`). They run the hidden-verifier scenarios and change nothing but the asset's presence. A listing-only effect and a body effect are not separated by this comparison; step completion (Validity Gates) helps to separate them.

**Materialisation.**
- Each profile is a directory rendered by the production installer (`install --target <host> --scope user --dest <dir> --no-mcps`, general first, then each category) from a recorded source commit, then packed (`evals/arms.py`). A render writes nothing outside `--dest` and holds no absolute path, so the same tarball serves every lab host. The sources are never edited: a profile without a skill renders from a copy with that skill removed.
- The profiles are a fixed table: `dev-minus-dev-fix`, `dev`, `full`, `full-minus-dev-fix`, `full-descB` and `full-descC`. A profile that drops a skill or replaces descriptions renders from a hard-linked copy of the sources. `images.py arms` checks each rendered arm (`dev-fix` present or absent as named, `full` containing `dev`, each `-minus-dev-fix` differing from its parent by exactly `dev-fix`) and records the installed skills. With `--desc-texts` it also diffs each description arm's tarball against `full`: only the `SKILL.md` of the skills under test may differ, in the description line alone and set to the approved text; on codex the `short_description` line of the same skills' derived `agents/openai.yaml` may differ too, set to that text. A cohort starts only when every arm passes. The arm tarball's sha256 is a ledger field.
- One image per host holds the pinned base and the host CLI at its pinned version. Each attempt starts a fresh container from it and extracts the arm tarball into HOME before the agent starts, so HOME and workspace are pristine and the arm is data, not an image.
- Profile names encode the description arm, because the cohort's resume key and job names are scenario, host, profile and repetition: arm A is `full`, B is `full-descB`, C is `full-descC`. The ledger's `desc_arm` records the variant (`A`, `B` or `C`).

**Held constant across arms of one comparison:** no MCP servers (`--no-mcps` renders none, so all arms have the same tools), the same host CLI version, the same model and the same scenario instruction and tools. The runner (Harbor 0.26.0), source commit and per-attempt resource caps are part of the preregistration. A run that mixes versions inside an arm is invalid.

## Metrics

Every metric is computed from ledger fields (see Ledger Fields) per host and per arm. Denominators count every planned attempt of the cell, including failed, aborted and `BLOCKED` ones. A cell with attempts that failed before the agent started also reports the metric over completed attempts, labelled as a sensitivity result; the preregistration names which of the two is primary.

| Metric | Definition | Unit | Interval |
|---|---|---|---|
| Should-trigger recall (skill `s`) | attempts on should-trigger queries targeting `s` with `s` in `skills_loaded`, over all such attempts | proportion | Wilson 95% for a single cell (it treats repetitions of one query as independent, so it is too narrow and is labelled so); arm differences by a paired cluster bootstrap: queries resampled jointly across arms, then repetitions within each drawn query, with the queries-only interval printed beside it |
| Near-miss false-trigger rate (`s`) | attempts on near-miss queries for `s` with `s` in `skills_loaded`, over all such attempts | proportion | as above |
| Cross-skill confusion | on should-trigger queries targeting `s`, attempts that load an installed skill `t` other than `s`; reported as a target-by-loaded matrix, with the share that loads `t` and not `s` | proportion per cell | as above |
| Time to first load | seconds from the start of agent execution to the first load of the target skill, and the number of tool calls before it | seconds, count | median with bootstrap interval, over attempts that loaded; always shown with the load count |
| Verifier reward | `verifier_reward` per attempt (0 to 1; the SQ0.6 verifiers give 0 or 1); an attempt with no reward counts as 0 and is listed | mean per scenario | paired by scenario and repetition; with few scenarios report each scenario's difference and the share of scenarios better, and no pooled interval |
| Load rate per arm | attempts in which the asset under test is in `skills_loaded`, over all attempts of the arm | proportion | Wilson 95% |

Rules:
- Loads of skills the host adds itself (the listing capture's `not_installed_but_listed`) are reported separately and are not cross-skill confusion unless the preregistration names them.
- **Attempt classes**, from ledger fields alone. A launch failure (no `harbor` and no `cli_version`: nothing started) and a capacity end (`end_reason: capacity`: the gateway's upstream provider refused the agent with a 429, quota or overload error, read from the host's own error record) are not attempts; each is retried in a fresh job directory, at most three retries per cell for the two together (GR2 amendment 1 allowed three retries for connection failures; orchestrator decision O-14 extends it to capacity ends), and every try keeps its row with its `attempt_no`. A capacity end's partial loads and reward are never used; a cell still capacity-ended after its retries gets a `skipped` row (BLOCKED, in the denominator). Capacity ends count toward the three-in-a-row host stop. Every other row is an attempt: a setup failure (`exception` set, `seconds_agent` null) counts as not loaded with reward 0; an agent-end failure keeps the loads detected before the end and the verifier's reward if it ran, else 0; a missing verifier reward counts as 0 and is listed. `skipped` rows and `status: quarantined` rows count as missing attempts: in the denominator as not loaded with reward 0, the quarantined attempt's whole group also dropped in a labelled sensitivity table. No attempt is excluded after outcomes are seen.
- Time to first load is censored by attempts that never loaded. Do not average it, and do not compare arms on it without the load counts.
- The load rate of the without-asset arm is 0 by construction. The outcome comparison is intention-to-treat. A reward split by "loaded or not" inside the with-asset arm is descriptive only, because loading is not randomised.
- "Not detected" is reported as such, never as equivalence. A claim that two arms are no worse needs an interval inside a preregistered margin (Promotion Rules).
- A metric computed from a host or cell whose detector is not qualified or whose listing check failed is not reported.

## Detector Rules

The detector is `evals/detect.py`.

- **A load** is one of: a host-recorded skill-tool call (opencode `skill`; droid and claude-code `Skill`) naming the skill, or a read-class tool call or shell command whose target is an installed `<skill>/SKILL.md`. The evidence mechanism is stored per skill (`load_evidence`).
- **The file-open audit** (`inotifywait`, events after the startup scan) is a cross-check only. Hosts open every `SKILL.md` at startup, so opens before `startup_end` are not loads. The `Skill` tools of droid and claude-code open no file, so the audit cannot see them; opencode's skill tool shows only a directory open. Codex has no skill tool: it loads by reading the file.
- **Disagreements** are kept in `audit_disagreements` with a cause and never resolved by dropping either side. Two kinds exist:
  - expected: the audit cannot see the mechanism. They do not count against the cell.
  - unexplained: an audit open after the scan with no matching host record, or a recorded load the audit should have seen. They are counted per cell and may mean a detector miss. The preregistration sets how many block the cell.
- **Workspace exposure.** Some scenarios place a copy of the agent-surface repository, with its own `skills/` tree, in the workspace (the SQ0.6 scenarios, in `/app`). A load counts only for skills in the installed skill roots of the host. A read of any other `SKILL.md` is recorded as `workspace_skill_reads` and used as an exposure covariate: results are reported with and without attempts that have such reads. `detect.py` writes this covariate. A skill-tool call for a name that is not installed is recorded in `failed_skill_lookups`, not as a load.
- **Qualification.** A host is qualified when the three controls behave as designed on every attempt: use-by-name and use-by-file loads are detected with reward 1 and the no-skill control shows no load, 2 repetitions per control. SQ0.2 qualified droid, claude-code and codex on the rendered `dev` profile. No host is qualified on `full` yet, and opencode on the gateway has not rerun its controls; both are pending runs (last section).
- **Requalify** before a cohort whenever the host CLI version changes, a new host is added, or `detect.py` or the image's audit setup changes. Until it passes, the host's load metrics are not reported. A failed control is a host finding, not a data exclusion.

## Listing Rules

A description arm can only be compared on a host that shows the description to the model. The listing code is `evals/listing.py`.

- **Capture, per host.**
  - OpenCode: the `<available_skills>` block of the model request, kept by a forwarding proxy that stores no request headers.
  - Droid: the "Available skills" reminder in the session transcript.
  - Claude Code and Codex: the skill list in the model request, kept by the same proxy pointed at the gateway.
  - A new host needs its own capture method, qualified against the host's real request, before it joins a cohort.
- **Classification.** Each installed skill is `surfaced` (name and description shown), `name-only` or `absent`. A surfaced description that is a shortened prefix of the installed one is also flagged `truncated`. Skills the host adds itself are listed as `not_installed_but_listed`.
- **When.** Capture once per image, on every host and profile of a cohort including each description arm, before the cohort and again after any host or image change. The capture file is an input of the cohort; attempts do not capture.
- **Gate.** A host and skill whose description is not `surfaced` untruncated in the arm under test is excluded from that skill's description cohort and reported as a host finding. A truncated description may be studied only when the preregistration treats truncation as the factor.
- **Observations, not conclusions** (to re-test in SQ1.1): OpenCode, Claude Code and Codex list descriptions whole; Droid shortens them at 200 characters; Claude Code and Codex list fewer skills than are installed, and the missing ones are classified `absent`; no host has listed a skill by name only so far.

## Ledger Fields

One JSONL row per attempt, written by `evals/cohort.py`, append-only. "Written" means the code writes it; "Not written" means this contract needs it and the code does not yet.

| Field | Meaning | State |
|---|---|---|
| `scenario`, `profile`, `desc_arm`, `host`, `model`, `rep` | The cell. `profile` is the rendered arm, `desc_arm` its description variant (`A`, `B`, `C`), `model` the id the host requested (the served model is `served_model`) | Written |
| `attempt_no` | 1, or the try number of a retried launch failure or capacity end | Written |
| `harbor`, `cli_version` | The agent's name and the host CLI version, as reported in the trial's `result.json`; both null when nothing started. The runner version is pinned in `uv.lock` and in the preregistration | Written |
| `source_commit`, `arm_sha256`, `image_id` | Which sources, arm tarball and host image the attempt ran on | Written, from `arms.json` and `hosts.json` |
| `started`, `ended`, `harbor_exit`, `exception` | Timing and how the runner ended; kept for failed attempts | Written |
| `skipped`, `group_incomplete` | A cell not run (spend stop, quarantine stop, missing credential); `group_incomplete` marks a cell abandoned after a quarantine stopped a started group | Written |
| `status`, `hits`, `hit_names` | `status: quarantined` with the hit count and the label or pattern names, never matched text; such a row has no verdict or cost | Written |
| `receipt_scan`, `scrub_input_echo` | `clean`; and, per pattern name, the count of hits that matched the frozen list of known input strings | Written |
| `verifier_reward` | The hidden verifier's reward, null when it did not run or the unit has no verifier (trigger queries) | Written, from `result.json` |
| `skills_loaded`, `load_evidence` | Skills loaded by the detector rule, and the mechanism per skill | Written, from `detect.verdict` |
| `audit_loads`, `audit_disagreements`, `skill_files_scanned` | The audit's view and each disagreement with its cause | Written |
| `workspace_skill_reads`, `failed_skill_lookups` | `SKILL.md` reads outside the installed roots; skill-tool calls naming a skill that is not installed | Written |
| `first_load_seconds`, `calls_before_first_load` | Time to first load, from the start of agent execution, and the number of tool calls before it; null when nothing loaded | Written |
| `first_target_load_seconds` | Time to the first load of the attempt's `target_skill`, from the start of agent execution; null on attempts with no target skill and when the target never loaded. Time to first load in the analysis is this field | Written |
| `calls_before_first_target_load` | Tool calls before the first load of the attempt's `target_skill`; null on attempts with no target skill and when the target never loaded. The calls column of the first-load table is this field, so it describes the same event as `first_target_load_seconds` | Written |
| `query_id`, `query_class`, `target_skill`, `split` | Trigger cohorts: the query, `should-trigger` or `near-miss`, the skill it targets, and `dev` or `held-out` | Written (also on `skipped` rows) |
| `prereg` | Id of the preregistration (the cohort) the run follows | Written when `--prereg` is given |
| `purpose` | Label such as `timing-probe` or `capacity-ramp`; such rows are never outcome data | Written when given |
| `dev_fix_installed` | Whether the asset under test was installed | Written for `dev-fix`; generalise to `asset_installed` |
| `tokens_in`, `tokens_out`, `tokens_cache`, `model_requests`, `factory_credits` | Spend per attempt; `tokens_in` is the whole prompt summed over requests and `tokens_cache` its cached part; null when the host does not report it. Gateway hosts spend tokens, droid spends credits | Written, from the agent result |
| `cost_usd` | Always null: no agent sets it, and a CLI's own price figure is not spend | Written, unused |
| `seconds_env`, `seconds_setup`, `seconds_agent`, `seconds_verifier`, `seconds_total` | Phase times | Written |
| `cpus`, `memory_mb`, `agent_timeout_sec`, `concurrency` | The attempt's caps and the run's parallelism | Written |
| `listing` | Per target skill, `surfaced`, `name-only` or `absent`, and `truncated`; today the capture is an image-level file from `listing.py` | Not written |
| `end_reason`, `output_cap` | How the agent ended: `exit`, `output_cap`, `timeout`, `capacity`, `error` or `setup_failure`; and the output limit the attempt ran under where the host exposes it (opencode's configured limit; null for codex, droid and claude-code, whose cap the gateway or host applies). Codex's output-cap end is read from the host's "max_output_tokens" error text; droid has no such signal | Written |
| `served_model` | The model the cohort's start probe read for the row's host (the gateway's `x-litellm-model-name` header, droid's init-event model); null when the probe read none. It is the cohort's value, not a per-attempt reading | Written |
| `pressure`, `steps_done` | Outcome cohorts: the pressure stratum, and the required steps whose world-state artifact exists | Not written |

`cohort.json` holds the run's `prereg`, start and end times, and per host the served-model probe at the start and at the end (`model`, gateway `deployment`, `provider` and body-reported model, or null with a `reason`), `poolable` and, when false, `why`. `order.json` holds the seeded order as groups (every arm of one scenario, host and repetition) of cells; rows carry no order index and no cohort field beyond `prereg`. `hosts.json` holds one record per host image and `arms.json` one per host and profile. All are part of the receipt.

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

- Cohorts run on a disposable Linux host with Docker, never on the operator's machine. Each attempt gets the CPU, memory and agent time limit its task declares, or the preregistration's value for the whole run; the host CLI's own timeout sits 100 s under the agent limit so a slow attempt ends by the host's cap, not Harbor's cut. Concurrency is a run input; measured safe levels per host are lab measurements in the [README](../../evals/README.md#capacity-sq05-2026-11-21), not contract values.
- Before and after every cohort and local step, compare against a baseline: `~/.local/bin`, `brew list`, `uv tool list` and the hash of the git config. Any difference stops further work and is reported. The lab peer runs this comparison; `cohort.py` does not.
- Credentials follow the [SQ0.4 handling](../../evals/README.md): read from stdin of the cohort process, passed to the container with `docker exec -e NAME`, never in argv, an image, a build argument, a scenario folder, an overlay, a ledger row or a receipt. Auth files are not copied in. Gateway hosts read the gateway address from the lab environment, never from the repository.
- The scrubber `evals/scrub.py` scans each attempt's job directory, log and task folder for every injected value and for credential patterns after the container is removed. An exact-value hit is a leak. Third-party skills and scenario repositories carry credential-shaped placeholders: a pattern hit whose (pattern, sha256 of the match) is on a list frozen from a pre-flight scan of the arm tarballs and scenario inputs is an input echo, logged as `scrub_input_echo` and not a hit. Any other hit quarantines the attempt directory, writes a `quarantined` row without the matched bytes, and stops the cohort. The whole output tree is scanned again before it leaves the lab host. A leak is quarantined, never edited into looking clean.
- **Stop semantics.** A quarantine stops all launches at once: attempts already running finish and are scanned, and the unstarted arms of every started group get `skipped` rows with `group_incomplete`. A spend stop admits no new group but lets started groups finish. A host stop applies the quarantine rule to one host and lets the others go on: a host stops after 2 setup failures with the same exception type, or after 3 attempts in a row that end at the agent cap or in the same exception type; its started groups abandon their remaining arms as `group_incomplete`, its new groups are refused, and its running attempts finish.
- **Spend.** Per-cohort spend is capped in the preregistration, in tokens (prompt plus output) for gateway hosts and in credits for droid, with a reserve per attempt. A group is admitted only while spent plus the reserve times the attempts admitted and not finished, the new group included, stays within the cap; an attempt with no reading is charged the reserve, one that failed before the agent started is charged nothing. Refused groups are `skipped` rows, counted as `BLOCKED`.
- Receipts are private (`.agent-surface/research/<date>-sq-<id>/`). Only accepted summaries are copied into this contract or the roadmap.

## Preregistration Template

Frozen in one JSON file before the first scored attempt. An amendment is a separate file that states what it changes and why. Values are set at SQ0.7's preregistration step; blank here.

| Field | Content | Value |
|---|---|---|
| `id`, `frozen_at`, `contract_commit` | Cohort id, time of freezing, this contract's commit | to set |
| `hypothesis` | The decision the cohort serves, stated so that a result can contradict it | to set |
| `arms` | Profiles with arm tarball hashes and the source commit; the description text of each description arm | to set |
| `hosts` | Hosts, CLI versions, models, runner version, resource caps, the applied output limit of each gateway host, and the served-model probe | to set |
| `credentials` | Which hosts run, and the credential decision for each | to set by the operator |
| `scenarios` or `queries` | Ids and hashes of scenarios or of query files, with the `dev` and `held-out` split and how queries were written; the query file is the output of `python -m evals.queries select` (mechanical checks, two blind label files, seeded selection and split) | to set |
| `pilot` | Baseline-must-fail pilot: runs per scenario, ceiling, separate seeds | to set |
| `repetitions` | Per cell | to set |
| `seeds` | Order seed and any query or scenario sampling seed | to set |
| `metrics` | Primary and secondary metrics, primary denominator rule, intervals | to set |
| `thresholds` | Margins and practical-effect rule per promotion row | to set (`OQ-SQ-02`) |
| `detector` | Qualification evidence per host and the unexplained-disagreement limit | to set |
| `listing` | The listing capture per image and the gate outcome | to set |
| `exclusions` | Scenarios, hosts or attempts excluded in advance and why | to set |
| `input_fingerprints` | The frozen list of known credential-shaped input strings (`python -m evals.scrub --fingerprint`) | to set |
| `stop_rules` | Conditions that stop the cohort: scrubber hit, machine diff, failure rate, spend | to set |
| `cost_cap` | Cap and per-attempt reserve per host and cohort, in the host's own unit | to set (`O-6`) |
| `analysis` | The script (`evals/analyze.py`, its hash) and its parameter file (`evals/README.md`, Analysis), which carries the cohort ids, bootstrap seed, thresholds, queries hash, arm hashes and skill lists, hosts and per-host skills and scenarios | to set |

## Hosts

Operator decisions, 2026-11-22. The ledger's `model` is the requested id, and host comparisons mix host and model.

| Host | Model | Role in SQ1 |
|---|---|---|
| `droid` | a Claude model, through the vendor's own service | Scored; the Claude-family host, for qualification, the surfacing probe and the trigger cohort only; its outcome pilot and cohort are deferred (roadmap, Later / Not Now) |
| `codex` | `gpt-5.4` through the gateway | Scored; the only host of the `dev-fix` outcome cohort |
| `claude-code` | `glm-5.2` through the gateway, requested by its catalog id | Runs but is not scored: the model is not a Claude model, so its results are not Claude-model results |
| `opencode` | `gpt-5.5` through the gateway, with an explicit output limit on every request | Candidate, added only by amendment before any of its attempts, after its controls pass; it runs `gpt-5.5`, a different model from codex's, so its results do not replicate codex's |

The gateway applies a default output limit when a client sends none; that default had cut codex turns short before it was raised. The attempt's end reason and, where the host exposes it, the applied limit are on the ledger row. Gateway hosts also need the served model probed at the start and end of each cohort (a mismatch makes that host's cohort not poolable; a gateway host whose probe names no model is not poolable either, and does not start). The probe is one tiny request on the host's own wire with its model id and key (`evals/served.py`); droid has no gateway, so its model is the init event of a `droid exec` stream, and null with a reason when that names none.

## Known Deviations

- **Claude Code ran without rules before the import step.** Every Claude Code attempt before the arms carried `~/.claude/CLAUDE.md` with `@agent-surface/rules.md` ran without the agent-surface rules; those results are not comparable with later ones. Token fields before the unified definition (`tokens_in` as the whole prompt) differ per host.
- **No MCP servers.** Arms render with `--no-mcps`, so the listing is captured and the cohorts run without Synapse and Grimoire. They measure instruction ROI with the same tools; effects that depend on the MCP servers are outside these cohorts, and a "full real profile" probe is the full profile without them.
- **Repository skills in the workspace.** The SQ0.6 scenarios unpack the agent-surface repository, with its own `skills/` tree, into `/app`. Loads are restricted to installed roots and workspace reads are a covariate, but an agent may still learn from them.
- **Audit rescans.** On the rendered-arm path the audit sees a mass reopening of `SKILL.md` files after the first tool call for Claude Code, and of skill directories for OpenCode; it is not caused by file mtimes. The detector reports it as one disagreement and loads come from the host record.
- **Capacity.** Attempt times and safe concurrency per host are in the README's Capacity section; the two suite-heavy scenarios take 20 to 33 minutes. The codex timings taken before the gateway's output-limit default was raised are not planning figures.
- **Scenario images.** A scenario with its own `environment/Dockerfile` is layered once on each host image (`images.py scenarios`). Its qualification there, at the caps the cohort will use, has not been run.

## Open Decisions and Pending Changes

States a resumed SQ1 preregistration waits on, once. `O-n` ids are the preregistration's.

| Id | Decision | State |
|---|---|---|
| `O-1` | Query counts per skill and the held-out split | Open; waits for the pilots' measured cost |
| `O-2` | Whether dev-split queries join the primary analysis | Open; decide before the first dev-split attempt |
| `O-6` | Spend caps and reserves per cohort and host | Open; waits for the pilots' measured cost |
| `O-3` | Promotion margin | Orchestrator's decision, operator may override: at SQ1 query counts a no-worse interval is out of reach, so B is promoted only on a practical gain with no practical harm on false triggers and misrouting; the Promotion Rules wording stays for cohorts with more queries |
| `O-7` | Credential-shaped input text | Orchestrator's decision, operator may override: frozen input fingerprints, as in Isolation and Secrets; built |
| `O-8` | Texts of arms B and C | Operator's, provisional; kept in the preregistration |
| `O-9` | The workspace copy of `dev-fix` in SQ0.6 scenarios | Orchestrator's decision: keep it, report with and without attempts that read it |
| `O-10` | Host-added competitors of `qa-review` | Orchestrator's decision: a separate column, not misrouting |
| `O-11` | Resource caps | Orchestrator's decision: outcome attempts at the declared size and agent cap, trigger attempts at 1 CPU and 2048 MB; built as run inputs |
| `O-12` | Query labelling | Orchestrator's decision: two independent blind sessions |
| `O-13` | Reproducibility host and tolerance | Orchestrator's decision: rerun the whole cell sets on the cheaper required host; tolerance from run-to-run variance |

Pending lab changes the contract waits on:
- the `listing`, `pressure`, `steps_done` and `asset_installed` ledger fields;
- runs: detector requalification on `full` for every scored host and on opencode's gateway path, scenario qualification on the host images, and the codex outcome check after the output-limit default was raised.

Margins, ceilings, repetitions, the disagreement limit and spend caps are set in the preregistration (`OQ-SQ-02`) from SQ0 variance, not here.
