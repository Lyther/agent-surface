# Concept Zero Research: Skill Quality and Distribution

Status: evidence ledger for [concept-zero.md](concept-zero.md)
Last updated: 2026-11-20
Baseline: `main` at `f93fda4` (2026-11-15)

Method: four research passes on 2026-11-20 (obra/superpowers, eval runners, host skill triggering, native distribution), each from primary pages and the GitHub/npm APIs, plus internal receipts. `UNVERIFIED` marks a claim no primary page confirmed. Third-party measurements are labelled as such and never treated as vendor fact. Facts about hosts and tools are as fetched on 2026-11-20 and must be re-read before an implementation depends on them.

## Evidence Ledger

### Internal

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-01` | Do installed agent-surface skills load during real tasks? | [roadmap GR2](../roadmap.md#gr2-native-task-and-category-roi); `.agent-surface/research/2026-10-18-gr2-arms/` | 2026-10-18; headless Droid 0.244.0 | 36 attempts across raw, general and general-plus-development arms: no agent-surface skill body was loaded; the only skill call was a Droid built-in. Droid listed MCP tools as names in a deferred catalog, so Grimoire's instructions never reached the model. | high | Surfacing and triggering are unproven; probe surfacing before comparing wordings. |
| `E-02` | How are canonical descriptions written? | `skills/*/SKILL.md` on `main` | 2026-11-15 | 62 canonical skills (ops 11, stellaris 9, workflow 8, dev 7, verify 6, lint 6, qa 5, boot 5, arch 3, ship 2); 2 descriptions contain "Use when", the rest state what the skill does ("Apply the minimal effective patch that restores functionality."). 410,835 bytes in total. | high | Baseline arm for the description experiment. |
| `E-03` | How large is the distribution layer? | `scripts/`, `adapters/` on `main` | 2026-11-15 | 10,612 lines of `.mjs` under `scripts/`; `install.mjs` 2,306, `targets.mjs` 2,027, `check.mjs` 1,339; 28 adapters (26 install targets plus exports). Each host receives its own copy of every selected skill. | high | Scope of the distribution decision. |
| `E-04` | How reliable is it? | peer QA rounds 1–5 on the three open branches (2026-11-19/20); full-distribution procedure | 2026-11-18 to 2026-11-20 | Every QA round found installer defects (permission widening, read-only repair failure, provisioning refusal, prune behaviour). On 2026-11-18 a partial run of the ordered installs removed the external packs from 26 targets: 21,613 deletions for a one-line change. | high | Delegation candidates; regression risk of any migration. |
| `E-05` | Is there an accepted evaluation method? | [grimoire-evaluation contract](../contracts/grimoire-evaluation.md) | 2026-10-16 | Freeze source, models, harness, budgets, scorer and decision criteria before outcomes; paired observations; failed and aborted attempts stay in the denominator; one run is exploratory; official task verifiers; SkillsBench and existing runners are reuse candidates; no new benchmark platform or scorer. | high | Binding method for this program. |
| `E-06` | Is there a reusable harness? | `.agent-surface/research/2026-10-18-gr2-arms/` (`arm.sh`, `cohort.sh`, `schedule.py`, `analyze.py`, preregistrations, `c1-ledger.jsonl`) | 2026-10-18 | One fresh container per attempt from the task's Dockerfile; each arm installed by agent-surface into a fresh HOME; per-attempt credit stop under a 10M-credit cohort cap; ledger and analysis scripts retained privately. | high | Arm materialisation and ledger conventions to reuse. |
| `E-07` | What did the last real development flow teach? | `.agent-surface/dev-flow-feedback.md` | 2026-11-05 | Single-family reviewers missed disjoint bug classes (Sonnet and a GPT reviewer each found defects the other missed); self-critique missed input-shape bugs; review findings were lost to compaction; headless host acceptance with a random marker was the strongest proof. | medium (one flow) | Refinement hypotheses for `qa-review`, `qa-self-critique` and workflow roles. |
| `E-08` | Which hosts can run unattended here? | memory note on host runtime state (2026-11-15); dev-flow feedback | 2026-11-15 | Runnable: Claude Code 2.1.322 (VS Code-OSS binary), Codex, Droid, OpenCode 2.2.7 (free models), Kiro CLI 2.37.0, Kilo 7.8.27 (editor binary). Blocked: Antigravity CLI (account 403), Trae CLI (logged out), Kimi Code (plan pending), Grok Build and Cursor (login). Not installed but installable: Copilot CLI, Qwen Code, Qoder CLI, Cline, Deep Agents. Isolated homes start logged out. | medium (re-check) | Host scope of the first cohorts; credential spike. |
| `E-09` | Is there one default development path? | canonical skill list | 2026-11-15 | Seven `dev-`, five `qa-`, six `verify-` and eight `workflow-` skills with overlapping triggers; no single documented default route. | high | Default-path goal. |

### obra/superpowers

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-10` | Project vitals | [GitHub API](https://api.github.com/repos/obra/superpowers) | v7.0.2, 2026-11-03 | 322,421 stars, about 44 contributors, MIT; a release every two to four weeks; contributions through a `dev` branch; maintainer-stated 94% PR rejection rate (`AGENTS.md`). | high | Context, not authority. |
| `E-11` | What does it ship? | repository `main` at `22f0b46` | 2026-11-03 | 15 skills, 167,861 bytes; no commands or agents directories; descriptions written as triggers ("Use when …"); one SessionStart hook injects the 3.2 KB `using-superpowers` body on startup, clear and compact. | high | Comparison scope. |
| `E-12` | How does it test skills? | `skills/writing-skills/` and references | 2026-11-03 | Skill authoring as test-first: a baseline run without the skill records the agent's rationalisations, the skill addresses them, re-tests look for new loopholes; behavioural evals live in a separate repository and are not in CI; in-repo tests cover plugin plumbing (79 files). | high | Method reference for the eval lab. |
| `E-13` | Known problems | issues [#1152](https://github.com/obra/superpowers/issues/1152), [#275](https://github.com/obra/superpowers/issues/275), [#414](https://github.com/obra/superpowers/issues/414), [#2231](https://github.com/obra/superpowers/issues/2231), [#2460](https://github.com/obra/superpowers/issues/2460) | 2026 | Subagent-per-task development consumed a whole five-hour Codex budget on a simple plan; Windows hook failures; open skill safety bugs (destroying uncommitted work, printing a secret; titles only). | medium | What not to adopt. |
| `E-14` | How does it distribute? | README and per-host manifests | 2026-11-03 | One shared `skills/` and `hooks/` with a thin native manifest per host family (about 12), no build step, versions synced by one script; one install command per host; carries skills and the hook only, no MCP configuration or always-on rules. | high | Reference pattern for native distribution. |

### Evaluation runners

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-15` | Claude Code's native plugin eval | [plugin-evals docs](https://code.claude.com/docs/en/plugin-evals.md) | Claude Code ≥ 2.1.269 | With-plugin and without-plugin arms, 1–50 runs, graders `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` and `baseline`, `costUsd`, `--max-cost-usd`, a temporary HOME per run. No git-state or test-result grader; `scaffold_script` runs unsandboxed; a description A/B needs two plugin copies. | high | Secondary runner for Claude Code. |
| `E-16` | Anthropic's skill-creator | [skill-creator SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) | undated | With-skill and without-skill runs, grader subagents, benchmark mean ± standard deviation; trigger loop of about 20 queries (should-trigger and near-miss), three runs each, 60/40 train/test split, up to five iterations. Claude Code only. | high | Trigger-eval method to adapt. |
| `E-17` | Quorum (superpowers-evals) | [GitHub API](https://api.github.com/repos/prime-radiant-inc/superpowers-evals) | last push 2026-10-21 | Drives Claude, Codex, Antigravity, Gemini, Hermes, Kimi, OpenCode, Pi and Copilot; HOME isolation only ("not a sandbox"); no license declared. | high | Reference design only. |
| `E-18` | Harbor | [harbor-framework/harbor](https://github.com/harbor-framework/harbor) | v0.26.0, 2026-11-13 | Apache-2.0; 57 installed-agent adapters including claude_code, codex, gemini_cli, goose, opencode, qwen_code, kimi_code, cursor_cli, copilot_cli, grok_build, antigravity_cli, openhands and pi (no Droid); container per attempt, local Docker or remote providers; `-k` attempts, `-n` concurrency. Per-arm skill injection and result fields UNVERIFIED. | medium | Primary cross-host runner, after a spike. |
| `E-19` | BenchFlow and SkillsBench | [benchflow](https://github.com/benchflow-ai/benchflow), [skillsbench](https://github.com/benchflow-ai/skillsbench) | BenchFlow 0.9.3 stable, 0.10.0rc5 (2026-11-18); SkillsBench push 2026-11-16 | Apache-2.0; Claude Code, Codex, Gemini CLI and OpenHands over ACP, plus goose and qwen-code; verifier in a separate sandbox; `--skill-mode with-skill` and `--skills-dir`. GR2 used 0.6.3. | medium | Fallback runner and task source; version drift to re-verify. |
| `E-20` | Inspect AI with inspect_swe | GitHub API | 0.3.291 and 0.3.2, 2026-11 | Docker or Kubernetes sandboxes; agent coverage and skill injection UNVERIFIED. | low | Not selected. |
| `E-21` | promptfoo agent providers | [promptfoo docs](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/) | not checked | Centred on the Claude Agent SDK; documented as not a sandbox. | low | Not selected. |

### Skill surfacing and triggering

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-22` | Vendor description guidance | [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); [agentskills.io specification](https://agentskills.io/specification) | 2026-11-20 | A description states what the skill does and when to use it, in third person, 1–1024 characters; the vendor examples put a what-clause before "Use when …". | high | Adds a what-plus-when arm beside the user's trigger form. |
| `E-23` | What drives triggering? | [agentskills.io optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions) | 2026-11-20 | "The description carries the entire burden of triggering"; imperative wording and erring towards being pushy; agents consult skills only for tasks they cannot easily do alone, so one-step requests may not trigger. | high | Use realistic multi-step queries. |
| `E-24` | Claude Code skill listing | [Claude Code skills docs](https://code.claude.com/docs/en/skills) | 2026-11-20 | Every name is listed; descriptions share a budget of 1% of the context window and overflow drops whole descriptions, least-invoked first; `skillListingBudgetFraction` or `SLASH_COMMAND_TOOL_CHAR_BUDGET` raise it; one entry is capped at 1,536 characters. | high | Confounder and a lever: raising the budget adds context, it does not cut it. |
| `E-25` | Codex skill listing | [Codex skills docs](https://learn.chatgpt.com/docs/build-skills) | 2026-11-20 | Listing capped at 2% of the context window (8,000 characters when unknown); descriptions are shortened first, then skills omitted with a warning; `skills.max_context_tokens` raises it to at most 10,000 tokens. | high | Same as `E-24`. |
| `E-26` | How many descriptions survive at scale? | [third-party lab run](https://dev.to/rulestack/with-160-skills-installed-claude-code-kept-20-descriptions-and-the-model-found-0-of-3-skills-that-10j2) | Claude Code 2.1.289 | 160 skills of about 1,000 characters each: 20 kept their descriptions; name-only skills were invoked in 0 of 3 requests. Third-party, tiny sample. | low | Measure our own listing (about 100 skills installed). |
| `E-27` | What moves trigger rates? | third-party articles (search snippets only) | UNVERIFIED | A session-start hook raised firing from 15% to 62%; pushy wording added 5.2 points pooled, from three of six skills. | low | Hypothesis for a rule or hook arm, not a fact. |
| `E-28` | Superpowers' "description trap" | `skills/writing-skills/references/discovery.md`, release notes | anecdote | A description that summarised a workflow was followed instead of the body (one review instead of two). | low | Grade body-only steps, not only invocation. |
| `E-29` | Other hosts' selection | [Gemini CLI](https://geminicli.com/docs/cli/skills/), [Cursor](https://cursor.com/docs/context/skills), [OpenCode](https://opencode.ai/docs/skills/), [Droid](https://docs.factory.com/cli/configuration/skills) | 2026-11-20 | Gemini activates through `activate_skill` with user approval (headless behaviour UNVERIFIED); Cursor and Droid route on the description; OpenCode lists only permitted, described skills. Qwen Code, Kimi Code and Copilot mechanics UNVERIFIED. | medium | Per-host surfacing probes. |

### Distribution

| ID | Claim / question | Source | Date / version | Finding | Confidence | Impact |
|---|---|---|---|---|---|---|
| `E-30` | Is there a cross-host plugin format? | [Agent Plugins specification](https://agent-plugins.org/specification) | 1.0.0; publication date from secondary sources only | `plugin.json` at the root; `skills/` and `mcp.json` standardised; hooks, agents, commands and rules left to vendor namespaces. Copilot, Codex, Cursor and Kiro document adopting it. | medium | Candidate canonical package. |
| `E-31` | Which hosts have plugin managers? | per-host docs (matrix below) | 2026-11-20 | Claude Code, Codex, Cursor, Copilot CLI, Droid, Qwen Code, OpenCode (code plugins), Antigravity, Kiro (powers), Windsurf, Goose, Pi and Grok Build have one; Kilo and Cline do not; Kimi Code's sources conflict. | medium | Native route coverage. |
| `E-32` | Is there a shared skill location? | Codex, OpenCode, Kilo, Goose and Windsurf docs; [skills CLI agent table](https://github.com/vercel-labs/skills/blob/main/docs/agents.md) | 2026-11-20 | `.agents/skills` or `~/.agents/skills` is read natively by Codex, OpenCode, Kilo, Goose and Windsurf, and at project level by Copilot and Cursor; global paths differ elsewhere. | medium | Replace per-host copies where read. |
| `E-33` | What can a Claude Code plugin carry? | [plugins reference](https://code.claude.com/docs/en/plugins-reference) | 2026-11-20 | Skills, commands, agents, hooks, MCP servers and more; not always-on rules (a plugin-root `CLAUDE.md` is not loaded) and not permissions. | high | Rules and settings stay with the installer on Claude Code. |
| `E-34` | Existing cross-host tools | [vercel-labs/skills](https://github.com/vercel-labs/skills) v1.9.0 (MIT); [rulesync](https://github.com/dyoshikawa/rulesync) v43.11.0 (MIT); ruler v0.3.46 (beta); [add-mcp](https://github.com/neon-solutions/add-mcp) v2.6.1 (Apache-2.0) | 2026-11 | `skills`: about 75 agents, skills only, lockfile, telemetry opt-out. rulesync: about 55 targets, rules, MCP, commands, subagents, skills, hooks and permissions; orphan sweep by diffing directories against sources, no per-file ownership manifest. add-mcp: 25 agents, MCP only, no ownership tracking. | medium | Partial adoption candidates. |
| `E-35` | Does any tool match our guarantees? | same as `E-34` | 2026-11-20 | None documents per-file ownership with owned-only pruning, MCP merges that keep the operator's own fields and sibling entries, and provisioning of first-party services. rulesync's behaviour on operator-edited files needs a code read. | medium | Keep a thin custom layer for these guarantees. |
| `E-36` | Does `skills` keep our guarantees? | vercel-labs/skills v1.9.0 (`50894c1`) source: `remove.ts`, `installer.ts`, `add.ts`, `telemetry.ts` | 2026-11-20 | Ownership is per skill directory, through lockfiles. Project removal has a hash guard; global and named removal delete whole directories without one. Install removes the target directory and copies, without checking the lock, so an unmanaged skill of the same name is replaced (`-y` skips the prompt). The default is a canonical copy in `.agents/skills` with symlinks. Telemetry goes to skills.sh unless `DISABLE_TELEMETRY` or `DO_NOT_TRACK` is set. It covers 23 of our 28 adapters, skills only. Owned-only pruning: partial. Refusing an unclaimed overwrite: no. MCP merge: no. Provisioning: no. | high (code read) | Not a replacement. Its shared-copy layout informs `SQ5.4`. |
| `E-37` | Does rulesync keep our guarantees? | dyoshikawa/rulesync v43.11.0 (`cca7206`) source: `lib/orphan-sweep.ts`, `types/dir-feature-processor.ts`, `features/shared/shared-config-gateway.ts` | 2026-11-20 | No manifest. The opt-in `--delete` sweeps by diffing directories against the current run, so operator files inside a managed directory can be deleted. It writes over paths without a claim check. MCP: unowned top-level keys survive and JSONC edits keep comments, but the owned server map is rebuilt from source, so operator entries under it are dropped, and TOML comments are lost. No telemetry found. It covers 21 of our 28 adapters. Owned-only pruning: no. Refusing an unclaimed overwrite: no. MCP merge: partial. Provisioning: no. | high (code read) | Candidate C stays rejected; the custom ownership and merge layer stays. |

## Host Capability Matrix

What a native plugin can carry on each researched host (S skills, C commands, A subagents, H hooks, M MCP, R always-on rules). Rows for dsh, pool, qoder, the trae family, openhands, zed and deepagents were added on 2026-11-20 by `SQ5.1`, and items marked UNVERIFIED need a live host check.

| Host | Plugin manager | Carries | Shared skill location |
|---|---|---|---|
| claude-code | plugins and marketplaces | S C A H M; not R | not confirmed |
| codex | plugins, marketplace catalogs | S M H (desktop, trusted) | `.agents/skills`, `~/.agents/skills` |
| cursor | plugins (Cursor and Agent Plugins formats) | S C A H M R (Cursor format) | `.agents/skills` (project) |
| copilot (CLI) | plugins and marketplaces | S M plus A H C R in its namespace | `.agents/skills` (project) |
| droid | plugins and marketplaces | S C A H M; not R | not confirmed |
| qwen-code | extensions | S C A M plus a context file | not confirmed |
| opencode | code plugins | programmatic tools, hooks, agents, commands | `.agents/skills`, `.claude/skills` |
| antigravity, antigravity-cli | plugins | S M A R H | `.agents/skills` (project) |
| kiro | powers | S M | not confirmed |
| windsurf | plugins | S R H M A | `.agents/skills`, `~/.agents/skills`; reads AGENTS.md |
| goose | plugin namespace | S | `.agents/skills`, `~/.agents/skills` |
| kimi-code | resolved: Kimi Code `/plugins install, enable, disable, remove` (local directory, ZIP or GitHub URL); the legacy Python kimi-cli plugins carry tools only | S A C H M, plus a system prompt that acts as R | `~/.agents/skills` |
| pi, grok-build | plugins | UNVERIFIED | pi: `.agents/skills` |
| kilo, cline | none | — | kilo: `.agents/skills`, `~/.agents/skills` |
| qoder | `qoder plugins install, update, uninstall, enable, disable`; marketplaces from a git URL, `owner/repo` or a local directory | S C A H M; not R | not documented |
| openhands | SDK and CLI `/plugin install, enable, disable, uninstall`; no update | S C A H M | `.agents/skills`, `~/.agents/skills`, AGENTS.md |
| dsh | Cordis modules loaded from a patch file; no install, update or uninstall commands | tools; MCP through a bundled client; other kinds UNVERIFIED | `.dsh/skills`, `.agents/skills`, `~/.dsh/skills`, `~/.agents/skills`; AGENTS.md chain |
| zed | extensions | M only | UNVERIFIED |
| pool | none found (docs partly read) | — | `.poolside/skills`, `~/.config/poolside/skills`, `.agents/skills`, `~/.agents/skills`; AGENTS.md |
| trae, trae-cn | none documented | — (native skills, rules and MCP files) | `.agents/skills` read, `.trae/skills` preferred on a clash (UNVERIFIED) |
| trae-cli | UNVERIFIED: two products share the name | UNVERIFIED | `.traecli/skills` (one report) |
| deepagents | none found | — | UNVERIFIED |

Plugin lifecycle commands, as fetched on 2026-11-20:
- **claude-code:** `claude plugin install, update, uninstall, enable, disable` per scope, plus `claude plugin marketplace add, update, remove`; there is no update-all command.
- **codex:** `codex plugin add, remove`, plus `codex plugin marketplace add, upgrade, remove`; this syntax is UNVERIFIED against the reference page.
- **cursor:** through the editor UI only.
- **kiro:** no update or uninstall command is documented.

## Superpowers Skill Map

Closest agent-surface counterpart for each Superpowers skill, and the comparison question each pairing raises. `diagnosing-superpowers` is out of scope by user decision.

| Superpowers skill | Closest agent-surface asset | Overlap | Comparison question |
|---|---|---|---|
| using-superpowers | `00-precedence-and-safety` (Wired Services line), `boot-workflow` | partial | Does an explicit "check skills first" rule raise triggering on our hosts? |
| brainstorming | `ops-ask`, `boot-concept`, `dev-spec` | partial | Intent discovery and question selection before building. |
| writing-plans | `workflow-boss`, `arch-roadmap` | partial | Task granularity, exact paths and verification per task. |
| executing-plans | `dev-feature`, `workflow-orchestrator` | partial | Inline execution checkpoints. |
| subagent-driven-development | `workflow-orchestrator`, `ops-flow` | partial | Fresh implementer plus reviewer per task, against its cost (`E-13`). |
| dispatching-parallel-agents | `ops-swarm`, `workflow-orchestrator` | partial | Independence of parallel packets. |
| test-driven-development | `dev-spec`, `dev-fix`, `06-test-policy` | strong | Red-first discipline and rationalisation handling. |
| systematic-debugging | `qa-trace`, `dev-fix`, `boot-repro` | partial | Root-cause phases, condition-based waiting, polluter search. |
| verification-before-completion | `verify-test`, `verify-prove`, `verify-readiness`, Truthful Reporting | strong | Evidence before completion claims. |
| requesting-code-review | `qa-review`, `workflow-reviewer` | strong | Severity gating and reviewer briefing. |
| receiving-code-review | `02-agent-workflow` Reviews section (no skill) | gap | Accept or push back on findings with evidence. |
| using-git-worktrees | rules and memory only | gap | Isolated workspace set-up and clean-up. |
| finishing-a-development-branch | `ship-commit` command, `ship-artifact`, `05-tooling` Git section | partial | Merge, PR, keep or discard, and clean-up after authorisation. |
| writing-skills | `skill-forge`, `skill-review` (external packs) | partial | Eval-backed skill authoring. |
