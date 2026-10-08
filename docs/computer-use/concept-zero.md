# Concept Zero: A Computer for Existing Agent Harnesses

Status: PROPOSED
Last updated: 2026-10-08
Scope: agent-surface first; MOMO as the downstream consumer. Separate from the runtime-refresh batch in [docs/context/concept-zero.md](../context/concept-zero.md).
Inputs: MOMO/peer#3's exploration (2026-10-08), cross-checked against the official sources below; MOMO's working tree as read on 2026-10-08.

## Executive Decision

Give the harnesses agent-surface already configures a disposable computer instead of building or adopting a new agent. The first rung is a browser computer: the upstream AIO Sandbox container, digest-pinned, bound to loopback with its API key set, running next to the application under test. The harness reaches its Chromium through the already-shipped Playwright MCP attached over CDP, and a human watches and takes over through its noVNC view. A desktop rung (Cua Driver in a Cua Linux desktop or a macOS VM) is added when an operator-selected task demonstrates a concrete capability, usability or efficiency benefit over the existing tools. Its first task is the Antigravity IDE qualification moved here from the runtime-refresh roadmap. agent-surface contributes:

- one usage skill (interface order, observation budget, takeover, reset, evidence);
- a computer-use probe in the existing `workflow-runtime` qualification;
- after the trials, only the service configuration they justify.

Grok Bot and ChatGPT Dots stay reference products. The operator has access but chose not to run them (USER_DECISION, 2026-10-08), and neither exposes a task API, so the trials measure our harnesses against today's blocked state. The OpenAI Agents API is not run either. MOMO builds nothing until the trials show a recurring responsibility. Its accepted AIO packaging plan is the later home for workers that run inside the computer.

Not included:

- a custom agent loop, VM manager or streaming stack;
- desktop control of the operator's own machine (this effort uses a disposable computer);
- HTTP MCP support in agent-surface;
- a production fleet.

## Problem and Evidence

Agents working for the operator can read and write code and run commands, but they cannot reliably operate graphical software. They cannot confirm what a rendered page shows, finish a flow that leaves the browser, or keep an interactive application alive across follow-ups while a human can step in. Consumer products now ship persistent cloud computers with takeover. The question is whether our own harnesses, given a computer, finish more of our real tasks with fewer interventions at acceptable time and cost.

