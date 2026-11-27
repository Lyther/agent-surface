# ab01: Droid with and without the full install (WIP)

Paused on 2026-11-27. The run, the preregistered analysis, a probe of why no skill loaded and a probe of stronger skill rules are done; the next step waits on the operator (below). Not for merge.

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

## Fixed for a rerun

- The detector missed `Skill` calls made inside Droid's `Script` tool, which is how `gpt-6-sol` loaded them. b2a28dd counts the `tools.<Name>({...})` calls in a script. Re-running it over all 116 ab01 attempts gives the same verdicts, since deepseek made no `Script` call.
- Web tools were on: 11 of 20 SWE-bench Pro attempts in each arm fetched their task's upstream repository, which holds the fix, almost always with `FetchUrl`. 2f7c4be removes `FetchUrl` and `WebSearch` in every arm; Droid's `--list-tools` shows both blocked. Shell network access stays, because tasks install packages.

## Rule probe

Option A below asked whether a stronger rule gets deepseek to choose skills unprompted. `rule_probe.py` builds three arms from the full arm that differ only in the skill rule in `.factory/AGENTS.md`:

- R0: ab01's sentence, line 244 of 267: "Always pick the suitable skills that fit your current task." The rebuilt arm is byte-identical to ab01's.
- R1, in its place: "Before your first tool call on any task, check the skill list for skills whose description matches the task and load each match with the Skill tool before doing anything else. Do this even for small or simple tasks; skip it only when no skill matches."
- R2: R1's section moved to the top of the file.

Eight tasks with a matching skill: the `calc.py` fix from the skill probe, five Terminal-Bench 2 tasks and two SWE-bench Pro tasks from ab01. Each runs 2 reps per arm, 48 attempts in all, in seeded random order, 6 at a time. Each attempt runs the task's ab01 image with the lab's droid command, web tools removed, for 300 s, with no verifier. Loads come from `evals/detect.py`. The scrubber found no key and no pattern hit in the 192 files.

| | Attempts with a load | Fisher p vs R0 | Attempts without a load whose reasoning mentions skills |
|---|---|---|---|
| R0 | 0/16 | | 0/16 |
| R1 | 4/16 | 0.10 | 6/12 |
| R2 | 6/16 | 0.018 | 3/10 |

- Loads by task:
  - `calc.py`: dev-fix (R1 2/2, R2 2/2);
  - db-wal-recovery: ctf-forensics (R2 2/2);
  - vulnerable-secret: ctf-reverse or solve-challenge (R1 2/2, R2 1/2);
  - break-filter-js-from-html: ctf-web (R2 1/2).
  - None loaded on git-leak-recovery, query-optimize, or the ansible and flipt tasks.
- Every load fit its task and came within the first three tool calls; no lookup failed.
- The wording changed the behavior. Under R0 the model never mentioned skills. Under R1 and R2 it loaded a skill or reasoned about one in 19 of 32 attempts. When it went without, the reasoning read like "Let me consider skills like `dev-feature`, …" before moving on. Placement made no clear difference: R2 against R1, p 0.70.
- Every skill that loaded has a "Use when" clause in its description. dev-feature, qa-measure and verify-performance match the SWE-bench Pro and query-optimize tasks, have no such clause, and never loaded. lint-python and lint-go have one but did not load on the Python and Go tasks, and neither did ctf-forensics on git-leak-recovery.
- Not tested: R0's sentence at the top, other models, and whether a load changes the outcome.

## Open decision

- A (recommended; the probe supports it):
  - The operator decides whether `rules/tool.md` takes R1's wording and whether the Skills section moves first.
  - The operator decides whether skill descriptions without a "Use when" clause get one; that is a skill change with its own workflow.
  - Then ab02 reruns ab01's 28 tasks with three arms (none, full, and full with the new rule), web tools removed and the fixed detector. At ab01's size it detects only large effects: ab01's interval half-width was about 9 pp.
- B: rerun on `gpt-6-sol`, which already chooses skills.
- C: ship a lighter Droid install, since the full catalogue costs about 42% more prompt tokens and went unused under the current rule.

## Files

The scripts ran from `~/ab01` on a Linux lab host, with `~/ab01/repo` holding this branch's `evals/`; the rule probe ran from `~/ab02`, with `~/ab02/repo` at 2f7c4be plus the probe scripts. Keys go from the host's secret file to a process's stdin and reach containers only through `docker run -e` or `docker exec -e`. Receipts (ledgers, job folders, probe outputs) stay private.

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
| Probe skill rules | `rule_probe.py`, `rule-probe.sh` (lab host, detached), `rule_probe_summary.py` |
