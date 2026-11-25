# Evaluation lab (spike)

Runs one scenario on real host CLIs through [Harbor](https://github.com/harbor-framework/harbor) 0.26.0 (pinned in `uv.lock`), one disposable Docker container per attempt, from an image that holds the host CLI, with an arm rendered by the production installer extracted into its HOME. Steps `SQ0.1` to `SQ0.4`; hosts are OpenCode, Droid, and Claude Code and Codex through a gateway; see the [roadmap](../docs/roadmap.md#sq01-runner-and-arm-injection-spike).

Run it on a Linux host with Docker and uv, never on the operator machine. Cap `--cpus` and `--memory` on every container; each attempt gets the CPUs, memory and agent time limit its task declares in `task.toml`, unless the preregistration's value is given for the whole run (`--cpus`, `--memory-mb`, `--agent-timeout-sec`). The host CLI's own `timeout` is the agent limit minus 100 s, so a slow attempt ends by the host's cap, not by Harbor's cut. Safe concurrency per host is under Capacity.

```sh
# 1. Sources: a checkout of an installer commit that has `install --no-mcps` (submodules initialised), commit recorded.
rsync -a --exclude .git ./ HOST:lab/src/ && git rev-parse HEAD | ssh HOST 'cat > lab/src/.source-commit'
rsync -a evals/ HOST:lab/repo/evals/

# 2. Render and pack every arm (about a second per host and profile), check dev-fix presence and the profile relations.
cd lab/repo; PYTHONPATH=$PWD python3 -m evals.images arms --src ../src --out ../arms

# 3. One image per host: the pinned base plus the host CLI (about 1 minute each).
PYTHONPATH=$PWD python3 -m evals.images build --out ../images

# 3b. A scenario with its own environment/Dockerfile (the QA-history ones) is layered on each host image once, with capped build containers;
#     behind a proxy the build gets it as build arguments (--proxy, default LAB_BUILD_PROXY). Tags: sq-scn/<scenario>:<host>.
PYTHONPATH=$PWD python3 -m evals.images scenarios --host-images ../images/hosts.json --hosts droid \
  --scenario evals/scenarios/dev-fix/qa-f10-launcher-exec-bit

# 4. Cohort: groups (every profile of one scenario, host and repetition) in seeded order, the profiles inside a group in a group-seeded order; --concurrency attempts at once (see Capacity).
#    Keys come on stdin as NAME=value lines and never appear in argv or files.
cd evals; PYTHONPATH=$PWD/.. uv run --frozen python -m evals.cohort --host-images ../../images/hosts.json \
  --arms ../../arms/arms.json --scenario scenarios/controls/use-by-name --scenario scenarios/controls/no-skill \
  --profiles dev --out ../../out-controls

# 5. Listing capture for each host and profile.
cd ..; PYTHONPATH=$PWD python3 -m evals.listing capture --host-images ../images/hosts.json --arms ../arms/arms.json --out ../listing
```

`ledger.jsonl` has one row per attempt; `jobs/` holds Harbor's result, trajectory and verifier output.

## Arms and host images (`arms.py`, `images.py`)

- **A profile is a rendered directory.** `arms.render` runs the production installer for one host with `HOME=<dir>`: `install --target <host> --scope user --dest <dir> --no-mcps`, general first, then each category. `--no-mcps` renders every non-MCP output, builds and wires no MCP service, writes no launcher or hook, and writes nothing outside `--dest`, so there is nothing to strip afterwards. A render takes about a second.
- **Profiles** (`arms.PROFILES`): `none` (no installer run and no operator file: the arm without agent-surface, an empty tarball, on the same host image and harness as every other arm), `dev-minus-dev-fix` and `dev` (the `development` category without and with `dev-fix`), `full` (general, `external`, then `development,cybersecurity,private`) and `full-minus-dev-fix`. A profile without `dev-fix` renders from a hard-linked copy of the sources with that skill and its registry entries removed; the checkout is never edited. `full-descB` and `full-descC` are `full` with the `description` line of `dev-fix`, `verify-test` and `qa-review` replaced by the arm's text; `images arms --desc-texts desc.json` (`{"B": {skill: text}, "C": {...}}`, one printable line each, at most 200 characters, no quotes or backslashes) renders them, and they are skipped without it. The ledger's `profile` is one of these; `desc_arm` (`A` committed, `B`, `C`) comes from the profile and `arms.json` keeps each text's sha256.
- **A rendered directory has no absolute path in it**: the same arm rendered at two different paths differs only in the manifest's `generated_at`, so each arm is packed once (`arms.pack`: sorted, owner 0, mtime 0) and its sha256 goes in `arms.json` and in the ledger as `arm_sha256`.
- **Host images** (`images.py build`): the pinned base (`node:22-bookworm` by digest) plus `inotify-tools`, `procps` and the host CLI at its pinned version. One capped build container (2 CPUs, 3 GB), committed as `sq-host/<host>:<cli version>`; `hosts.json` records tag, image ID, base and script digest. No installer, no overlay, no profile.
- **An attempt** writes a Harbor task whose `environment.docker_image` is the host image (`write_task`). A scenario with its own `environment/Dockerfile` that starts from the shared base is built once on top of the host image (`images.py scenarios`, tag `sq-scn/<scenario>:<host>`) and the attempt's task points at that image, so no attempt builds anything. The classic builder is used because only it applies `--memory` and `--cpu-quota` to build steps; building the same scenario for another host reuses cached layers. The agent classes in `agents.py` upload the arm tarball (`SQ_ARM_TARBALL`, checked against `SQ_ARM_SHA256`), extract it into HOME and copy the manifest and skill list into the logs before the agent starts (a `none` arm, `SQ_ARM_INSTALLED=0`, has no manifest); the Harbor setup time is that step.
- **Operator steps the installer only documents.** Claude Code loads the rules document through an `@agent-surface/rules.md` import in `~/.claude/CLAUDE.md`, a file the installer never writes (`adapters/claude-code/README.md`). The operator's profile has that line, so `arms.add_operator_files` writes `.claude/CLAUDE.md` with exactly it into every Claude Code arm that installs agent-surface; a capture confirms the rules text is then in the request (`rules_in_request`). OpenCode, Droid and Codex write their own instruction files, so no other host needs one.
- Files are packed with a fixed mtime (2026-01-01), not epoch 0: with epoch-0 files OpenCode and Claude Code reopened the whole skills directory during the run, which the audit saw as dozens of opens.
- `images arms` checks every rendered arm: `dev-fix` present or absent as the profile says, no skill in `none`, `full` containing `dev`, and each `-minus-dev-fix` profile differing from its parent by exactly `dev-fix`. With `--desc-texts` it also diffs each description arm's tarball against `full`: only the `SKILL.md` of the three skills (plus Codex's derived `agents/openai.yaml` of the same skills) may differ, each in its description line alone and set to the approved text; the manifest's `generated_at` is ignored.

