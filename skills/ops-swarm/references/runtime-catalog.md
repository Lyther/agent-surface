# ops-swarm runtime and model catalog

Companion reference for `ops-swarm`. Read it when a packet needs a runtime and a model. The first two
sections are the durable procedure; the snapshot after them is dated and goes stale within weeks.

## Pick a tier, then resolve it

Choose the tier from the packet's role, then resolve that tier to a model on the chosen runtime.

| Tier | Packet roles | Resolve to |
|---|---|---|
| `frontier` | Final synthesis, judge, hard design, security-sensitive review | The runtime's strongest listed model, at high effort |
| `workhorse` | Ordinary research, analysis, and implementation | The runtime's current general model |
| `fast` | Bulk extraction, triage, formatting, liveness probes | The cheapest capable model, at low effort |
| `independent` | Critic or judge of another packet | A model family different from the packet it checks, at workhorse strength or above |

1. Use a runtime's latest alias when the packet does not need a pinned version, then record the model the session actually ran. Aliases can lag the newest release: on 2026-10-15 Claude Code's `haiku` still ran Haiku 4.5.
2. Pin the exact ID when a rerun must reuse the same model, such as re-reviewing a fix.
3. List the runtime's models before assignment. A missing, retired, or renamed ID is a failed probe; do not substitute a similar-looking neighbour.
4. Avoid router models such as `auto` when the evidence must name its model.
5. Treat effort as part of the assignment. Lower it for fast packets and raise it for frontier ones before switching model.
6. One runtime can serve several families. Droid alone reaches Anthropic, OpenAI, Google, GLM, Kimi, Qwen, DeepSeek, and Grok models, so `independent` does not always need a second CLI.

## Discover current models

| Runtime | List models | Latest aliases | The model that ran |
|---|---|---|---|
| Droid | `droid exec --help` (Available Models) | `anthropic-latest-{premium,balanced,medium,fast}`, `openai-latest-{premium,balanced,medium,fast}`, `oss-latest-{premium,balanced,fast}`; version wildcards such as `claude-opus-*` or `gpt-*-sol` | `-o stream-json`: the `system`/`init` event's `model` |
| Codex | `~/.codex/models_cache.json` (command below) | none | the `-m` value, so pass a listed slug: `--json` events do not name the model, and an alias leaves no record of what ran |
| Claude Code | no list command; `/model` in an interactive session | `fable`, `opus`, `sonnet`, `haiku` | `--output-format json`: the `modelUsage` keys |
| Cursor Agent | `cursor-agent models` | none | the `--model` value |
| Grok Build | `grok models` | the `(default)` entry | the `-m` value |
| Kimi Code | `default_model` and `[models.*]` in `~/.kimi-code/config.toml` | the configured `default_model` | the `model` field of the `-m` alias's `[models.*]` table (`kimi-code/k3` sends `k3`) |
| Kilo | `kilo models` | none | the `--model` value |
| OpenCode | `opencode models` | none | the `--model` value |
| DSH | `dsh --profile headless --dump-config` (`model:`) | profile-owned | the composed profile |
| Ollama Cloud | `ollama show <id>` per ID | `:cloud` tags | the ID |

Codex lists the models it offers, hidden ones excluded, with:

```bash
jq -r '.models | map(select(.visibility == "list").slug)[]' ~/.codex/models_cache.json
```

## Snapshot 2026-10-15

Versions, catalogs, and aliases were read from the installed CLIs on 2026-10-15. `live` means a bounded
"Reply OK only." headless call passed on this machine that day; anything else is catalog evidence only.
`live` proves model access, not readiness: qualifying a runtime for a role is `workflow-runtime`'s job.

