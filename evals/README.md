# Evaluation lab (spike)

Runs one scenario on real host CLIs through [Harbor](https://github.com/harbor-framework/harbor) 0.26.0 (pinned in `uv.lock`), one disposable Docker container per attempt, from an image that holds the host CLI and an arm built by the production installer. Steps `SQ0.1` to `SQ0.3`; see the [roadmap](../docs/roadmap.md#sq01-runner-and-arm-injection-spike).

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

Installed means listed in the attempt's `arm-skills.txt`. `~` and `$HOME` are expanded; a relative path resolves against the call's working directory (Droid records it, OpenCode does not) or a single leading `cd DIR &&`, and a path that cannot be resolved counts only when the audit shows the installed file opened after the scan. A skill-tool call for a name that is not installed is recorded in `failed_skill_lookups`, not as a load. Every other `SKILL.md` read, such as the repository's own `skills/` in a scenario workspace, is recorded in `workspace_skill_reads`, an exposure covariate that is never a load.

The audit (`inotifywait -m -r -e open`, each event stamped by `stamp.py` with sub-second epoch time) counts opens after `startup_end`: OpenCode's first event of any kind (its scan ends about 2 s earlier), Droid's first tool call (its scan ends within 0.1 s of the first reasoning event). It sees a file read, and for OpenCode's skill tool a directory open, but not Droid's `Skill` tool, which opens no file. `verdict` lists each disagreement between record and audit with its cause; the ledger keeps them in `audit_disagreements`.

Controls are Harbor tasks under `scenarios/controls/`: `use-by-name` (tells the agent to use `dev-fix`), `use-by-file` (names the skill file; `{skill_file}` is filled per host) and `no-skill`. The verifier of the first two needs a heading that is only in the skill body, so reward 1 also shows the body reached the model.

## Listing capture (`listing.py`)

Per image, in a fresh capped container with one trivial prompt:

- OpenCode: a forwarding proxy (`capture_proxy.py`, request headers never saved) keeps the model request; the skills are the `<available_skills>` block of its system prompt. This works when the free model is rate limited.
- Droid: its session transcript holds the first context message, an "Available skills" reminder.

Each installed skill is classified `surfaced`, `name-only` or `absent`, with `truncated` when the shown description is a shortened prefix. Skills the host adds itself are listed as `not_installed_but_listed`.

## Ledger

One row per attempt: `scenario`, `arm`, `host`, `model`, `rep`, versions, `source_commit`, `overlay_sha256`, `image_id`, times (`seconds_setup` is now the check of the prebuilt image), cost fields, `verifier_reward`, `skills_loaded`, `load_evidence` (skill to mechanism), `audit_loads`, `workspace_skill_reads`, `failed_skill_lookups`, `audit_disagreements`, `skill_files_scanned`, `dev_fix_installed`, `key_files_remaining`. `images.json` holds one record per image (tag, image ID, base image ID, CLI version, overlay, dropped skills).

## Scenarios

`scenarios/dev-fix/spike-01/` is a Harbor task. The hidden verifier in `tests/` checks the fix and that a regression test was added that fails on the original code.

## Tests

`cd /tmp/as-wt-lab && uv run --frozen --project evals python -m unittest discover -s evals/tests -t .` runs the detector tests (stdlib `unittest`). The fixtures in `evals/tests/fixtures/` are trimmed real control trajectories, one per host and control; two further cases are constructed.