## Skill-load detector (`detect.py`)

Both hosts open every installed `SKILL.md` at startup to build their catalogue (OpenCode once per file, Droid three times), so a file-open audit alone cannot separate a load from the scan. The rule uses the host's own execution record and treats the audit as a cross-check.

| Host | A skill is loaded when the trajectory shows |
|---|---|
| OpenCode | a `skill` tool call (`name` input) for an installed skill, or a `read` or `bash` call whose target resolves to an installed `<skill>/SKILL.md` |
| Droid | a `Skill` tool call (`skill` input) for an installed skill, or a `Read` or `Execute` call whose target resolves to an installed `<skill>/SKILL.md` |
| Claude Code | a `Skill` tool call (`skill` input) for an installed skill, or a `Read` or `Bash` call whose target resolves to an installed `<skill>/SKILL.md`; from the stream-json `assistant` events |
| Codex | no skill tool: the model reads the file, so a shell call (`exec_command`, `cmd` and `workdir` inputs) whose target resolves to an installed `<skill>/SKILL.md`; from the rollout files, which carry timestamps |

Installed means listed in the attempt's `arm-skills.txt`. `~` and `$HOME` are expanded; a relative path resolves against the call's working directory (Droid records it, OpenCode does not) or a single leading `cd DIR &&`, and a path that cannot be resolved counts only when the audit shows the installed file opened after the scan. A skill-tool call for a name that is not installed is recorded in `failed_skill_lookups`, not as a load. Every other `SKILL.md` read, such as the repository's own `skills/` in a scenario workspace, is recorded in `workspace_skill_reads`, an exposure covariate that is never a load.

The audit's blind spots are skill tools that serve a cached body. It sees a file read, and for OpenCode's skill tool a directory open; Droid's and Claude Code's skill tools open no file, so the verdict lists them as a disagreement with that cause. The audit (`inotifywait -m -r -e open`, each event stamped by `stamp.py` with sub-second epoch time) counts opens after `startup_end`: OpenCode's first event of any kind (its scan ends about 2 s earlier), Droid's first tool call (its scan ends within 0.1 s of the first reasoning event). `verdict` lists each disagreement between record and audit with its cause; the ledger keeps them in `audit_disagreements`.

