# Evaluation lab (spike)

Runs one scenario on real host CLIs through [Harbor](https://github.com/harbor-framework/harbor) 0.26.0 (pinned in `uv.lock`), one disposable Docker container per attempt, with an arm built by the production installer. First cut for `SQ0.1`; see the [roadmap](../docs/roadmap.md#sq01-runner-and-arm-injection-spike).

Run it on a Linux host with Docker and uv, never on the operator machine.

```sh
# 1. Sources the installer needs, including initialised submodules, with the commit recorded.
rsync -a --exclude .git --exclude evals --exclude node_modules ./ HOST:lab/src/
git rev-parse HEAD | ssh HOST 'cat > lab/src/.source-commit'
rsync -a evals/ HOST:lab/repo/evals/

# 2. Qualify the scenario: the reference solution must score 1 and the untouched state 0.
cd lab/repo/evals
for a in oracle nop; do HARBOR_TELEMETRY=0 uv run --frozen harbor run -p scenarios/dev-fix/spike-01 -a $a -o ../jobs-q --job-name q-$a -y -q; done

# 3. Cohort: 2 hosts x 2 arms x 2 repetitions in seeded order, at most 4 concurrent.
#    The Droid key is read from the first line of stdin and never appears in argv or files.
cd ..; PYTHONPATH=$PWD uv run --frozen --project evals python -m evals.cohort \
  --src ../src --scenario evals/scenarios/dev-fix/spike-01 --out ../out
```

`out/ledger.jsonl` has one row per attempt; `out/jobs/` holds Harbor's result, trajectory and verifier output.

## How an arm is built

- `arms.py` tars the sources (minus `.git`, `evals`, `node_modules`) and, for arm A, removes `skills/dev-fix` and its registry entry.
- The agent subclass in `agents.py` uploads the tarball, then inside the container runs `npm ci --omit=dev` and `node scripts/agent-surface.mjs install --target <host> --scope user --dest $HOME`, first general, then `--category development`.
- MCP wiring is stripped from the host config afterwards, so both arms have the same tools. The installed manifest is saved as `arm-manifest.json` in the trial's agent logs.

## Skill-open detector (spike grade)

`inotifywait -m -r -e open` runs in the container on the installed skills directories. Both hosts read every `SKILL.md` once at startup for the catalogue, so only a second open of the same file counts as a load. SQ0.2 replaces this.

## Scenario

`scenarios/dev-fix/spike-01/` is a Harbor task. The hidden verifier in `tests/` checks the fix and that a regression test was added that fails on the original code.
