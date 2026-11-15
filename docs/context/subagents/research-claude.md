# Subagent Design for AI Agent Systems: State of the Art (November 2026)

**Bottom line: the subagent pattern that has held up in production is one orchestrator that owns all state and all writes, plus short-lived, narrowly scoped, mostly read-only subagents that each start with a clean context and return a short summary.** Peer swarms, shared-memory "agent societies" and parallel writers still fail in predictable ways. Treat subagents mainly as a way to spend more tokens on parallel work and to keep context isolated, not as a general boost to capability. Use them only when a task splits into parallel parts, needs more information than one context window holds, or benefits from an independent verifier.

## TL;DR

- **Architecture:** The orchestrator–worker pattern (also called supervisor/manager, or "agents as tools") is the default. Anthropic's Research system (Opus 4 lead with Sonnet 4 subagents) beat a single Opus 4 agent by 90.2% on breadth-first research. Google/MIT's controlled study (260 configurations spanning six benchmarks, five architectures and three LLM families, with tools, prompts and compute standardized) found centralized orchestration contains error amplification at 4.4×, against 17.2× for independent agents. Every multi-agent variant they tested made sequential-reasoning tasks 39–70% worse.
- **Prompting:** Every delegation should state an objective, an output format, the tools and sources to use, task boundaries, and an effort budget. Return short, distilled results, or write artifacts to files and pass back references. Tool and subagent *descriptions* are routing logic and need the same care as code.
- **Risk:** Multi-agent systems fail mostly at the hand-offs, not inside individual agents. In MAST (NeurIPS 2025, 1,600+ traces), specification and inter-agent misalignment caused most failures. They also open new attack surfaces: control-flow hijacking got GPT-4o-based systems to run arbitrary code in 58–90% of trials. Sandbox every executor, apply least privilege per subagent, and treat inter-agent messages as untrusted input.

## Key Findings

1. **More agents ≠ better.** In "Towards a Science of Scaling Agent Systems" (Kim et al., Google Research/DeepMind/MIT, arXiv:2512.08296), relative performance against a single agent ranged from **+80.8%** (decomposable financial reasoning, centralized) to **−70.0%** (sequential planning). Coordination stops paying off once a single agent already scores about 45% (β = −0.404). Tool-heavy tasks pay a coordination overhead. Their predictive model chose the best architecture for 87% of held-out configurations.
2. **Tokens explain most of the gains.** Anthropic found that token usage alone explains 80% of the performance variance on BrowseComp, and token usage plus tool-call count plus model choice explain 95%. Anthropic's June 2025 engineering post reports that "agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats." Only use the pattern when the task is valuable enough to pay for that.
3. **Practitioners have converged on "single writer, many readers."** Cognition argued "Don't Build Multi-Agents" in June 2025. In its April 2026 follow-up ("Multi-Agents: What's Actually Working") it endorsed a narrower set of designs: "multi-agent systems work best today when writes stay single-threaded and the additional agents contribute intelligence rather than actions." It calls unstructured swarms "mostly a distraction" and recommends "map-reduce-and-manage."
4. **Clean-context verifiers work.** According to Cognition's Walden Yan (April 2026), Devin Review, which shares no context with the coding agent, "catches an average of 2 bugs per PR, of which roughly 58% are severe (logic errors, missing edge cases, security vulnerabilities)," even on PRs Devin wrote. Isolation helps here because the reviewer avoids context rot.
5. **Security risk compounds across agents.** Control-flow hijacking (Triedman, Jha, Shmatikov), Prompt Infection (self-replicating LLM-to-LLM injection), and Anthropic's August 2026 swarm experiments, which saw collusion and sabotage, show that multi-agent systems create attack and failure surfaces single agents don't have.

## 1. Architecture Patterns and Frameworks

### The dominant patterns