Controls are Harbor tasks under `scenarios/controls/`: `use-by-name` (tells the agent to use `dev-fix`), `use-by-file` (names the skill file; `{skill_file}` is filled per host) and `no-skill`. The verifier of the first two needs a heading that is only in the skill body, so reward 1 also shows the body reached the model.

## Listing capture (`listing.py`)

Per image, in a fresh capped container with one trivial prompt:

- OpenCode: a forwarding proxy (`capture_proxy.py`, request headers never saved) keeps the model request; the skills are the `<available_skills>` block of the developer message of its Responses request, and the capture records the `max_output_tokens` the request carries.
- Droid: its session transcript holds the first context message, an "Available skills" reminder.
- Claude Code and Codex: the same proxy, pointed at the gateway (plain HTTP, so `capture_proxy.py` selects its connection class by the upstream scheme). Claude Code lists `- name: description` lines after a marker in a system-role message; Codex lists them under `### Available skills` in the developer message.

Each installed skill is classified `surfaced`, `name-only` or `absent`, with `truncated` when the shown description is a shortened prefix. Skills the host adds itself are listed as `not_installed_but_listed`.

## Ledger

One row per attempt: `scenario`, `profile`, `desc_arm`, `host`, `model`, `rep`, versions, `source_commit`, `arm_sha256`, `image_id` (the host image), times (`seconds_setup` is the arm upload and extraction), cost fields, `verifier_reward`, `skills_loaded`, `load_evidence` (skill to mechanism), `audit_loads`, `workspace_skill_reads`, `failed_skill_lookups`, `audit_disagreements`, `skill_files_scanned`, `dev_fix_installed`, `receipt_scan`, `model_requests`, `seconds_env` (Harbor's environment start), `cpus`, `memory_mb` and `agent_timeout_sec` (the attempt's caps) and `concurrency` (the run's parallelism), and `attempt_no` (1 for the first try of a cell) and `purpose` when the run was not outcome data (`timing-probe`, `capacity-ramp`; such rows stay out of every outcome analysis).

`tokens_in` is the whole prompt, summed over the attempt's model requests, for every host; `tokens_cache` is its cached part (so uncached input is the difference) and `tokens_out` the output. Codex reports that sum directly; for Claude Code and Droid `tokens_in` is the uncached input plus cache reads and writes (Droid's `model_requests` is its turn count). A Claude Code attempt can end with more than one `result` event (a background task wakes a second turn), each covering only its own requests, so the lab sums them; the one earlier ledger with such an attempt is the SQ0.5 gateway timing run (f14, 352,915 recorded where the sum is 5,823,281). Rows written before this definition used host-specific meanings (Claude Code's `tokens_in` excluded cache reads); normalised values are in a private receipt, and old receipts are not rewritten. `end_reason` says how an attempt ended: `exit`, `output_cap` (the host's record shows a response cut at the output limit), `timeout` (Harbor's agent cap or the host CLI's own `timeout`), `capacity` (a provider limit named in the exception or the host's error text), `error`, or `setup_failure` (an exception before the agent started); `evals/endreason.py` documents each host's signal. `output_cap` is the output cap the attempt ran under where it is known: OpenCode's configured `limit.output`; null for Codex (it sends none, and the gateway's default shows only in the provider's response, not in Codex's session data), Droid and Claude Code. A Droid cap end is not detectable and reads as `error` or `exit`. `hosts.json` holds one record per host image and `arms.json` one per host and profile (tarball, sha256, source commit, `installed` (false only for `none`), installed skills).

## Scenarios

Each is a Harbor task under `scenarios/dev-fix/`: `instruction.md`, `environment/`, hidden `tests/` and `solution/`.

- `qa-f10-launcher-exec-bit`, `qa-f13-umask-widening` and `qa-f14-readonly-repair` rebuild three defects an external QA round found in this repository's installer, at the parent of the commit that fixed each:

| Task | Pre-fix tree | Real fix |
|---|---|---|
| `qa-f10-launcher-exec-bit` | `8409748` | `3e49f8d` |
| `qa-f13-umask-widening` | `3cc20e1` | `ad6e446` |
| `qa-f14-readonly-repair` | `3cc20e1` | `ad6e446` |

F13 and F14 share one fix commit and tree; each verifier checks its own symptom.

Instructions are the QA finding's own text (`observed` and `impact`, verbatim), the environment facts and a plain "Fix it."; they do not ask for a test or a test run, because the `dev-fix` cohort measures those behaviours. The verifier still requires a regression test that fails on the pre-fix tree. Where the finding's wording cannot be reproduced on the pre-fix tree (no shipped companion declares a mode), a reproduction hint is added. Sources, in this repository's `.agent-surface/readiness/whole-codebase/`: F10 `20261120-r4-79961fc-131104/readiness.json`, F13 and F14 `20261120-r5-555fa5e-141618/readiness.json` (finding ids F10, F13, F14).

