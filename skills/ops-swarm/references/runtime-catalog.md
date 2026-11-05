# ops-swarm model catalog

Choose a model for the packet, then an accessible provider or runtime. Launch syntax and context controls are in [runtime-launch.md](runtime-launch.md).

## Recommended models — updated 2026-11-05

Scores come from the operator's filtered [BenchLM](https://benchlm.ai/methodology) export, rounded to one decimal. Use the task-specific columns; small score gaps do not establish a better choice for a real packet. The shortlist omits Pro variants and older or more expensive alternatives without a useful advantage in the retained scores.

Prices are standard text API USD per million tokens, **input / cached input / output**, checked on the date above. They are unit rates, not accumulated per-round costs or subscription prices. Cache writes, storage, tools, taxes, and provider multipliers are extra. Suggested context is intentionally blank for the operator to fill; preserve the existing runtime setting until then. The published cap is not a suggested window, and a host may expose less. K = 1,000; M = 1,000,000 tokens.

| Model | Overall | Coding | Agentic | Reasoning | Price: in / cached / out | Suggested context | Cap |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Claude Opus 5.5](https://platform.claude.com/docs/en/models/overview) | 86.3 | 82.9 | 90.1 | 86.1 | 4 / 0.20 / 20 | 500K | 1M |
| [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) | 86.1 | 74.7 | 76.0 | 93.3 | 10 / 1 / 50 | 272K | 1.05M |
| [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | 85.3 | 70.3 | 77.2 | 90.5 | 2 / 0.10 / 10 | 1.05M | 1.05M |
| [Gemini 4 Argon](https://aistudio.google.com/docs/models/gemini-4-argon) | 82.3 | 72.2 | 78.3 | 86.9 | 2 / 0.10 / 10 | 500K | 1.04M |
| [Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/overview) | 81.8 | 81.7 | 69.1 | 81.8 | 2 / 0.10 / 10 | 1M | 1M |
| [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) † | 80.5 | — | 76.7 | 81.8 | 1 / 0.05 / 5 | 1.05M | 1.05M |
| [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview) | 66.4 | 52.4 | 61.8 | 59.8 | 0.10 / 0.01 / 0.50 | 1M | 1M |
| [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash) | 66.2 | 59.8 | 65.8 | 74.3 | 0.75 / 0.075 / 3.75 | 1.04M | 1.04M |
| [DeepSeek V4.1 Flash 1017](https://api-docs.deepseek.com/quick_start/pricing/) | 65.2 | 62.9 | 62.2 | 82.5 | 0.30 / 0.006 / 1.20 | 1M | 1M |
| [Qwen3.8 Max](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max) | 64.9 | 52.7 | 66.0 | 87.0 | 2 / 0.25 / 6 | 1M | 1M |
| [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) | 62.1 | 51.4 | 53.8 | 59.2 | 0.10 / 0.01 / 0.50 | 1.05M | 1.05M |
| [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3) | 61.0 | 55.4 | 69.9 | 79.8 | 1.40 / 0.26 / 4.40 | 500K | 1M |
| [Grok 4.7](https://docs.x.ai/developers/models/grok-4.7) | — | — | — | — | 2 / 0.50 / 6 | 200K | 500K |

† Terra's export row is estimated and lacks a coding score. Grok 4.7 retains the operator's earlier recommendation; the export scores Grok 4.6, so those scores are not transferred. A dash means unavailable, not zero.

Cost details that affect selection:

- Listed GPT models: above 272K input, input and cached-input rates double and output rates rise 50% for the entire request; see the linked model pages.
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing): Haiku's rates become **0.50 / 0.05 / 2.50** above 100K input. Opus and Sonnet use the listed rates across their 1M windows.
- [Gemini pricing](https://aistudio.google.com/docs/pricing): Argon's introductory rates end 2026-11-30; **4 / 0.20 / 20** starts December 1. Flash's end 2026-12-31; **1.50 / 0.15 / 7.50** starts January 1, 2027.
- [Grok pricing](https://docs.x.ai/developers/pricing): **4 / 1 / 12** above 200K input. DeepSeek shows peak rates; its off-peak rates are half. Qwen shows Singapore international pricing and implicit-cache reads; regional and explicit-cache rates differ.
- [GLM pricing](https://docs.z.ai/guides/overview/pricing) replaces the export's zero prices; hosted inference is not free.

## Provider — model family mapping

Check the current account's catalog for exact models and availability.

| Provider | Model families |
|---|---|
| [Droid](https://docs.factory.com/models) | GPT, Claude, Gemini, Grok, Muse, open-source models |
| [Cursor](https://cursor.com/docs/models-and-pricing) | Grok, Composer; GPT, Claude, Gemini, Muse through third-party access |
| [Ollama Cloud](https://ollama.com/search?c=cloud&o=newest) | Open-source models |

## Pick a model for the role

| Tier | Selection |
|---|---|
| `frontier` | Opus for demanding coding or agentic work; Astra for hard reasoning when its higher price is justified |
| `workhorse` | Sol, Sonnet, or Argon for ordinary research and implementation; Terra, Flash, or DeepSeek for lower-cost packets; Qwen or GLM when their task strengths or family diversity help |
| `fast` | Haiku or Luna for bounded extraction, triage, formatting, or liveness checks; compare the applicable context-price tier |
| `independent` | A different model family from the packet being checked, at workhorse strength or above |

These are starting choices, not benchmark-proven swarm assignments. Apply the operator's route budget below before API list-price comparisons; Grok remains a preferred route when that allocation applies. Compare coding and agentic scores for implementation, reasoning for analysis, and actual tool support for execution. Repeated rounds charge growing input again, so caching, output volume, and context surcharges matter more than a tiny overall-score difference.

Set reasoning effort for the task. Independent review can use another family on the same provider. Pin the model ID for reproducible comparisons; otherwise resolve aliases and record the model that actually ran. Avoid `auto` routing when the evidence must identify its model.

## Check access before assignment

1. Resolve the runtime and version. Check login, credentials, and access on the surface being used: an IDE login does not prove headless CLI access.
2. Read its current model list, settings, and help. Confirm the selected model, context controls, and required tools; use the runtime's exact selector.
3. Check available quota and the applicable budget. When access is unproven, run one bounded probe on the selected route and record its result; model listing alone does not prove inference access. Reuse current evidence for the same runtime, model, and configuration.
4. Verify the packet's permissions and any required fan-out through [runtime-launch.md](runtime-launch.md). Use `workflow-runtime` when skill discovery or task-shaped qualification is needed.

Keep device versions, login state, failures, and probe receipts with the run evidence, rather than in this catalog.

## Operator notes — temporary

These routing and budget preferences stay here until they move to private configuration.

- Do not use Droid's Grok family models; choose Grok Build or Cursor.
- Budget priority: Grok Build / Cursor primary models (effectively unlimited for current work) > native providers (sufficient) > Droid (watch the cost multiplier) > Ollama Cloud / Cursor third-party models (no budget). This is the operator's allocation; check live quota before launching.