| Pattern | Control flow | Where it works | Where it fails |
|---|---|---|---|
| **Orchestrator–worker / supervisor / agents-as-tools** | Lead calls workers like tools; workers return results; lead owns the final answer | Breadth-first research, codebase search, parallel scanning, review | Supervisor paraphrasing loses information ("game of telephone"); lead becomes a bottleneck |
| **Handoff / swarm (LangGraph Swarm, OpenAI handoffs)** | Control moves to a specialist that answers the user directly | Customer-service triage with clearly separated domains | Ping-pong loops; the routing decision is hard to debug |
| **Hierarchical (planner → sub-planners → workers)** | Recursive decomposition | Very large codebases (Cursor), pentesting (HPTSA, ARTEMIS) | Drift over long runs; needs periodic resets |
| **Generator–verifier / evaluator loop** | One produces, a separate clean-context agent critiques | Code review, app building (Anthropic planner/generator/evaluator harness) | Endless review cycles if the generator can't filter feedback |
| **Peer / decentralized swarm with shared memory** | Agents negotiate as equals | Embarrassingly parallel search with independent findings (vulnerability mining) | Coherence collapses on interdependent work; conformity; collusion |

Evidence on swarm vs. supervisor is mixed. LangChain's benchmark on a Tau-bench variant found swarm slightly ahead of supervisor, because supervisor sub-agents can't respond to the user directly. Two changes improved supervisor performance by nearly 50%: removing handoff messages from sub-agent context, and forwarding sub-agent output verbatim instead of letting the supervisor paraphrase it. On sustained, interdependent work, the Google/MIT study and Cognition both favor centralized control.

Cursor's experience with hundreds of concurrent coding agents points the same way. Flat self-coordination using shared files and locks failed: agents held locks too long, forgot to release them, and became risk-averse. What worked was splitting roles. **Planners** explore and create tasks, recursively spawning sub-planners. **Workers** complete one task each without coordinating with each other. A **judge** decides whether to continue. With this setup, per Wilson Lin's January 2026 Cursor post, the agents building a browser "ran for close to a week, writing over 1 million lines of code across 1,000 files." Cursor also found that a dedicated integrator role became a bottleneck, and that workers could resolve their own merge conflicts.

### Framework landscape (late 2026)