`/app` contains the repository's own `skills/` tree, including `skills/dev-fix/SKILL.md`. Both arms see it; the detector reports reads of workspace copies separately from loads (SQ0.2).

Layout of a QA-history task:

- `environment/app.tar.gz` is `git archive` of the pre-fix commit. The image (node 22, digest pinned) unpacks it to `/app` and an identical pristine copy to `/opt/base`, with an unprivileged user `qa` (root bypasses permission checks, so the defects cannot reproduce as root).
- F13 and F14 also need the installer's registered skill packs and the machine state CI provides. `submodules.txt` pins the pack commits, fetched at image build by `fetch-packs.sh` (any fetch failure or empty pack fails the build; `external/trailofbits-skills` is left out on purpose, as an opt-in pack no suite needs), and the Dockerfile provisions browsers, a digest-pinned uv (0.12.17, copied from the official image) and the repository's own MCP launchers. That is the only network step; verification is offline.
- `tests/world.py` (a copy of `evals/world.py`; keep them identical) grades the world in scratch copies, as `qa`, with four stages that all run:
  1. `weakening`: no base test file deleted, no drop in assertion calls, no added skip markers, `tests/run.mjs` still runs every base suite;
  2. `suites`: the affected existing suites pass on the agent's tree;
  3. `regression`: `tests/check_regression.mjs`, a standalone check extracted from the fix's regression assertions that is never shipped with the task and does not depend on wording the bug report did not give;
  4. `discriminate`: at least one test file the agent added or changed fails on the pre-fix source and passes on the agent's tree.
- `tests/test.sh` writes reward 1 only when every stage holds; `/logs/verifier/world.log` shows which failed.
- `solution/solve.sh` applies the real fix (`fix.patch`) and its regression test (`tests.patch`). `solution/solve-code-only.sh` applies the code alone; it is a qualification fixture, and the verifier must score it 0.

Qualify a task with oracle (1), nop (0) and a copy of the task whose `solve.sh` is `solve-code-only.sh` (0). The apt packages are not pinned, so the built image ID is what makes an environment reproducible; the IDs used for qualification are in the SQ0.6 receipts. Limits: assertion counting is textual, so an assertion rewritten in place is not caught; stage 4 accepts any failure on the pre-fix tree, including a missing export.

## Trigger queries