| ID | Claim | Evidence (read 2026-10-08) | Confidence | Impact |
|---|---|---|---|---|
| E-01 | MOMO workers run unattended in auto-approve mode with the operator's HOME, SSH identities and cloud credentials; MOMO calls this "OPERATOR-TRUSTED, not sandboxed". | MOMO `src/momo/configs/runtime_commands.yaml:22-35` | high | A computer a worker controls must be a separate disposable environment, never the host desktop. |
| E-02 | Image input is declared in MOMO only for Codex with GPT-5 and GPT-5.1 through the gateway. A 2026-10-08 live check of Codex 0.155.1 with `ollama-cloud/kimi-k3` was recorded as not proven: every run also read the image through a tool or decoded it through the shell, a text-only control answered the same way, and its declaration was reverted. | MOMO `modality_routes.yaml:10-21`, `docs/runbook/runtime-qualification.md:121-130`, commits `385ade9`, `befdb81` | high | Image delivery is not computer operation. The vision probe must put its cue only in pixels and run a text-only control. |
| E-03 | MOMO lists Playwright as an optional shell application. Its read-only frontend Playwright spec is untracked and runs in no CI job, and its policy holds that generated screenshots cannot establish Web E2E. | MOMO `applications.yaml:107-111`, `web/acceptance/frontend_batch_spec.py`, `docs/roadmap.md:1136` | high | Frontend acceptance is the first concrete gap. Evidence must come from real runs. |
| E-04 | MOMO's architecture accepts an optional, private, operator-trusted AIO Sandbox image (upstream 1.11.0, native amd64/arm64), after its Web walking skeleton. | MOMO `docs/architecture.md:19, 403, 489, 544` | high | Reuse that environment; do not open a second packaging route. |
| E-05 | agent-surface ships Playwright MCP 0.0.82 with `--isolated --headless`: the profile lives in memory for as long as that browser runs, Playwright also offers an on-disk profile, and there is no view for a human. It also ships Chrome DevTools MCP 1.8.0 and Firefox DevTools MCP. Its optional services accept only stdio servers. | `registry/optional-services.json`, `schemas/optional-services.schema.json` | high | Login state is not the gap. A shared visible browser, human takeover and a computer that outlives the harness connection are, and the CDP-attached configuration tests them. HTTP MCP endpoints are out of reach without new schema and renderer work, and the CDP path does not need them. |
| E-06 | Grok Bot gives each user a persistent cloud computer on Cursor's US cloud, one microVM. All of a user's Bots share it ("not separate security boundaries"), each with its own screen. A human can take control. No public task-control API was found in the reviewed docs and API reference. | [computer-and-apps](https://docs.x.ai/grok-bot/computer-and-apps) (2026-09-14), [security](https://docs.x.ai/grok-bot/security) (2026-09-28), [openapi.json](https://docs.x.ai/openapi.json) | high | Reference only. Shared cookies and credentials across Bots. |
| E-07 | Grok Bot reaches private apps by routing egress through the connected desktop, or through Enterprise setup scripts such as Tailscale. | [private-networks](https://docs.x.ai/grok-bot/private-networks) (2026-09-25) | high | Any cloud computer, including the managed fallbacks, needs a deliberate route to the app under test. |
| E-08 | ChatGPT Dots (beta) has its own cloud computer and browser plus one connected personal computer, with take over and return. Cloud logins are separate from the personal computer. No public API was found in the reviewed docs. Access comes with Pro 100/200/500 (not offered in the EEA, UK or Switzerland), Business Premium or Enterprise (rolling out). | [Dots](https://learn.chatgpt.com/docs/dots), [computers-and-apps](https://learn.chatgpt.com/docs/dots/computers-and-apps), [tasks-and-memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | high | Reference only; the operator has access but chose not to run it. |
| E-09 | The OpenAI Agents API (beta since 2026-09-10) is a managed Codex harness with durable sessions and steering. Its computer use (2026-09-29) is documented as a hosted browser. Self-hosted environments get shell, files and MCP but no computer use. Data residency is US-only, without zero-data-retention. | [overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) | high | Not run; it lacks a desktop and is billed per use. |
| E-10 | Harness-native computer features need an interactive desktop. Claude Code's Chrome integration drives a visible Chrome under a subscription login. Claude Code computer use is a macOS-only, interactive research preview. Codex CLI has no browser; Computer Use exists only in the desktop app. | [Claude Code Chrome](https://code.claude.com/docs/en/chrome), [computer use](https://code.claude.com/docs/en/computer-use), [Codex browser](https://learn.chatgpt.com/docs/browser) | high | Unattended workers get computer tools through MCP, not these features. |
| E-11 | Claude Code caps MCP tool output at 25,000 tokens, images included, and warns at 10,000. A screenshot costs roughly 1,000–1,800 input tokens. | [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Anthropic computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) | high | Observations must be budgeted, not streamed. |
| E-12 | AIO Sandbox 1.11.0 (2026-06-23, Apache-2.0, amd64/arm64) provides Chromium with CDP, a noVNC desktop for takeover, shell and file APIs, and MCP at `/mcp` over streamable HTTP. Without an API key it is open. CDP port 9222 never authenticates, the examples use `seccomp=unconfined`, and there is no reset short of discarding the container. Desktop-level control is documented only for `aio-computer:1.0.1`, a binary on Volcengine's registry. | [repo](https://github.com/agent-infra/sandbox), [docs](https://sandbox.agent-infra.com) | high | Strong browser computer with takeover. The desktop layer needs another route. |
| E-13 | Cua Driver (MIT) controls desktops through MCP, a CLI and SDKs, with accessibility trees and screenshots. On Linux it needs x86_64, X11 and AT-SPI 2. Its default mode lets the agent send input to every app, and a bounded mode is for unattended runs. Telemetry is on by default, and releases are pre-1.0 (0.34.0, 2026-10-05) with heavy churn. | [cua-driver](https://cua.ai/docs/cua-driver), [GitHub](https://github.com/trycua/cua) | high | Desktop-layer candidate, only behind safety flags and pins. |
| E-14 | Cua's Linux image (Ubuntu 24.04, Chromium, Firefox, amd64/arm64) runs under Docker, Podman or QEMU. Its viewer daemon is FSL-1.1-MIT, an optional perception bundle is AGPL, and the docs conflict on whether agent credentials are copied into the sandbox. Pi has no MCP client, so it gets no MCP computer tools; CLI tools such as the Playwright CLI or `cua-driver call` remain open to it. | [local runtimes](https://cua.ai/docs/cua-sdk/guides/local-runtimes), [LICENSING.md](https://github.com/trycua/cua/blob/main/LICENSING.md), [coding agents](https://cua.ai/docs/cua-sdk/guides/coding-agent-options) | high | Use with credential copying disabled; each component's license applies. Pi needs CLI tools instead of MCP. |
| E-15 | E2B Desktop provides cloud Linux desktops with a noVNC stream and pause/resume. Self-hosting is an evaluation package that needs KVM. | [e2b-dev/desktop](https://github.com/e2b-dev/desktop), [pricing](https://e2b.dev/pricing) | high | Fallback if local Docker cannot host the computer. Needs a tunnel to local apps. |
| E-16 | Playwright MCP works from accessibility snapshots, adds screenshots where appearance matters, and can attach to an existing browser over CDP. Its README points coding agents toward the CLI plus skills, but no published token figures back this. Latest MCP is 0.0.83; latest CLI is 0.1.22. | [snapshots](https://playwright.dev/mcp/snapshots), [playwright-mcp](https://github.com/microsoft/playwright-mcp), [playwright-cli](https://github.com/microsoft/playwright-cli) | high | Keep MCP. Measure the CLI before switching. |
| E-17 | On OSWorld-Verified (Aug 2026), the best agent scores about 90% and the best plain model 86%, against a 72% human baseline. On the long-horizon OSWorld 2.0, best strict completion is 20.6% at launch and 48.7% later, at about $25–72 and roughly 100 steps per task. | [OSWorld-Verified](https://osworld-v1.xlang.ai), [arXiv 2606.29537](https://arxiv.org/abs/2606.29537) | medium | Short tasks are credible; long ones are slow and costly. Budget every run. |
| E-18 | Accessibility-tree web agents complete more tasks than screenshot-only agents (WebMall). Screenshot agents take 2.7–4.3× the necessary steps and run tens of minutes where humans need minutes (OSWorld-Human). | [arXiv 2508.13024](https://arxiv.org/abs/2508.13024), [arXiv 2506.16042](https://arxiv.org/abs/2506.16042) | medium | Screenshots expand capability. They are not the default interface. |

## Users and Stakeholders

| Actor | Need | Constraints | Success signal |
|---|---|---|---|
| Operator (single person) | Blocked GUI tasks completed with few interventions | Owns accounts and costs. Handles engagement data that must not leave its environment. | The trials show higher completion and fewer interventions at acceptable time and cost. |
| Harness worker (Codex, Claude Code, Kilo, OpenCode, Grok Build) | Computer tools inside its existing MCP model | Tool-output caps; image support proven per model (E-02, E-11); Pi has no MCP client (E-14) | Passes the vision probe, then completes the trials. |
| MOMO Global | Progress, a material obstacle, or the result | Supervises Tasks, not clicks (MOMO `global_prompt.py:6-16`) | Needs no new supervision protocol. |
| Human taking over | Live view, control, and a clean handback | Neither AIO nor the noVNC view arbitrates input between human and agent (E-12). | Completes the blocked step without corrupting the agent's state. |
| App under test (first: MOMO Web) | Reachable from the computer | `momo-service` binds 127.0.0.1 (MOMO `service/src/momo_service/__main__.py:44`). | Reached without public exposure. |

## Goals, Non-Goals, and Constraints

| ID | Type | Statement | Evidence |
|---|---|---|---|
| G-01 | goal | An existing harness gets a usable browser and, when a task needs it, a Linux desktop, through agent-surface's existing install path. | User direction via peer#3; E-05 |
| G-02 | goal | The harness uses the most effective interface per step: API or CLI, then DOM or accessibility, then screenshot or desktop input. Visual checks always look at the rendered result. | E-16, E-18 |
| G-03 | goal | The computer survives follow-ups and resets on request. A human can watch, take over and hand back. | peer#3; E-12 |
| G-04 | goal | Task-shaped trials measure our harnesses against today's blocked state, recording completion, interventions, time, usage, environment cost, output and identities. Grok Bot and Dots are documented reference experiences, not runs. | peer#3; USER_DECISION 2026-10-08 |
| G-05 | goal | MOMO's minimal integration (worker assignment, viewer link, artifact retention) is decided from trial evidence. | peer#3 |
| N-01 | non-goal | No custom agent loop, VM manager, streaming stack or new orchestration level. | Adopt-first |
| N-02 | non-goal | No GUI control of the operator's own desktop in this effort; the spike uses a disposable local computer. | USER_DECISION (local, browser-first); E-01 |
| N-03 | non-goal | No programmatic Grok Bot or Dots integration while neither has a task API. | E-06, E-08 |
| N-04 | non-goal | No MOMO module, service or API before the trials justify one. | peer#3 |
| N-05 | non-goal | No benchmark chasing, production fleet, multi-tenant isolation or mobile devices. | Scope |
| C-01 | constraint | agent-surface stays a compiler and installer: pinned stdio services, skills and docs. It does not run the environment. | E-05 |
| C-02 | constraint | A local disposable environment is selected for this spike, and comparator runs are omitted at the operator's preference. The operator's existing resource authorization applies. | USER_DECISION 2026-10-08 |
| C-03 | constraint | The data-handling obligations of the chosen workload and the license of each chosen component apply (E-14 notes FSL and AGPL parts in Cua). | E-14 |
| C-04 | constraint | PROPOSAL for the spike setup: every computer port (API, noVNC, CDP, MCP) binds to loopback or a private network, with authentication where the component offers it. | E-12 |
| C-05 | constraint | Results name the harness and version, the model and route, and the environment image digest, so a stronger model is not mistaken for a better computer. | peer#3 |

## Unacceptable Outcomes

| Outcome | Why it matters | Prevention / detection |
|---|---|---|
| Agent input reaches the operator's real desktop or logged-in accounts | Workers act unattended with real credentials (E-01). | The computer is a disposable container. Host desktop control is outside this effort (N-02). |
| Untrusted page content steers an agent that holds host credentials | Web content can inject instructions, and an agent running outside the computer keeps its host shell. | Trusted local targets only, for agents that run outside the computer. Untrusted browsing runs agent-inside, without host credentials. |
| An exposed, unauthenticated VNC, CDP or MCP port | AIO is open without a key, and CDP never authenticates (E-12). | Loopback binding, API key set, a check before every run (C-04, proposed). |
| Credentials copied into a shared computer | Cua may copy agent credentials into its sandbox; Grok Bots share cookies (E-14, E-06). | Credential copying disabled. A fresh computer per engagement. No personal logins. |
| Screenshot loops that burn tokens without finishing more tasks | Screenshot agents are slow and costly (E-17, E-18). | Interface order (G-02), per-run budgets, observation counts recorded. |
| A comparison that credits the environment for a stronger model | It would steer MOMO's integration wrongly. | Identities recorded (C-05); the same prompts and success checks for every route. |
| Infrastructure built ahead of evidence | The batch exists to avoid that. | N-01 and N-04; trials gate every addition. |

## Glossary

| Term | Meaning |
|---|---|
| Computer | A disposable environment with a graphical session, a browser, a shell and files, controlled by one agent at a time. |
| Surface | One browser context or desktop screen assigned to one worker. |
| Agent outside / agent inside | The harness runs on the host and reaches the computer's tools remotely, or runs inside the computer itself. |
| Takeover | A human controls the surface while the agent waits, then hands back. |
| Observation | Anything the harness reads back: an accessibility snapshot, a DOM excerpt, a screenshot or a crop. |
| Reference product | Grok Bot or ChatGPT Dots: a documented experience to measure against, not run in the trials. |

## Critical Journeys

| Journey | Current pain | Proposed experience | Evidence needed |
|---|---|---|---|
| J0 Vision probe | No proof that a harness can act on what it sees (E-02) | The harness takes a screenshot, finds a nonce that exists only in pixels (no DOM, accessibility or file copy), clicks the control it names, and confirms the change from a new screenshot. A text-only control model must fail the same probe. | Pass on the selected pair; control fails |
| J1 MOMO frontend | The frontend spec is untracked and runs nowhere (E-03) | The harness opens a real Session in MOMO Web, inspects the Findings, downloads the report, checks its contents and the rendered screen, and saves screenshots as evidence. | Completion, verified artifact, interventions, time, tokens |
| J2 Desktop application | Work inside a desktop application has no CLI or API path | First task: the runtime-refresh `RT0.3` Antigravity manual-rule qualification (USER_DECISION, 2026-10-08). The harness drives the Antigravity IDE in a clean profile and a co-installed one, signs in through a human takeover, and runs harmless probes that leave checkable artifacts. | Per-probe receipts: build, platform, root, prompt, loaded file, artifact |
| J3 Continuation and takeover | Each prompt rebuilds the workspace | A follow-up continues in the same application state. A human completes one blocked step (such as a login), hands back, and the agent continues. | No re-login, a clean handback, a reset that restores a clean computer |

## Quality Scenarios

| ID | Scenario | Measure | Later architecture gate |
|---|---|---|---|
| Q-01 | J0 on one selected harness/model pair first (Codex with GPT-5.1 is the declared image route) | Pass while the text-only control fails. A pair that cannot pass is not assigned visual work. | Probe added to `workflow-runtime` |
| Q-02 | J1 on the AIO computer with CDP-attached Playwright | Correct artifact; ≤1 intervention; time and tokens recorded. Thresholds set after the first run (ASSUMPTION). | Skill and service configuration |
| Q-03 | J2: each `RT0.3` probe in the Antigravity IDE | The receipt shows the loaded file from a context or tool record, not model narration, and the probe's artifact exists | Desktop rung is adopted when it shows a concrete benefit |
| Q-04 | J3 follow-up after an idle period | Same app state with no re-login. Reset by discarding and recreating the container, with time measured. | Persistence and reset rules |
| Q-05 | A human takes over mid-task through noVNC | Blocked step completed, handback acknowledged, the agent's next observation shows the change | Takeover protocol in the skill |
| Q-06 | An unattended run tries to reach host files or credentials beyond the mounted workspace | No route from the computer to them | Run checklist |
| Q-07 | Observation size per step | Stays under the harness tool-output cap (E-11). Screenshot count per task recorded. | Observation budget in the skill |
| Q-08 | Every trial run | Same specification, prompts and success checks; identities recorded; ≤30 minutes per run (ASSUMPTION). Repetitions follow once the path works and a reliability question exists. | Results table |

## Research Landscape

| Capability | Candidate routes | Evidence | Verdict |
|---|---|---|---|
| Complete computer agents | Grok Bot, ChatGPT Dots | E-06–E-08 | Reference only: no public task API found, shared state, cloud-only; the operator chose not to run them |
| Managed agent APIs | OpenAI Agents API (hosted browser); Claude Managed Agents (no computer use) | E-09 | Not run; not a MOMO worker route now |
| Harness-native computer features | Claude Code Chrome and computer use; Codex desktop app | E-10 | Interactive only; not for unattended workers |
| Browser control | Playwright MCP or CLI; Chrome DevTools MCP; browser-use | E-05, E-16 | Adopt the shipped Playwright MCP over CDP; measure the CLI |
| Browser computer with takeover | AIO Sandbox; Steel; Browserbase; browser-use cloud | E-12, E-15 | AIO: local, Apache-2.0, already accepted by MOMO |
| Desktop computer | Cua Linux image + Driver; Lume macOS VM + Driver; E2B Desktop; Anthropic reference container; `aio-computer` | E-13–E-15, E-12 | Cua Driver on a Lume macOS VM (Apple silicon) or a Cua Linux desktop (x86_64); E2B as cloud fallback; Anthropic's frozen image as reference only; `aio-computer` only once released openly |
| Agent apps | UI-TARS-desktop and Agent TARS | Its repo (last release 2025-11) | Not a worker route. Its remote mode uses AIO, which confirms the environment choice. |

## Adopt / Adapt / Build Decisions

| Capability | Decision | Rationale | Risk |
|---|---|---|---|
| Browser control | Adapt: Playwright MCP with `--cdp-endpoint` to the computer's Chromium, used for the trials | Stdio, already shipped, gives persistence and a shared view (E-05, E-16) | Pin drift (0.0.82 → 0.0.83) |
| Browser computer | Adopt: upstream AIO Sandbox image by digest | MOMO already accepts it (E-04); local; takeover through noVNC | Unauthenticated CDP; `seccomp=unconfined`; vendor-built image |
| Desktop computer | Adopt for J2: Cua Driver MCP in bounded mode, telemetry off, credential copying disabled, on a Lume macOS VM or a Cua Linux desktop | Only open, documented route to desktop control (E-13, E-14) | Pre-1.0 churn; FSL viewer; x86_64 only for Linux control |
| Usage guidance | Build: one skill (working name `ops-computer`) | No existing skill covers interface order, observation budget, takeover or reset | Prose without proof; tied to trial results |
| Qualification | Adapt: a vision-loop probe in `workflow-runtime` | It already qualifies harnesses for roles. | None material |
| Reference products | Use as documented experience only; do not run | USER_DECISION; no API (E-06, E-08) | The comparison rests on documented capabilities, not measured runs |
| MOMO integration | Defer | N-04 | — |
| HTTP MCP in agent-surface | Reject for now | Stdio routes suffice (E-05) | Revisit if AIO's MCP proves needed |

## Candidate Concepts

### Candidate A: Browser only, as shipped

The harness launches its own isolated headless Chromium through the existing Playwright MCP.

- **Covers:** J0 and part of J1.
- **Does not cover:** J2, a human view or takeover, or a browser that outlives the harness connection. Logins survive while its browser runs, and an on-disk profile can keep them longer.
- **Strength:** smallest change: none.
- **Falsified by:** any journey that needs a human step or a shared visible browser.

### Candidate B: A disposable computer for existing harnesses (selected)

- **Rung 1:** an AIO computer next to the app. The harness, outside it, attaches Playwright over CDP, and the human uses noVNC.
- **Rung 2, gated by a real GUI-only step:** a Cua desktop with Driver MCP.
- **What it adds:** a skill and a probe. Grok Bot and Dots stay references.
- **Covers:** J0–J3.
- **Strongest risk:** the localhost reach to the app, and the security posture of the open ports.
- **Falsified by:** the spikes S-01 to S-03 below.

### Candidate C: Delegate to a complete computer agent

MOMO hands goals to Grok Bot, Dots or the Agents API and reads results back.

- **Strength:** best persistence and takeover experience.
- **Blockers:** Bot and Dots expose no API. The Agents API has a browser only, is US-only, is billed per use, and cannot use MOMO's model gateway.
- **Falsified by:** today's documentation (E-06, E-08, E-09).
- **Disposition:** reference only; the operator chose not to run these products. Revisit if a vendor publishes a task API.

## Adversarial Review

| Finding | Revision |
|---|---|
| J2 may need no GUI: most documents convert and inspect through CLI tools. | Resolved by the task choice: Antigravity's IDE behavior has no CLI path, and `RT0.3` rules out CLI-plugin evidence as a substitute. |
| The shipped Playwright pin is isolated and headless (E-05). | The trials use a CDP-attached configuration. The default install changes only if results justify it. |
| AIO's MCP is HTTP-only, but agent-surface wires only stdio. | Drive AIO through CDP. HTTP MCP support is rejected until a need is proven. |
| Unattended workers carry host credentials (E-01). | Agent-outside is limited to trusted local targets. Untrusted browsing runs agent-inside, the shape MOMO's AIO image already takes (E-04). |
| AIO ports are open by default; CDP never authenticates (E-12). | Loopback binding, an API key, and a pre-run port check (C-04). |
| Cua churns, mixes licenses, and may copy credentials (E-13, E-14). | Pin by digest and version; bounded mode; telemetry off; credential copying off; internal use only. |
| Image delivery has fooled MOMO's own check before: agents read the file instead of the pixels (E-02). | J0's cue exists only in pixels, and a text-only control must fail it. |
| Long GUI tasks are slow and costly (E-17). | ≤30 minutes per run (ASSUMPTION); stop at budget. Start with one pair and one complete journey. |
| The concept could quietly build a second MOMO deployment path. | The spike uses the upstream image unchanged. MOMO's planned `aio-sandbox` target stays its packaging route. |

## Selected Concept HLD

**Boundary.** agent-surface delivers configuration, one skill and one probe. The computer is an adopted container that the operator starts. MOMO keeps its Session, Task and Evidence model, and a computer-capable worker is just a worker.

**Shape.** The following run on the operator's machine under Docker:

- **The computer:** the AIO Sandbox image, digest-pinned, with its API key set and every port published on 127.0.0.1 only. Its Chromium exposes CDP to the harness and noVNC to the human.
- **The harness:** runs agent-outside for trusted local targets, with Playwright MCP pointed at the computer's CDP endpoint. File exchange goes through the mounted workspace.
- **The app under test:** reached from the computer by a private route (spike S-01).
- **A VPS-shaped run:** the same container on a Linux dev box, reached over an SSH tunnel.
- **Managed computers** (E2B, Cua cloud): only if local hosting fails, with the same tunnel and data rules.
- **The desktop rung** swaps in a Cua desktop image with Driver MCP in bounded mode.

**Operation.**

- **Start:** pull by digest, set the key, publish on loopback, check the ports.
- **Persistence:** the container lives across follow-ups, with the workspace on a volume.
- **Reset:** discard the container and start a new one.
- **Takeover:** the agent asks for it through the harness's own question path (MOMO already wakes Global on `input_required`). The human acts in noVNC, then hands back.
- **Evidence:** screenshots and downloads land in the workspace and are kept as artifacts.

**Cost drivers.**

- **Model tokens:** screenshots at roughly 1,000–1,800 tokens each (E-11).
- **Wall time:** minutes to tens of minutes (E-18).
- **Local compute:** none beyond the container.

**Failure behavior.** A run that hits its budget, loses the computer or cannot reach the app stops and reports which. It is never retried silently and never recorded as a pass.

## First Production Slice

1. **Rung 1 with real targets:** the AIO computer next to a real MOMO Web, and real harnesses: Codex with GPT-5.1 through the gateway, then Claude Code.
2. **Probe and trials:** J0 passes on one pair, then one complete J1 and J3 run within budget. Repetitions follow only for a reliability question.
3. **Skill and checklist:** the skill and a pre-run checklist (pins, key, loopback ports, workspace mount) live in agent-surface.
4. **Recording:** results are recorded with identities.
5. **Desktop rung:** J2 runs the Antigravity qualification once S-04 settles the platform. Antigravity stops reading workflows on November 1, so its generated workflows stay unread until this lands.
6. **Service configuration:** an agent-surface optional-service variant (for example a CDP-attached Playwright entry) ships only if the trials use it repeatedly.

MOMO changes nothing in this slice.

## Open Questions and Spikes

| Question | Why it matters | How to resolve | Owner / next command |
|---|---|---|---|
| S-01: Can the AIO computer reach `momo-service` and MOMO Web bound to 127.0.0.1 (for example through Docker Desktop's host gateway), or must MOMO Web run inside it? | J1 depends on it | Start the container and load MOMO Web from its Chromium | Operator plus implementer, before J1 |
| S-02: Which harness/model pairs pass J0? | Gates visual work (E-02) | Run the probe | `workflow-runtime` |
| S-03: Does Playwright MCP over CDP keep AIO's logged-in state across follow-ups, while a human uses noVNC on the same browser? | J3 and takeover | Run J3 by hand once | Implementer |
| S-04: Where does Antigravity run? The host is arm64 macOS; Cua Driver controls Linux desktops only on x86_64, and Antigravity on arm64 Linux is unverified. | Decides the desktop rung's platform | Try a Lume macOS VM with Cua Driver for macOS; fall back to an x86_64 Linux dev box | Implementer |
| S-05: Does the Playwright CLI use materially fewer tokens or less time than MCP on J1? | Interface choice (E-16) | Measure both on the same run | Implementer, during J1 |
| S-06: Per-run budget values (time, tokens, cost) | Prevents runaway runs (E-17) | Set from the first J1 run | Operator |

## Handoff to Architecture and Roadmap

`arch-roadmap` should derive this effort's `architecture.md` and `roadmap.md` beside this file. It must carry forward:

- **Decisions:** the two-rung selected concept; the reject and defer decisions (HTTP MCP, MOMO module, comparator runs); constraints C-01 to C-05.
- **Gates:** quality scenarios Q-01 to Q-08 as the acceptance gates.
- **Spikes:** S-01 to S-06, ordered S-01 → S-02 → S-03 before any agent-surface change.

The roadmap stays small: the spikes, the probe, the skill, the trials, a results record, and then a MOMO decision point. A trial that shows no gain in completion or interventions closes the effort with that finding, and builds nothing further.