| Runtime | `frontier` | `workhorse` | `fast` | Evidence and boundary |
|---|---|---|---|---|
| Droid 0.241.1 | `anthropic-latest-premium`, `claude-opus-5-5`, `gpt-6-astra` | `gpt-6-sol` (default), or `gpt-*-sol` for the newest Sol line | `openai-latest-fast` (ran `gpt-6-luna`), `glm-5.3-flash`, `gemini-3.8-flash` | `openai-latest-fast` live. No Sonnet 5.5 or Haiku 5.5 in its catalog yet. Custom droids need `--auto high` (see `runtime-launch.md`). Usage is billed in Factory credits. |
| Codex 0.159.2 | `gpt-6-astra` (the operator default, at `max`) | `gpt-6.1-sol` | `gpt-6-luna` | `gpt-6-luna` live; catalog fetched 2026-10-15. Every listed model outside the Luna line adds an `ultra` effort. A provisioned alias outside the listed catalog, such as `gpt-daybreak-blue-latest`, needs its own probe and leaves no record of the model it ran. Use `ollama launch codex --model <ollama-id>` for the Ollama pool. |
| Claude Code 2.1.280 | `opus` (ran `claude-opus-5-5`); `fable` resolves to `claude-fable-5-1` | `sonnet` (ran `claude-sonnet-5-5`; this CLI version warns that it does not recognise the ID) | `claude-haiku-5-5` (the `haiku` alias still ran Haiku 4.5) | `opus`, `sonnet`, `haiku`, and `claude-haiku-5-5` live; `fable` not live-verified. Prefer native Claude models: the operator observes poor cache reuse for non-Claude compatibility models. |
| Cursor Agent 2026.09.02 | `claude-fable-5-1-thinking-xhigh`, `grok-4.7-xhigh` | `grok-4.7-high-fast`, `claude-sonnet-5-thinking-high`, `gpt-5.6-sol-high` | `composer-2.5` | Model list only. The `cursor-grok-4.7-*` IDs are gone, and no GPT-6 or Sonnet 5.5 is listed yet. Fable variants are marked NO ZDR. Resolve `cursor-agent` explicitly; the bare `agent` alias is unstable. |
| Grok Build 1.0.46 | `grok-4.7` | `grok-4.7` | `grok-4.7-build-fast` | Model list only; last live 2026-10-08. The allowance has run out before (2026-09-30), so never treat it as unlimited. |
| Kimi Code 2.1.1 | `kimi-code/k3` | `kimi-code/k3` | none probed | `default_model` read from config. `-m` selects the alias; effort is configured separately. The config also defines `kimi-code/kimi-for-coding`, `kimi-code/kimi-for-coding-highspeed`, and `kimi-code/k3-256k`; probe one before assigning it. |
| DSH 0.1.7-rc.2 | patch `agent-default-model` and probe it | `deepseek-flash` (headless profile) | `deepseek-flash` | Composed config only. Model selection is settings- or patch-owned, not a headless flag. |
| Kilo 7.2.52 | Ollama pool | Ollama pool | `ollama-cloud/glm-5.3-flash` | Blocked: the CLI printed nothing for `--version`, `--help`, or `models`. Reinstall and re-probe; check the VS Code Agent Manager separately. |
| OpenCode 1.18.30 | Ollama pool | Ollama pool | Ollama pool | Blocked: no `ollama-cloud` provider is configured. Run `ollama launch opencode --model <id> --config` and a live probe first. |
| Cline | Ollama pool | Ollama pool | Ollama pool | No certified headless command. Resolve the executable and re-read its help before every assignment. |

Other installed runtimes are probe-on-demand candidates, not unsupported ones: Gemini CLI 0.46.0,
Antigravity CLI 1.1.13, Qwen Code 0.22.3, and Goose 1.34.1.

## Ollama Cloud pool

Verified with `ollama show` on 2026-10-15. The Kilo IDs come from its 2026-09-03 listing; re-list them
once Kilo works again.

| Ollama ID | Kilo ID | Use |
|---|---|---|
| `glm-5.3:cloud` | `ollama-cloud/glm-5.3` | `frontier` or `workhorse` GLM, for synthesis or review when the stronger reasoning earns the cost |
| `glm-5.3-flash:cloud` | `ollama-cloud/glm-5.3-flash` | Default `fast` worker; tools, thinking, vision, 1M context |
| `deepseek-v4.1-flash:cloud` | re-list | `fast` DeepSeek-family worker; replaces `deepseek-v4-flash:0731-cloud`, retired on 2026-09-25 |
| `deepseek-v4-pro:0813-cloud` | `ollama-cloud/deepseek-v4-pro-0813` | DeepSeek-family core work or `independent` review; Droid already marks V4 Pro deprecated |
| `kimi-k3:cloud` | `ollama-cloud/kimi-k3` | Capable long-context fallback, but expensive; prefer native `kimi-code/k3` |

Runtimes expose their own selectors after `ollama launch`; read them from the runtime's model list
rather than translating the raw Ollama ID.

Ollama thinking policy for swarm packets:

- For non-trivial reasoning packets, prefer thinking enabled and hide/drop the trace.
- Do not persist the API `thinking` field or Grok `thought` field in reports, state files, or evidence.
- Very low output caps can produce thinking but no final answer. For thinking probes, allocate enough output budget or treat empty final output as a failed probe.
- Use `think:false` only for trivial formatting, extraction, or latency probes; it is not a privacy control.

## Bounded probes

```bash
unset NODE_TLS_REJECT_UNAUTHORIZED
ollama show glm-5.3-flash:cloud
ollama show deepseek-v4.1-flash:cloud
droid exec --cwd "$PWD" -m openai-latest-fast -o stream-json "Reply OK only."
codex exec -m gpt-6-luna -c 'model_reasoning_effort="low"' -C "$PWD" -s read-only --ephemeral --json "Reply OK only."
claude -p "Reply OK only." --model sonnet --output-format json
cursor-agent -p --workspace "$PWD" --mode ask --model composer-2.5 --output-format json "Reply OK only."
grok --cwd "$PWD" -m grok-4.7 --reasoning-effort low -p "Reply OK only." --output-format json --max-turns 1
kimi -m kimi-code/k3 -p "Reply OK only." --output-format stream-json
kilo run --dir "$PWD" --model ollama-cloud/glm-5.3-flash --variant low --agent ask --format json "Reply OK only."
```
