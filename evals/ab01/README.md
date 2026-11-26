# ab01: Droid with and without the full install (WIP)

Paused on 2026-11-26. The run, the preregistered analysis and a probe of why no skill loaded are done; the next step waits on the operator's decision (below). Not for merge.

## Design

[`prereg.json`](prereg.json) is the preregistration frozen before any outcome, with four deviations appended. Its `inputs/<file>` paths are the files in this folder, with the same sha256. Droid 0.244.0 runs `deepseek-v4.1-flash` on 28 qualified tasks (18 Terminal-Bench 2, 10 SWE-bench Pro), 2 reps each. The `none` and `full` arms of each (task, rep) run at the same time on the same host, so the install is the only variable. The lab code is this branch's `evals/`: the run started on 685a14e, and deviation 4 re-ran the four pytorch-model-recovery cells on 2cf2298. The lab host also ran unrelated CPU-bound jobs: load median 38, max 81, on 16 CPUs.

## Results

Pass@1 over 56 pairs; a missing reward counts as a failure.

| | none | full | full − none [95% CI] | McNemar p |
|---|---|---|---|---|
| All (56 pairs) | 82.1% | 76.8% | −5.4 pp [−14.3, +3.6] | 0.51 |
| Terminal-Bench 2 (36) | 75.0% | 63.9% | −11.1 pp [−22.2, 0.0] | 0.29 |
| SWE-bench Pro (20) | 95.0% | 100% | +5.0 pp [0.0, +15.0] | 1.0 |

- Prompt tokens: +630K per attempt [+52K, +1.53M] (mean 1.41M to 2.00M). Factory credits: +4.0K [−0.9K, +10.0K]. Turns, agent time and output tokens: intervals include 0.
- Skill loads: 0 in both arms.
- End reasons: none 51 exit, 4 timeout, 1 error; full 52 exit, 4 timeout. The error is dna-insert `none` rep 1, a Docker fault in the verifier, kept as a failure per the prereg.
- Exploratory, that pair dropped (55 pairs): −7.3 pp [−16.1, 0.0], p 0.29.

## Why no skill loaded

The skills were installed and visible; the model never chose one, so this run measured the install as extra prompt context, not as skills in use.

- Installed: every full-arm attempt had the 75 skills, and Droid opened each `SKILL.md` at startup in all 44 attempts the file watcher covered.
- Visible: asked without tools, the model listed all 75 by name; the `none` arm listed only Factory's 21 built-ins. Droid's `Skill` tool says "Use a relevant skill proactively", and `rules/tool.md` says "Always pick the suitable skills that fit your current task."
- Works on request: "Use the dev-fix skill. …" produced a `Skill(dev-fix)` call, and the model followed the skill (a regression test first, then "PASS (was FAIL)").
- Not chosen unprompted: on a task that paraphrases dev-fix's trigger, `deepseek-v4.1-flash` and `claude-sonnet-5` never called `Skill` and never mentioned skills in their reasoning; `gpt-6-sol` loaded `dev-fix` and `lint-python` through Droid's `Script` tool. In the benchmark, deepseek considered skills in 4 of 58 full-arm attempts and went without each time, e.g. "The task is small … Keep it simple and do the work directly."

## Known problems for a rerun

- `evals/detect.py` counts top-level `Skill` calls and `SKILL.md` reads, not `Skill` calls made inside `Script`, which is how `gpt-6-sol` loaded them. deepseek made no `Script` call in 122 attempts, so ab01 is unaffected.
- Web tools were on: 11 of 20 SWE-bench Pro attempts in each arm fetched their task's upstream repository, which holds the fix. It is equal across arms but inflates those pass rates.

## Open decision

- A (recommended): test whether a stronger rule, such as "Before the first edit, activate the skill whose Use-when clause matches the task", gets deepseek to choose skills unprompted. If it does, rerun with that rule, web tools removed and the detector fixed.
- B: rerun on `gpt-6-sol`, which already chooses skills.
- C: ship a lighter Droid install, since the full catalogue costs about 42% more prompt tokens and goes unused.

## Files

The scripts ran from `~/ab01` on a Linux lab host, with `~/ab01/repo` holding this branch's `evals/`. Keys go from the host's secret file to a process's stdin and reach containers only through `docker run -e` or `docker exec -e`. Receipts (ledgers, job folders, probe outputs) stay private.

| Step | Files |
|---|---|
| Sample SWE-bench Pro tasks | `sample_swepro.py` |
| Build task images | `bench-build.sh`, `bench-one.sh` |
| Qualify tasks (oracle 1, nop 0) | `qual.sh`, `qualify.py` |
| Fingerprint inputs for the scrubber | `fingerprint.sh`, `fingerprint.py`, output `input-fingerprints.json` |
| Run the cohort | `run.sh`; `start-full.sh` (full run with a load sampler); `poll-full.sh` (operator side, `AB_HOST=<lab host>`) |
| Accept a run's ledger | `check_pilot.py` |
| Analyse | `ab_analyze.py` |
| Probe deviation 4 | `dash-probe.sh` (droid), `parse-probe.sh` (codex and claude CLIs, parse only) |
| Probe skill use | `skill_presence.py`, `skill-probe.sh`, `skill-probe2.sh`, `skill_probe_summary.py`, `skill_mentions.py` |