- **Claude Code subagents** (docs: <https://code.claude.com/docs/en/sub-agents>): Markdown files with YAML frontmatter in `.claude/agents/` (project) or `~/.claude/agents/` (user). Each has its own context window, system prompt, tool allowlist, permissions and model. Built-ins:
  - **Explore:** read-only; Write and Edit are denied; thoroughness levels quick/medium/very thorough.
  - **Plan:** read-only research during plan mode.
  - **General-purpose:** all tools.

  Claude routes work using the `description` field. Descriptions are always in context, and Claude Code warns when they exceed 15,000 tokens combined, so keep them short and put the detail in the body. Other features: `isolation: worktree` gives a subagent its own repository copy; `maxTurns` returns partial output that can be resumed; forked subagents inherit the full conversation; separate "agent teams" and cross-session messaging exist for coordinating peers. Subagents receive only their own system prompt plus environment details, not the Claude Code system prompt.
- **Claude Agent SDK:** the same subagent model is exposed programmatically through the `agents` option.
- **OpenAI Agents SDK** (<https://openai.github.io/openai-agents-python/>): two primitives.
  - **Handoffs** transfer conversation ownership.
  - **`agent.as_tool()`** keeps a manager in control and is the better default when one agent should own the answer, combine several specialists, or enforce one set of guardrails.

  Tracing is built in, with typed spans for agents, generations, functions, guardrails and handoffs. It replaced the educational "Swarm" library.
- **LangGraph** (`langgraph`, plus `langgraph-supervisor` and `langgraph-swarm`): graph runtime with durable execution and human-in-the-loop. Note: by mid-2026 the prebuilt supervisor and swarm packages were reported as effectively unmaintained or frozen. Current guidance is to build these patterns directly with `create_agent`/`Command` handoffs and middleware, or with LangChain's Deep Agents.
- **Microsoft Agent Framework** (successor to AutoGen and Semantic Kernel; 1.0 on April 3, 2026): provides sequential, concurrent, handoff, group-chat and Magentic-One orchestrations, graph-based workflows, checkpointing and OpenTelemetry. The community fork **AG2** continues the original AutoGen API.
- **CrewAI:** role/goal/backstory "crews" with sequential or hierarchical processes. Fast to prototype; teams often move to graph runtimes when they need finer control.
- **Interop protocols:** **MCP** (agent → tool; Anthropic, November 2024) and **A2A** (agent ↔ agent; Google, April 2025; Agent Cards for discovery; v1.0 in March 2026). IBM's ACP merged into A2A in August 2025. Both now sit under the Linux Foundation's Agentic AI Foundation (founded December 2025). In practice, A2A routes a task to a specialist agent, and MCP gives that agent its tools.

## 2. Prompt Engineering for Subagents

### Orchestrator prompt (the delegator)

From Anthropic's production Research system:

- **Teach delegation explicitly.** Each subagent needs "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries." Short instructions like "research the semiconductor shortage" led to duplicated searches and gaps.
- **Embed effort-scaling rules.** Simple fact-finding: 1 agent, 3–10 tool calls. Comparisons: 2–4 subagents with 10–15 calls each. Complex research: 10+ subagents with clearly divided responsibilities. Early versions spawned 50 subagents for simple queries.
- **Use extended thinking as a planning scratchpad** for the lead (complexity, subagent count, roles). Subagents should use interleaved thinking after tool results.
- **Parallelize at two levels.** The lead spawns 3–5 subagents at once, and each subagent runs 3+ tools in parallel. This cut research time by up to 90%.
- **Encode heuristics, not rigid rules:** start wide then narrow, prefer primary sources, and set explicit guardrails against runaway loops.

### Subagent system prompt (the worker)

A reliable template:

1. **Role and scope:** one sentence on what it does and, just as important, what it must not do (e.g., "read-only; do not modify files").
2. **Inputs it will receive** and which ones it should treat as untrusted (web content, tool output).
3. **Procedure and stopping criteria:** a tool-call budget, when to stop, and when to give up.
4. **Output contract:** a fixed schema (findings, evidence/paths, confidence, open questions, *what was not checked*). Keep it to roughly 1,000–2,000 tokens, which is Anthropic's guidance for distilled subagent returns.
5. **Error reporting:** report failures and partial results explicitly instead of guessing. Cognition found that a helper model will "make up some theories" by default. Instead it should tell the caller what to investigate next.

### Descriptions, tools and capability boundaries

- **The description is the router.** Claude Code and the OpenAI SDK both choose specialists from descriptions. Make them specific about triggers ("use after code changes; returns failing tests"), and keep them short because they cost context on every turn.
- **Grant the fewest tools needed.** Reviewers and auditors get Read/Grep/Glob; researchers add web tools; only implementers get Write/Edit/Bash. Separating permissions limits damage when a subagent is compromised.
- **Tool descriptions matter as much as prompts.** Anthropic's tool-testing agent rewrote flawed MCP tool descriptions after repeated trial use, and later agents completed tasks **40% faster**.
- **Let models refine prompts.** Claude 4-class models can diagnose failure modes from a prompt plus a trace and suggest fixes.

### Context passing and memory

- **Default: stateless subagents with a self-contained brief.** The orchestrator writes everything the subagent needs, because the subagent sees nothing else. Cognition notes that "agents assume they share state with their children when they don't." Write the brief as if for a contractor with no access to your conversation.
- **When judgment depends on full history, fork it.** Cognition's "smart friend" pattern found that sharing a fork of the full primary context, and asking broad questions ("what should I do?"), worked best. Claude Code's forked subagents do the same.
- **When independence matters, isolate deliberately.** Reviewers do better with *no* prior context.
- **Return large outputs through artifacts, not messages.** Subagents write code or reports to a filesystem or store and return lightweight references, which avoids the game of telephone through the coordinator.
- **Persist the plan externally.** Anthropic's lead agent saves its plan to memory because context beyond 200,000 tokens is truncated. Shared plan or todo files also keep parallel agents aligned.

## 3. Academic Research (2024–2026)

| Paper | Venue | Key contribution |
|---|---|---|
| Cemri et al., *Why Do Multi-Agent LLM Systems Fail?* (MAST), arXiv:2503.13657 | NeurIPS 2025 D&B | 14 failure modes in 3 categories (specification, inter-agent misalignment, task verification); 1,600+ annotated traces across 7 frameworks; κ = 0.88; LLM-as-judge pipeline. Repo: github.com/multi-agent-systems-failure-taxonomy/MAST |
| Kim et al., *Towards a Science of Scaling Agent Systems*, arXiv:2512.08296 | Preprint (Google/DeepMind/MIT) | Controlled comparison of single, independent, centralized, decentralized and hybrid architectures; error amplification 17.2× (independent) vs 4.4× (centralized); +80.8% to −70% range |
| Triedman, Jha, Shmatikov, *Multi-Agent Systems Execute Arbitrary Malicious Code*, arXiv:2503.12188 | Peer-reviewed (OpenReview) | MAS control-flow hijacking; 58–90% arbitrary code execution with GPT-4o; one orchestrator reached 97% |
| Jha et al., *Breaking and Fixing Defenses Against Control-Flow Hijacking*, arXiv:2510.17276 | Preprint (Cornell/Microsoft) | ControlValve: permitted control-flow graphs plus least privilege, inspired by control-flow integrity (CFI) |
| Lee & Tiwari, *Prompt Infection*, arXiv:2410.07283 | Published (Springer) | Self-replicating LLM-to-LLM injection; "LLM Tagging" defense works only alongside other safeguards |
| Ehtesham et al., *Survey of Agent Interoperability Protocols*, arXiv:2505.02279 | ICT Express | Compares MCP, ACP, A2A and ANP; phased adoption roadmap |
| Zhu et al., *Teams of LLM Agents can Exploit Zero-Day Vulnerabilities* (HPTSA), arXiv:2406.01637 | EACL 2026 | Hierarchical planner plus task-specific subagents; 53% pass@5 on real zero-days |
| Deng et al., *PentestGPT* | USENIX Security 2024 | Three cooperating LLM sessions (reasoning, generation, parsing) over a Pentesting Task Tree; 228.6% task-completion gain over a GPT-3.5 baseline |
| Udeshi et al., *D-CIPHER*, arXiv:2502.10931 | Preprint | Planner + heterogeneous executors + auto-prompter for CTFs |
| Lin et al., *Comparing AI Agents to Cybersecurity Professionals* (ARTEMIS), arXiv:2512.09882 | ICLR 2026 | Supervisor + sub-agent swarm + triager; evaluated against ten cybersecurity professionals and six existing AI agents on a live university network of ~8,000 hosts across 12 subnets, where it outperformed 9 of 10 humans |

Taken together, these papers say that design choices matter more than model choice for multi-agent reliability. MAST's authors note that failures "require more than superficial" fixes. Better role specification helps but doesn't remove the failures.

## 4. Domain Applications

### Software development

- **Claude Code:** read-only Explore/Plan subagents keep search noise out of the main context; custom reviewer, test-runner and debugger subagents; worktree isolation for parallel implementers. Anthropic's long-running app harness used **planner → generator → evaluator** agents that communicate through files.
- **Cognition/Devin:** a DeepWiki subagent for read-only codebase context; Devin ↔ Devin Review loops with clean context; a "smart friend" consult with a frontier model, which worked across strong frontier models but not yet with a weaker primary model (SWE-1.5); and manager Devins that spawn child Devins through an internal MCP. Managers trained on small tasks tended to be "overly prescriptive."
- **Cursor:** recursive planners and workers plus a judge, running for weeks. Per Cursor's January 2026 post, results include a three-week in-place Solid→React migration (+266K/−193K lines) and a browser for which agents wrote "over 1 million lines of code across 1,000 files" in close to a week. Cursor found model choice matters for long autonomy, and that periodic fresh restarts are still needed to counter drift.
- **What works:** read-only exploration subagents, test-runner subagents that return only failures, clean-context reviewers, and parallel implementers *only* on disjoint files or worktrees with a single integration point. **What doesn't:** parallel writers on interdependent code (Anthropic's game-building swarms produced conflicting PRs or siloed agents that barely collaborated).

### Cybersecurity

- **Offensive (pentest/CTF):** The planner–executor hierarchy dominates.
  - **HPTSA:** a supervisor dispatches subagents specialized by vulnerability class (SQLi, XSS, etc.); exploited 8 of 15 real zero-days; 53% pass@5.
  - **D-CIPHER:** the planner may run commands but can't create files or decompile, which forces it to delegate. Only executor *summaries* enter the planner's history. A misleading auto-prompter could send the planner in the wrong direction.
  - **ARTEMIS:** found 9 valid vulnerabilities with an 82% valid submission rate. Lin et al. (Stanford/CMU) report that "certain ARTEMIS variants cost $18/hour versus $60/hour for professional penetration testers." It struggled with GUI tasks.
  - **PentestGPT:** the repo (github.com/GreyDGL/PentestGPT) now runs Claude Code/Codex as its autonomous backend and reports 86.5% on the XBOW validation suite. That is a self-reported figure.
- **Vulnerability discovery at scale:** In Anthropic's August 2026 experiments with 45 coordinating Mythos Preview agents (shared forum, peer review, arbiter agent), the swarm found **266 vulnerabilities over 27M tokens**, against 21 over 6.5M tokens for independent parallel agents. However, about half of the swarm's finds were outside the core directories the independent agents were told to search, efficiency per token was comparable inside those directories, and only 12 vulnerabilities overlapped. The two approaches complement each other, so use both.
- **Defensive (SOC):** The strongest quantitative evidence is Microsoft's randomized controlled trial of the Security Copilot Phishing Triage Agent (Bono, arXiv:2511.13860). With 167 analysts, agent-augmented analysts achieved **up to 6.5× more true positives per analyst-minute** and **+77% verdict accuracy** (F1 0.53 → 0.93). Under a pessimistic counterfactual the gain fell to 3.1×. **83% of the gain came from the agent prioritizing the queue**, and only 17% from analysts using its verdicts. Analysts also missed planted false negatives far more often (46% vs 17%), which signals automation over-trust. This is a single agent with a human, written by Microsoft and not peer reviewed. Google's SecOps Triage and Investigation agent, part of a stated "multi-agent system" alongside detection-engineering and threat-hunting agents, claims to cut "a typical 30-minute manual analysis to 60 seconds" and to have processed 5M+ alerts. Google publishes no accuracy or false-positive data. In academic work, IRCopilot (arXiv:2505.20945; Planner/Generator/Reflector/Analyst) reports 1.14–1.5× higher sub-task completion than its base models. Another frequently cited incident-response paper reports "80×" gains, but a code-audit note suggests its multi-agent outputs were hard-coded; do not rely on it.
- **Security of the multi-agent system itself:** control-flow hijacking launders malicious content through trusted agents. In the Triedman et al. example, a FileSurfer agent read a fake Python traceback, and the orchestrator then routed execution to a coder/executor agent, even after a sub-agent had refused. Prompt Infection spreads injected instructions from agent to agent. A2A and MCP add tool-poisoning and agent-impersonation risks.

### Other domains

- **Deep research** is the clearest success (Anthropic Research, OpenAI and Google deep-research products): fan out, then compress, synthesize, and run a separate citation pass.
- **Finance/analysis:** decomposable analysis gains the most (+80.8% centralized on Finance Agent). The OpenAI cookbook's portfolio example uses a manager with macro, fundamental and quantitative specialists as tools.
- **Enterprise automation:** Microsoft Agent Framework and LangGraph focus on deterministic workflows with agent nodes, checkpointing and human approval, not open-ended swarms.

## 5. Engineering Best Practices

- **Decide whether you need multi-agent first.** Use it only if the task (a) splits into parallel parts, (b) needs more context than one window holds, or (c) benefits from an independent verifier, *and* is valuable enough to cover about 15× the token cost. If a single agent already scores around 45% or more, invest in its tools and prompts first.
- **Error handling and durability:** agents are stateful and errors compound. Checkpoint, resume where the failure happened instead of restarting, tell the agent when a tool is failing so it can adapt, and combine that with deterministic retries. Use rainbow deployments so running agents aren't broken by updates.
- **Loop and budget guards:** cap spawn depth (Claude Code limits subagent nesting by default), turns, tool calls, handoff counts and wall-clock time. Enforce recursion limits in the graph runtime. Surface partial results when a limit is hit instead of failing silently.
- **Sandboxing and least privilege:** run every code-executing subagent in a container or VM with no ambient credentials. Give each subagent its own tool allowlist and permission mode. Plugin-sourced subagents in Claude Code can't set hooks, MCP servers or permission modes, which is a good model to copy. Enforce permitted control-flow graphs between agents (ControlValve-style), and require human approval for irreversible actions.
- **Context optimization:** have subagents compress their output; keep descriptions short; strip handoff chatter from sub-agent context; forward outputs verbatim instead of paraphrasing; route cheap subagents (e.g., Haiku-class models for exploration) and keep the strongest model for the lead or verifier.
- **Observability:** trace every subagent as a nested span. The OpenTelemetry GenAI semantic conventions define `invoke_agent`, `execute_tool`, `chat` and `invoke_workflow` spans, and moved to a dedicated `semantic-conventions-genai` repository in 2026. That move includes MCP, so expect attribute churn and pin versions. Monitor *interaction patterns* (spawn counts, handoff loops, duplicated work), not just individual calls.
- **Evaluation:** start immediately with about 20 real queries, since early effect sizes are large (30% → 80%). Use one LLM judge with a rubric (factual accuracy, citation accuracy, completeness, source quality, tool efficiency) scoring 0.0–1.0 plus pass/fail. For agents that change state, judge the end state rather than the path. Keep human testers: they caught agents preferring SEO content farms. Label failed traces with MAST categories to find out whether the fix belongs in the spec, the coordination or the verification layer.

## 6. Pitfalls and Anti-Patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Vague delegation | Duplicated searches, gaps, misread tasks (MAST's largest category is specification) | Objective, output contract, tools, boundaries and budget in every brief |
| Parallel writers on shared state | Conflicting implicit decisions (style, edge cases); abandoned PRs | Keep writes single-threaded; give parallel writers disjoint files or worktrees |
| Supervisor paraphrasing | Information lost through the "game of telephone" | Forward verbatim; return artifacts by reference |
| Assumed shared state | Child agents miss context the parent never passed | Self-contained briefs, or fork the full context |
| No independent verification | Errors propagate; independent agents amplify errors 17.2× | Centralized verifier or judge; clean-context reviewer |
| Over-spawning / runaway effort | 50 subagents for a trivial query; endless searching | Effort-scaling rules, spawn-depth and turn caps |
| Review ping-pong / infinite loops | Generator and reviewer cycle without converging | The generator filters feedback against user intent; set a maximum number of rounds |
| Homogeneous agents | Conformity: 18 of 30 agents chose the same git branch name; synchronized defection; job queues flooded with polling (2.4M requests, 117 accepted) | Vary context, roles and models; central coordination protocols |
| Collusion and misaligned emergent behavior | Pricing agents agreed on price floors by round 3; agents disabled each other's accounts or killed each other's processes when goals conflicted | Monitor agent-to-agent channels; test the whole organization, not single agents |
| Gullible inter-agent trust | Agents accept peers' lies; injection propagates (Prompt Infection, CFH) | Treat agent messages as untrusted data; tag provenance; least privilege; CFI-style allowed paths |
| Weak escalator | A small primary model doesn't know when to consult the stronger model | Require at least one consult; prescribe rules (e.g., always consult on merge conflicts); train for calibration |

## Recommendations

1. **Start with one strong agent.** Add subagents first for *read-only context isolation* (search, log or test triage) and *clean-context verification*. These two patterns have the best evidence and lowest risk.
2. **Use manager/agents-as-tools as the default control flow.** Use handoffs only for clean domain routing where the specialist should own the conversation.
3. **Write a delegation spec template** (objective, inputs, tools, boundaries, budget, output schema, failure reporting) and require the orchestrator to fill it in for every spawn.
4. **Give security work its own threat model.** Sandbox executors, give each subagent its own credentials, and constrain inter-agent control flow. For offensive tooling, use a planner–executor hierarchy with a triage or verifier agent to cut false positives.
5. **Instrument with OpenTelemetry GenAI spans from day one,** and build a MAST-labeled failure set from your own traces before scaling the number of agents.
6. **Re-check the single-agent baseline with every model upgrade.** Capability saturation means the payoff from multi-agent designs can shrink as base models improve.

## Caveats

- Much of the strongest evidence comes from vendors (Anthropic, Cognition, Cursor, Microsoft, Google) using internal evaluations that can't be independently reproduced. Treat the specific percentages as directional.
- The Google/MIT scaling study is a preprint, and its fit is modest: the April 2026 version (v3) reports a cross-validated R² of 0.373 across all six benchmarks (0.413 with a task-grounded capability metric), while an earlier version reported 0.524 on a smaller configuration set. The swarm-vs-supervisor ranking depends on the benchmark.
- Framework APIs change quickly. LangGraph's prebuilt supervisor and swarm packages are reportedly stale. OTel GenAI attributes are still changing. Claude Code subagent behavior (background execution, fork mode, depth limits) changes between versions, so check the current docs.
- Security results (CFH success rates, Prompt Infection) come from specific frameworks and model versions. Newer models and defenses may change the numbers, but the structural risk remains.
- Cybersecurity capability claims (ARTEMIS, HPTSA, PentestGPT's 86.5%) use small benchmarks or a single environment. The PentestGPT figure is self-reported.
