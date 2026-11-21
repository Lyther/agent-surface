# Evaluation lab (spike)

Runs one scenario on real host CLIs through [Harbor](https://github.com/harbor-framework/harbor) 0.26.0 (pinned in `uv.lock`), one disposable Docker container per attempt, from an image that holds the host CLI, with an arm rendered by the production installer extracted into its HOME. Steps `SQ0.1` to `SQ0.4`; hosts are OpenCode, Droid, and Claude Code and Codex through a gateway; see the [roadmap](../docs/roadmap.md#sq01-runner-and-arm-injection-spike).

Run it on a Linux host with Docker and uv, never on the operator machine. Cap `--cpus` and `--memory` on every container; the runner defaults to 1 CPU and 2 GB per attempt (`--cpus`, `--memory-mb`). Safe concurrency per host is under Capacity.

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

# 4. Cohort: scenarios x hosts x profiles x repetitions in seeded order; --concurrency attempts at once (see Capacity).
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
- **Profiles** (`arms.PROFILES`): `dev-minus-dev-fix` and `dev` (the `development` category without and with `dev-fix`), `full` (general, `external`, then `development,cybersecurity,private`) and `full-minus-dev-fix`. A profile without `dev-fix` renders from a hard-linked copy of the sources with that skill and its registry entries removed; the checkout is never edited. The ledger's `profile` is one of these; `desc_arm` names the description variant (`A`, the committed descriptions) and is separate.
- **A rendered directory has no absolute path in it**: the same arm rendered at two different paths differs only in the manifest's `generated_at`, so each arm is packed once (`arms.pack`: sorted, owner 0, mtime 0) and its sha256 goes in `arms.json` and in the ledger as `arm_sha256`.
- **Host images** (`images.py build`): the pinned base (`node:22-bookworm` by digest) plus `inotify-tools`, `procps` and the host CLI at its pinned version. One capped build container (2 CPUs, 3 GB), committed as `sq-host/<host>:<cli version>`; `hosts.json` records tag, image ID, base and script digest. No installer, no overlay, no profile.
- **An attempt** writes a Harbor task whose `environment.docker_image` is the host image (`write_task`). A scenario with its own `environment/Dockerfile` that starts from the shared base is built once on top of the host image (`images.py scenarios`, tag `sq-scn/<scenario>:<host>`) and the attempt's task points at that image, so no attempt builds anything. The classic builder is used because only it applies `--memory` and `--cpu-quota` to build steps; building the same scenario for another host reuses cached layers. The agent classes in `agents.py` upload the arm tarball (`SQ_ARM_TARBALL`, checked against `SQ_ARM_SHA256`), extract it into HOME and copy the manifest and skill list into the logs before the agent starts; the Harbor setup time is that step.
- **Operator steps the installer only documents.** Claude Code loads the rules document through an `@agent-surface/rules.md` import in `~/.claude/CLAUDE.md`, a file the installer never writes (`adapters/claude-code/README.md`). The operator's profile has that line, so `arms.add_operator_files` writes `.claude/CLAUDE.md` with exactly it into every Claude Code arm; a capture confirms the rules text is then in the request (`rules_in_request`). OpenCode, Droid and Codex write their own instruction files, so no other host needs one.
- Files are packed with a fixed mtime (2026-01-01), not epoch 0: with epoch-0 files OpenCode and Claude Code reopened the whole skills directory during the run, which the audit saw as dozens of opens.
- `images arms` checks every rendered arm: `dev-fix` present or absent as the profile says, `full` containing `dev`, and each `-minus-dev-fix` profile differing from its parent by exactly `dev-fix`.

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

- OpenCode: a forwarding proxy (`capture_proxy.py`, request headers never saved) keeps the model request; the skills are the `<available_skills>` block of its system prompt. This works when the free model is rate limited.
- Droid: its session transcript holds the first context message, an "Available skills" reminder.
- Claude Code and Codex: the same proxy, pointed at the gateway (plain HTTP, so `capture_proxy.py` selects its connection class by the upstream scheme). Claude Code lists `- name: description` lines after a marker in a system-role message; Codex lists them under `### Available skills` in the developer message.

Each installed skill is classified `surfaced`, `name-only` or `absent`, with `truncated` when the shown description is a shortened prefix. Skills the host adds itself are listed as `not_installed_but_listed`.

## Ledger

One row per attempt: `scenario`, `profile`, `desc_arm`, `host`, `model`, `rep`, versions, `source_commit`, `arm_sha256`, `image_id` (the host image), times (`seconds_setup` is the arm upload and extraction), cost fields, `verifier_reward`, `skills_loaded`, `load_evidence` (skill to mechanism), `audit_loads`, `workspace_skill_reads`, `failed_skill_lookups`, `audit_disagreements`, `skill_files_scanned`, `dev_fix_installed`, `receipt_scan`, `model_requests`, `seconds_env` (Harbor's environment start), `cpus`, `memory_mb` and `concurrency` (the run's container caps and parallelism), and `purpose` when the run was not outcome data (`timing-probe`, `capacity-ramp`; such rows stay out of every outcome analysis).

`tokens_in` is the whole prompt, summed over the attempt's model requests, for every host; `tokens_cache` is its cached part (so uncached input is the difference) and `tokens_out` the output. Codex reports that sum directly; for Claude Code and Droid `tokens_in` is the uncached input plus cache reads and writes (Droid's `model_requests` is its turn count). Rows written before this definition used host-specific meanings (Claude Code's `tokens_in` excluded cache reads); normalised values are in a private receipt, and old receipts are not rewritten. `hosts.json` holds one record per host image and `arms.json` one per host and profile (tarball, sha256, source commit, installed skills).

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
- F13 and F14 also need the installer's registered skill packs and the machine state CI provides. `submodules.txt` pins the pack commits, fetched at image build, and the Dockerfile provisions browsers, a digest-pinned uv (0.12.17, copied from the official image) and the repository's own MCP launchers. That is the only network step; verification is offline.
- `tests/world.py` (a copy of `evals/world.py`; keep them identical) grades the world in scratch copies, as `qa`, with four stages that all run:
  1. `weakening`: no base test file deleted, no drop in assertion calls, no added skip markers, `tests/run.mjs` still runs every base suite;
  2. `suites`: the affected existing suites pass on the agent's tree;
  3. `regression`: `tests/check_regression.mjs`, a standalone check extracted from the fix's regression assertions that is never shipped with the task and does not depend on wording the bug report did not give;
  4. `discriminate`: at least one test file the agent added or changed fails on the pre-fix source and passes on the agent's tree.
- `tests/test.sh` writes reward 1 only when every stage holds; `/logs/verifier/world.log` shows which failed.
- `solution/solve.sh` applies the real fix (`fix.patch`) and its regression test (`tests.patch`). `solution/solve-code-only.sh` applies the code alone; it is a qualification fixture, and the verifier must score it 0.

Qualify a task with oracle (1), nop (0) and a copy of the task whose `solve.sh` is `solve-code-only.sh` (0). The apt packages are not pinned, so the built image ID is what makes an environment reproducible; the IDs used for qualification are in the SQ0.6 receipts. Limits: assertion counting is textual, so an assertion rewritten in place is not caught; stage 4 accepts any failure on the pre-fix tree, including a missing export.

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

## Tests

From the repository root, `uv run --frozen --project evals python -m unittest discover -s evals/tests -t .` runs the detector, scrubber, cohort and gateway-configuration tests (stdlib `unittest`). The fixtures in `evals/tests/fixtures/` are trimmed real control trajectories, one per host and control; the workspace-read and failed-lookup cases are constructed.

## Credential handling

Research notes with sources are private (`.agent-surface/research/2026-11-21-sq0.4/`). Status per host, 2026-11-21:

| Host | Non-interactive mode | Status |
|---|---|---|
| droid | `FACTORY_API_KEY` env | `ready`: the approved Droid key, in use since SQ0.1 |
| opencode | free OpenCode models, no key (ran in SQ0.1 with `opencode/deepseek-v4.1-flash-free`) | `ready`: the model is pinned and time-limited; only DeepSeek V4.1 Flash Free is documented as zero-retention, so send no confidential data to the others |
| claude-code | the gateway's Anthropic Messages endpoint: `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` | `ready (gateway)`: a gateway key on stdin. The gateway maps Claude model ids to other models, so this host runs a non-Anthropic model that differs from every Anthropic-model host: results are confounded with the model and compare only within the host |
| codex | a provider with `wire_api = "responses"` and `env_key` pointing at the gateway | `ready (gateway)`: the same key. Model `gpt-5.5`; `gpt-5.3-codex` failed 3 of 6 control verifiers in each of two runs (it reported work it had not done), so it is not used. The gateway may swap the model behind an id |
| kiro-cli | `KIRO_API_KEY`, documented for CI/CD; Pro, Pro+, Pro Max or Power only | `needs operator credential`: a paid-tier Kiro API key. Linux-container support is not stated |
| kilo | provider key via `{env:VAR}` in trusted config, or `KILO_API_KEY`; `kilo run --auto` | `needs operator credential`: any supported provider key. No documented keyless model |

No host is `BLOCKED` on terms alone; each has a documented automation mode. Whether a subscription login may be used in automation is the operator's decision, so no subscription token is used.

Ollama Cloud (`OLLAMA_CLOUD_API_KEY`) is documented only for claude-code (`ANTHROPIC_BASE_URL=https://ollama.com`, `ANTHROPIC_AUTH_TOKEN`). It changes the model, so a host comparison that mixes it with other hosts' own models is confounded.

### Injection rule

A secret is read from the stdin of the cohort process (`NAME=value` lines; a bare first line is the Droid key) and handed to the container with `docker exec -e NAME` (the value is in the process environment, not argv). It never goes into an image, a build argument, a scenario folder, an arm tarball, a ledger row or a receipt. Auth files such as `auth.json` are not copied into containers.

### Gateway hosts

Claude Code and Codex reach their model through an OpenAI- and Anthropic-compatible gateway (a LiteLLM proxy) that is only reachable from a lab host on its network. Site details are never committed. Export them from a private file before a run, or the cohort, listing capture and agents fail naming the missing variable:

- `LAB_GATEWAY_URL`: the gateway's base URL;
- `LAB_NO_PROXY`: hosts that bypass any proxy (it must cover the gateway; every container gets it as `NO_PROXY` and `no_proxy`, because containers receive no proxy variables);
- `LAB_BUILD_PROXY`: optional proxy for image builds (npm, apt, GitHub), default for `images.py build --proxy`.

The key is `LAB_GATEWAY_KEY=...` on stdin (`docker exec -e`; the Codex provider's `env_key` and Claude Code's `ANTHROPIC_AUTH_TOKEN` read it inside the container). Every key the cohort holds is also an injected secret for the receipt scan of every attempt.

The ledger's `model` is the requested id. The gateway answers with the id that was requested, so the served model is visible only in the gateway's response headers, not in the host's record; keep that mapping in private receipts. The cost Claude Code prints uses its own price table and is not spend; spend is recorded as tokens per attempt, because the key's spend counter is not available.

### Scrubber

```sh
printf 'DROID_API_KEY=%s\n' "$KEY" | PYTHONPATH=$PWD uv run --frozen --project evals \
  python -m evals.scrub [--quarantine DIR] PATH...
```

- Values come only from stdin, one per line, as `VALUE` or `NAME=VALUE` (`NAME` is the label). Values under 8 bytes are refused: they match unrelated bytes.
- Every regular file under each `PATH` is scanned as raw bytes for each value (exact match) and for credential patterns: Anthropic, OpenAI, GitHub, AWS, Google and Factory key prefixes, PEM private-key headers, `Authorization: Bearer` and `x-api-key` header values. Gzip streams, tar and tgz members are scanned decoded too, because the SQ0.1 overlay tarballs are tgz. Other formats are not unpacked; no receipt contains them. Symlinks are not followed.
- Output is `HIT exact|pattern NAME FILE offset=N`, with `archive!member` for archive contents and a count line. It never prints matched bytes.
- With `--quarantine DIR`, a `PATH` with hits is moved into `DIR` (created 0700; the moved path is 0700 or 0600).
- Exit codes: `0` clean, `1` hits, `2` usage error or unreadable file.
- Library: `scrub.scan_receipt(attempt_dir, secrets, quarantine_dir)` scans one attempt directory, quarantines it on a hit and returns the hits.

### Cohort integration

After each attempt's container is removed and its files are collected, `cohort.finish_attempt` calls `scan_receipt` on the attempt's `jobs/<name>`, `logs/<name>.log` and `tasks/<name>` with every secret it injected (the Droid key for droid attempts; credential patterns are always scanned). A hit moves the receipts to `OUT/quarantine/`, appends a ledger row `status: quarantined` with `hits` and `hit_names` (labels and pattern names, never values) and no verdict, and stops the cohort: no further attempt starts, attempts already running finish and are scanned, and the process exits non-zero. Rows already in the ledger stay. A clean attempt's row carries `receipt_scan: "clean"`. Listing capture scans its copied request bodies and transcripts the same way (`listing.check_clean`). Nothing redacts in place: a leak is quarantined, not edited into looking clean. Run the same scan over the whole `out/` tree before it leaves the lab host.

## Known deviations

- Every Claude Code result before the `.claude/CLAUDE.md` import was added ran without the agent-surface rules (the rules file was installed but never imported). Those results are not comparable with later ones.
- Rows before the token definition above are not comparable across hosts.
