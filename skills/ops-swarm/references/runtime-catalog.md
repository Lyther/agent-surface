# ops-swarm model catalog

Choose a model for the packet, then an accessible provider or runtime. Launch syntax and context controls are in [runtime-launch.md](runtime-launch.md).

## Recommended models — updated 2026-11-04

Operator recommendations. Context values are working-window targets; the selected runtime's capacity and compaction behavior still apply.

| Model | Suggested context |
|---|---:|
| Claude Opus 5.5 | 500K |
| Claude Sonnet 5.5 | 1M |
| GPT-6 Astra | 272K |
| GPT-6.1 Sol | 500K |
| Grok 4.7 | 200K |
| Gemini 4 Argon | 500K |

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
| `frontier` | A strong reasoning model for synthesis, judgement, hard design, or security-sensitive review |
| `workhorse` | A capable general model for ordinary research, analysis, and implementation |
| `fast` | The cheapest capable model for extraction, triage, formatting, or liveness checks |
| `independent` | A different model family from the packet being checked, at workhorse strength or above |

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
