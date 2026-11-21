# Evaluation lab (spike)

Runs one scenario on real host CLIs through [Harbor](https://github.com/harbor-framework/harbor) 0.26.0 (pinned in `uv.lock`), one disposable Docker container per attempt, from an image that holds the host CLI and an arm built by the production installer. Steps `SQ0.1` to `SQ0.4`; hosts are OpenCode, Droid, and Claude Code and Codex through a gateway; see the [roadmap](../docs/roadmap.md#sq01-runner-and-arm-injection-spike).

Run it on a Linux host with Docker and uv, never on the operator machine. Cap `--cpus` and `--memory` on every container; the runner uses 1 CPU and 2 GB per attempt and at most 4 attempts at once.

```sh
# 1. Sources the installer needs (submodules initialised), commit recorded, one overlay tarball per source variant.
rsync -a --exclude .git --exclude evals --exclude node_modules ./ HOST:lab/src/
git rev-parse HEAD | ssh HOST 'cat > lab/src/.source-commit'
rsync -a evals/ HOST:lab/repo/evals/
#    overlay-A.tgz (dev-fix dropped) and overlay-B.tgz come from arms.build_overlay; overlay-*.json holds their identity.

# 2. Build one image per host and arm (about 3 minutes for 6 images), then check it against the reference manifests.
cd lab/repo; PYTHONPATH=$PWD python3 -m evals.images build --out ../out --scenario evals/scenarios/dev-fix/spike-01 --overlay-dir ../overlays
PYTHONPATH=$PWD python3 -m evals.images verify --out ../out --reference ../sq01

# 3. Cohort: scenarios x hosts x arms x repetitions in seeded order, at most 4 concurrent.
#    The Droid key is read from the first line of stdin and never appears in argv or files.
cd evals; PYTHONPATH=$PWD/.. uv run --frozen python -m evals.cohort --images ../../out/images.json \
  --scenario scenarios/controls/use-by-name --scenario scenarios/controls/no-skill --arms B --out ../../out-controls

# 4. Listing capture for every image.
cd ..; PYTHONPATH=$PWD python3 -m evals.listing capture --images ../out/images.json --out ../listing
```

`ledger.jsonl` has one row per attempt; `jobs/` holds Harbor's result, trajectory and verifier output.

## Arm images (`images.py`, `arms.py`)

- `arms.py` tars the sources (minus `.git`, `evals`, `node_modules`) and, for arm A, removes `skills/dev-fix` and its registry entry. Arm F is B's sources with the operator's full profile: general, `external`, then `development,cybersecurity,private,modding`.
- `images.py build` starts one capped build container (2 CPUs, 3 GB) from the scenario image, installs the pinned host CLI, runs the production installer (`install --target <host> --scope user --dest $HOME`, general first, then each category), commits the result as `sq-arm/<host>-<arm>:<overlay sha>` with labels for host, arm, CLI version, overlay and commit, and records the image ID in `images.json`. The overlay tarball is bind-mounted, so it is not in a layer.
- The installer builds Synapse and Grimoire as the prerequisite of wiring them and has no switch to skip that. The build script strips the wiring (the host config's MCP entries and Droid's Synapse hook), the launchers in `~/.local/bin`, and the services' `node_modules` and `dist`, so no arm has MCP tools and nothing tries to start a service. Anything else MCP-related the installer cannot skip stays in the overlay directory, which only the image holds.
- `images.py verify` compares each image's installed manifest (target, source, output, version, category per entry) with the SQ0.1 arm manifest and lists whether `dev-fix` is installed.
- An attempt writes a Harbor task whose `environment.docker_image` is the image (`write_task`), so Harbor starts a fresh container with a pristine HOME and does no build. The agent classes in `agents.py` only check that the image's manifest is present.

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

One row per attempt: `scenario`, `arm`, `host`, `model`, `rep`, versions, `source_commit`, `overlay_sha256`, `image_id`, times (`seconds_setup` is now the check of the prebuilt image), cost fields, `verifier_reward`, `skills_loaded`, `load_evidence` (skill to mechanism), `audit_loads`, `workspace_skill_reads`, `failed_skill_lookups`, `audit_disagreements`, `skill_files_scanned`, `dev_fix_installed`, `receipt_scan`. `images.json` holds one record per image (tag, image ID, base image ID, CLI version, overlay, dropped skills).

## Scenarios

`scenarios/dev-fix/spike-01/` is a Harbor task. The hidden verifier in `tests/` checks the fix and that a regression test was added that fails on the original code.

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

A secret is read from the stdin of the cohort process (`NAME=value` lines; a bare first line is the Droid key) and handed to the container with `docker exec -e NAME` (the value is in the process environment, not argv). It never goes into an image, a build argument, a scenario folder, an arm overlay, a ledger row or a receipt. Auth files such as `auth.json` are not copied into containers.

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