`cohort.py --queries FILE` turns each query of a JSON list `{"id", "class" (should-trigger or near-miss), "skill" (dev-fix, verify-test or qa-review), "split" (dev or held-out), "text"}` into one unit named `trigger-<id>`, all on the shared `scenarios/trigger` template: its `instruction.md` is the one slot `{query}`, so the agent receives the query text alone. Trigger tasks have no verifier (`--disable-verification`), so `verifier_reward` is null; they only observe which skills load. The lab does not author queries; `tests/fixtures/queries-sample.json` is for tests only. Rows carry `query_id`, `query_class`, `target_skill` and `split` (also on skipped rows), plus `prereg` when `--prereg ID` is given, and `first_load_seconds` (agent start to the first skill load) and `calls_before_first_load` (tool calls before it), both null when nothing loaded; trigger rows also carry `first_target_load_seconds` and `calls_before_first_target_load` (the same two for the first load of the row's `target_skill`, null when it never loaded), which the first-load table uses. `served_model` is the cohort's start-probe value for the host (see Gateway hosts).

**Query selection** (`python -m evals.queries check|select`, preregistration 6.1 steps 2, 4 and 5). Candidates are JSONL, one `{"id", "skill", "class" (should-trigger or near-miss), "text", "sibling" (name or null)}` per line; each blind session's labels are JSONL `{"id", "label" (target, sibling or none), "sibling"}`. Both commands take `--candidates`, `--src` (a source tree: arm A is each target skill's `skills/<skill>/SKILL.md` front matter `description`, and the directories under `skills/` are the full profile's skill names), `--desc-texts` (`{"B": {skill: text}, "C": {...}}`, the file `images arms` reads) and optionally `--arms arms.json` (adds the skills of every `*-full` arm, for external skills a bare tree lacks).
- `check` prints each rejected candidate with its reasons and exits 1 if any. A candidate is rejected when its text contains the name of a full-profile skill (case-insensitive, not inside a longer word or hyphenated name) or the word "skill" ("skills" does not match), or shares a run of five consecutive words with the A, B or C description of any of the three target skills. Words: the text lowercased, then every maximal run of ASCII letters and digits, so hyphens, apostrophes and punctuation separate words.
- `select --labels S1.jsonl S2.jsonl --out DIR` applies the same checks, then keeps a should-trigger candidate only if both sessions say target and a near-miss only if neither says target and at least one says sibling (a missing label drops the candidate). For each (skill, class) in sorted order it sorts the eligible ids, shuffles them with a fresh `random.Random(20261121)`, keeps the first 10 (dev: first 6, held-out: last 4) and never pads: with fewer than 10 it writes only `report.json`, names each short `skill/class` on stderr and exits 1. On success `DIR` has `queries.json` (the format `--queries` reads), `queries.json.sha256` and `report.json` (every dropped candidate with its reason, including the ones beyond the first 10). Exit 2 means an input file is malformed.

Fixture workspace (`scenarios/trigger/environment/`, built on each host image by `images scenarios --scenario evals/scenarios/trigger`): `/app` is `pocket-ledger`, a dependency-free Node library of about 40 lines and eight passing tests, with one skipped test (`npm test`, Node's built-in runner). It is a git repository with one commit and an uncommitted change on top, so queries can name a bug, a green run or a diff:

- bug: `docs/known-issues.md` issue 7, confirmed and diagnosed but unfixed: `formatCents(-5)` returns `"0.05"` (the cause and the one-line location are written down);
- tests: `npm test` is green with one skipped test, which a "can I trust this?" query can examine;
- diff: `git diff` and `git status` show new `src/report.js` and `test/report.test.js` and an added `between` method in `src/ledger.js`.

It holds no `SKILL.md`, so any skill read in a trigger attempt is a load of an installed skill, not a workspace read.

## Capacity (SQ0.5, 2026-11-21)

Measured on a public lab host (16 cores, 62 GiB, a production server that also runs other services) and a gateway lab host (12 cores, 61 GiB, shared with other tenants). Attempts ran with `dev` only, as timing probes and a concurrency ramp; those ledger rows carry `purpose: timing-probe` or `capacity-ramp` and are never outcome data. Rewards were recorded, not analysed.

**Per-attempt wall time**, one attempt per cell at 2 CPUs and 4 GiB (`--cpus 2 --memory-mb 4096`), one at a time. Scenario images are built once per host (`images scenarios`): about 5 s for `qa-f10`, 4.5 minutes for `qa-f13` (shared with `qa-f14`, so the second is free).

| Host | Scenario | Setup (s) | Agent (s) | Verifier (s) | Total (s) | Peak CPU / memory |
|---|---|---|---|---|---|---|
| droid | qa-f10 | 1.1 | 374 | 3 | 397 (485 in a repeat) | 1.9 cores / 0.45 GiB |
| droid | qa-f13 | 1.0 | 1510 | 435 | 1967 | 1.9 cores / 2.4 GiB |
| droid | qa-f14 | 1.0 | 1213 | 434 | 1669 | 2.1 cores / 2.3 GiB |
| claude-code | qa-f10 | 0.9 | 460 | 2 | 508 | 1.7 cores / 0.26 GiB |
| claude-code | qa-f13 | 0.7 | 1193 | 291 | 1503 | 1.8 cores / 2.7 GiB |
| claude-code | qa-f14 | 0.7 | 1459 | 344 | 1825 | 1.5 cores / 2.7 GiB |
| codex | qa-f10 | 0.9 | 207 | 2 | 251 | 1.8 cores / 0.12 GiB |
| codex | qa-f13 | 1.2 | 57 | 30 | 136 | 1.5 cores / 1.0 GiB |
| codex | qa-f14 | 1.1 | 118 | 13 | 186 | 1.4 cores / 0.4 GiB |

- Only the `qa-f10` Droid cell was repeated (397 s and 485 s); every other cell is one attempt, so no spread is estimated.
- The two short Codex runs are not fast: the provider ended each with `Incomplete response returned, reason: max_output_tokens`. The host does not log the response cap it asked for or the failed request's usage. Do not use the short Codex times for planning.
- `qa-f13` and `qa-f14` take 20 to 33 minutes, mostly the agent and the verifier's suite run; `qa-f10` takes 4 to 8 minutes. A first Droid `qa-f13` attempt was cut by a 900 s host timeout, so the host cap is now 1700 s, under the scenarios' own 1800 s agent limit.
- A single attempt is about 1 CPU on average and peaks at 2; memory peaks at 2.7 GiB on the suite-heavy scenarios.

**Safe concurrency.** The no-skill control, 1 CPU and 2 GiB per attempt, at 1, 2, 4, 6 and 8 attempts at once (at least 3 attempts, twice the level above 1). A level is safe when all hold: no provider errors or capacity failures (the measurement-quality basis for the first two: errors and slowdown change what an attempt measures); median wall time at most 1.25 times the single-attempt median; host 1-minute load under the core count with available memory above 25% of total (the capacity basis); on the public host also no restart or state change of the other containers. The ramp stopped at the first level that broke one.

| Host | Control concurrency | Deciding criterion |
|---|---|---|
| droid, public host | 8 safe (top of the ramp, nothing broke) | none; median 32 to 34 s at every level, peak load 2.7, memory available at least 65%, other containers unchanged |
| codex, gateway host | 6 safe | at 8, 4 of 16 attempts failed with HTTP 429; levels 1 to 6 had no errors |
| claude-code, gateway host | 1 safe | at 2, median wall time 59 s against a single-attempt median of 37 s (limit 46 s); single-attempt times themselves varied from 23 to 49 s |

- The gateway host's load is partly its other tenants: its 1-minute load reached 10 with one lab attempt running and never reflected the lab alone.
- An earlier run saw Codex return 429 at 4 attempts; this ramp did not. The gateway's limit is not a stable number, so treat 6 as a ceiling to re-check, not a guarantee.
- Scenario attempts (2 CPUs, 4 GiB) are derived, not ramped: the same CPU budget as the safe control level, which gives 4 at once for droid and 3 for codex, and 1 for claude-code until its wall-time variance is understood. Memory is not the limit on either host (at 2.7 GiB peak each, the 25% reserve leaves room for more than 10).
- A control attempt takes 30 to 45 s on every host. `Codex` attempts ended by `max_output_tokens` are counted apart from capacity failures.

## Analysis (`analyze.py`)

`python -m evals.analyze --params analysis-params.json --ledger LEDGER.jsonl [--ledger ...] [--out result.json]` reads the frozen parameter file and the ledgers and nothing else, and writes one JSON document: per host the denominators per attempt class (launch-failure cells outside the denominator; skipped, quarantined and group-incomplete rows inside), per-cell rates with Wilson intervals, the paired differences with the practical-effect rule and the reading of each contrast, the paired two-stage bootstrap (stage 1 and stage 2 intervals side by side), the host-added-loaded column, the target-by-loaded misrouting matrix, the time to first load, the `sq1-o1` per-scenario difference with Newcombe intervals, the merged shared-fix reading and the load rate, mean cost per attempt, and the labelled sensitivity tables. A row belongs to a cohort by its `prereg` field. Exit status 2 and no tables mean a row's `arm_sha256`, `desc_arm` or `dev_fix_installed` differs from the frozen parameters.

The parameter file is the machine-readable part of the freeze; its values are filled at the freeze, and `tests/fixtures/analysis-params-example.json` is a synthetic example for tests only:

```text
prereg, hosts[], queries_sha256, seeds.bootstrap, interval{confidence, resamples}, thresholds{practical_difference, better_numerator, better_denominator},
pool_dev_queries, arms{"<host>-<profile>": {desc_arm, arm_sha256, skills[]}},
trigger{cohort, skills{host: [target skills]}, contrasts[[candidate, base]]},
outcome{cohort, with, without, asset, scenarios{host: [scenario names]}, merged[[scenario names sharing a fix]]}
```

`arms` mirrors `arms.json` (the installed `skills` decide misrouting and host-added loads); `trigger.skills` and `outcome.scenarios` list, per host, what passed the listing and baseline gates, so excluded cells are out of every table. `pool_dev_queries` turns on sensitivity table (v). The result records the SHA-256 of the parameter file, each ledger and `analyze.py`.

## Tests

From the repository root, `uv run --frozen --project evals python -m unittest discover -s evals/tests -t .` runs the detector, scrubber, cohort and gateway-configuration tests (stdlib `unittest`). The fixtures in `evals/tests/fixtures/` are trimmed real control trajectories, one per host and control; the workspace-read and failed-lookup cases are constructed.

## Credential handling

Research notes with sources are private (`.agent-surface/research/2026-11-21-sq0.4/`). Status per host, 2026-11-21:

| Host | Non-interactive mode | Status |
|---|---|---|
| droid | `FACTORY_API_KEY` env | `ready`: the approved Droid key, in use since SQ0.1 |
| opencode | the gateway's Responses endpoint through an `@ai-sdk/openai` provider in `OPENCODE_CONFIG_CONTENT`, key read from `LAB_GATEWAY_KEY` | `ready (gateway)`: the same key; model `gpt-5.5` (Codex moved to `gpt-5.4`, so the two no longer share a model). The free OpenCode model hit its usage limit and was removed. Every request carries `max_output_tokens` 32000 (the model's `limit.output`), because the gateway's upstream caps a gpt-5.5 response at 1000 tokens, reasoning included, when a request sets none |
| claude-code | the gateway's Anthropic Messages endpoint: `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` | `ready (gateway)`: a gateway key on stdin. It requests catalog ids only (`gateway.CLAUDE_MODEL` `glm-5.2`, and the tier variables Claude Code reads), so the requested id is the served model. That model is not an Anthropic one and differs from every Anthropic-model host, so results compare only within the host |
| codex | a provider with `wire_api = "responses"` and `env_key` pointing at the gateway | `ready (gateway)`: the same key. Model `gpt-5.4` (newer models are busy on the gateway); `gpt-5.3-codex` failed 3 of 6 control verifiers in each of two runs (it reported work it had not done), so it is not used. The gateway may swap the model behind an id |
| kiro-cli | `KIRO_API_KEY`, documented for CI/CD; Pro, Pro+, Pro Max or Power only | `needs operator credential`: a paid-tier Kiro API key. Linux-container support is not stated |
| kilo | provider key via `{env:VAR}` in trusted config, or `KILO_API_KEY`; `kilo run --auto` | `needs operator credential`: any supported provider key. No documented keyless model |

No host is `BLOCKED` on terms alone; each has a documented automation mode. Whether a subscription login may be used in automation is the operator's decision, so no subscription token is used.

Ollama Cloud (`OLLAMA_CLOUD_API_KEY`) is documented only for claude-code (`ANTHROPIC_BASE_URL=https://ollama.com`, `ANTHROPIC_AUTH_TOKEN`). It changes the model, so a host comparison that mixes it with other hosts' own models is confounded.

### Injection rule

A secret is read from the stdin of the cohort process (`NAME=value` lines; a bare first line is the Droid key) and handed to the container with `docker exec -e NAME` (the value is in the process environment, not argv). It never goes into an image, a build argument, a scenario folder, an arm tarball, a ledger row or a receipt. Auth files such as `auth.json` are not copied into containers.

### Gateway hosts

OpenCode, Claude Code and Codex reach their model through an OpenAI- and Anthropic-compatible gateway (a LiteLLM proxy) that is only reachable from a lab host on its network. Site details are never committed. Export them from a private file before a run, or the cohort, listing capture and agents fail naming the missing variable:

- `LAB_GATEWAY_URL`: the gateway's base URL;
- `LAB_NO_PROXY`: hosts that bypass any proxy (it must cover the gateway; every container gets it as `NO_PROXY` and `no_proxy`, because containers receive no proxy variables);
- `LAB_BUILD_PROXY`: optional proxy for image builds (npm, apt, GitHub), default for `images.py build --proxy`.

The key is `LAB_GATEWAY_KEY=...` on stdin (`docker exec -e`; the Codex provider's `env_key`, Claude Code's `ANTHROPIC_AUTH_TOKEN` and OpenCode's `{env:LAB_GATEWAY_KEY}` read it inside the container). Every key the cohort holds is also an injected secret for the receipt scan of every attempt.

The ledger's `model` is the requested id. The gateway answers with the id that was requested, so the served model is visible only in the gateway's response headers, not in the host's record. `cohort.py` therefore probes every host at the cohort's start and end (`evals/served.py`): one non-streaming request on the host's own wire (Messages for claude-code, Responses for codex and opencode), with the host's model id and key, to the same gateway address, read from `x-litellm-model-name`, the deployment id `x-litellm-model-id` and the provider's `llm_provider-x-account-deployment`. Droid has no gateway; a throwaway container of its host image runs `droid exec -o stream-json` and the init event's model is taken, or null with a reason. The result is `cohort.json` in the output directory (per host: `start`, `end`, `poolable`, `why`) and the ledger field `served_model` (the start value's model name). A host whose start and end differ, or a gateway host that named no model at either end, is not poolable; a gateway host that names no model at the start does not start. A resumed cohort keeps its first start. A swap between two probes that ends on the same model is not detectable. Keep the mapping itself in private receipts. The cost Claude Code prints uses its own price table and is not spend; spend is recorded as tokens per attempt, because the key's spend counter is not available.

**Launch failures.** A row with `harbor` and `cli_version` both null means the agent never started. The cell is retried at most three times, each in a fresh job directory (`<name>-a2`, `-a3`, `-a4`), and every attempt keeps its row with its `attempt_no`; a resumed run continues from the last `attempt_no`. A capacity end (`end_reason: capacity`, an upstream 429, quota or overload error in the host's own record) is retried the same way and shares the three retries; its row stays with its `attempt_no`, its loads and reward are never used, and a cell still capacity-ended after its retries gets a `skipped` row. An attempt that started and failed any other way (timeout, host crash, setup failure) is not retried.

**Stops.** A quarantine launches nothing further, not even the remaining arms of a group that has started; those arms get a `skipped` row with `group_incomplete: true`. A spend stop refuses new groups and lets started groups finish. A host stop applies the quarantine rule to one host only: two consecutive setup failures (an exception and no agent time) with the same exception, or three consecutive attempts that reached the agent and ended at the agent cap (`end_reason: timeout`), at the provider's capacity limit (`end_reason: capacity`, retried tries included) or in the same exception, stop that host. Its started groups launch no further arm (`skipped`, `group_incomplete: true`, reason `host stop: ...`), its new groups are refused whole, running attempts finish and other hosts go on. "Consecutive" is by finish order on the host; the ledger's `exception` is the exception type, so two different one-off failures of one type also count as the same.

**Spend stop.** `cohort.py --spend HOST=CAP:RESERVE` (repeatable) is required for `droid` and each gateway host and has no default: the cap and the reserve come from the preregistration. A group is admitted only while spent + RESERVE x (attempts admitted and not finished, the new group included) is at most CAP; a refused group is ledgered as skipped, all its arms. An attempt's spend is `factory_credits` for droid and `tokens_in + tokens_out` for a gateway host; an attempt that reached the agent but has no reading is charged the reserve, one that failed before the agent started is charged nothing.

### Scrubber

```sh
printf 'DROID_API_KEY=%s\n' "$KEY" | PYTHONPATH=$PWD uv run --frozen --project evals \
  python -m evals.scrub [--quarantine DIR] PATH...
```

- Values come only from stdin, one per line, as `VALUE` or `NAME=VALUE` (`NAME` is the label). Values under 8 bytes are refused: they match unrelated bytes.
- Every regular file under each `PATH` is scanned as raw bytes for each value (exact match) and for credential patterns: Anthropic, OpenAI, GitHub, AWS, Google and Factory key prefixes, PEM private-key headers, `Authorization: Bearer` and `x-api-key` header values. Gzip streams, tar and tgz members are scanned decoded too, because the SQ0.1 overlay tarballs are tgz. Other formats are not unpacked; no receipt contains them. Symlinks are not followed.
- A pattern hit carries the sha256 of its matched bytes in memory (an exact-value hit carries none). **Input echoes:** third-party skills and scenario repositories hold credential-shaped placeholders that an agent can read into its trajectory. Before the freeze, `python -m evals.scrub --fingerprint known.json PATH...` scans the arm tarballs and scenario inputs (no secrets involved) and writes the sorted `(pattern, sha256)` list; freeze it with the preregistration. With `--known known.json` (CLI) or `cohort.py --input-fingerprints known.json`, a pattern hit on that list is an input echo: printed as `ECHO ...` and ledgered as `scrub_input_echo` (pattern to count), not a hit. Any other pattern hit and every exact secret-value hit still quarantines and stops the cohort. The match is byte-exact, so an echo with different adjoining characters is a hit (it fails safe).
- Output is `HIT exact|pattern NAME FILE offset=N`, with `archive!member` for archive contents and a count line. It never prints matched bytes.
- With `--quarantine DIR`, a `PATH` with hits is moved into `DIR` (created 0700; the moved path is 0700 or 0600).
- Exit codes: `0` clean, `1` hits, `2` usage error or unreadable file.
- Library: `scrub.scan_receipt(attempt_dir, secrets, quarantine_dir, known=frozenset())` scans one attempt directory, quarantines it on a hit and returns `(hits, input_echoes)`.

### Cohort integration

After each attempt's container is removed and its files are collected, `cohort.finish_attempt` calls `scan_receipt` on the attempt's `jobs/<name>`, `logs/<name>.log` and `tasks/<name>` with every secret it injected (the Droid key for droid attempts; credential patterns are always scanned). A hit moves the receipts to `OUT/quarantine/`, appends a ledger row `status: quarantined` with `hits` and `hit_names` (labels and pattern names, never values) and no verdict, and stops the cohort: no further attempt starts, attempts already running finish and are scanned, and the process exits non-zero. Rows already in the ledger stay. A clean attempt's row carries `receipt_scan: "clean"`. Listing capture scans its copied request bodies and transcripts the same way (`listing.check_clean`). Nothing redacts in place: a leak is quarantined, not edited into looking clean. Run the same scan over the whole `out/` tree before it leaves the lab host.

## Known deviations

- Every Claude Code result before the `.claude/CLAUDE.md` import was added ran without the agent-surface rules (the rules file was installed but never imported). Those results are not comparable with later ones.
- Rows before the token definition above are not comparable across hosts.
