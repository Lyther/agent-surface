# ops-swarm runtime and model catalog

Companion reference for `ops-swarm`. Read it when assigning a packet to a runtime; the durable
procedure lives in `SKILL.md` and does not depend on anything here.

Everything below is dated and goes stale. Treat it as a preference table, not an allowlist or a
readiness claim, and re-probe before relying on a row.

Refresh before assignment. This is a preference table, not an allowlist or a readiness claim. Evidence was refreshed on 2026-09-03 from installed CLI help/catalogs and first-party model catalogs; `live` means only that a bounded exact-output headless call passed on this machine.

| Runtime | Preferred models | Role fit | Current evidence and boundary |
|---|---|---|---|
| Codex 0.148.0 | `gpt-daybreak-blue-latest` for provisioned defensive-security work; `gpt-5.6-sol` for hard core/BOSS/review; `gpt-5.6-terra` for normal development; `gpt-5.6-luna` for cheap workers; `gpt-5.5` fallback; Ollama pool when its cost/family trade-off wins | Operator-preferred general runtime and OpenAI-family coordinator | Luna headless `live`; all listed OpenAI IDs in local Codex catalog. `gpt-daybreak-blue-latest` is the valid Daybreak alias and resolves to Sol. Do not assign `gpt-5.4` in this operator profile even though it remains catalog-visible. Use `ollama launch codex --model <ollama-id>` for Ollama models. |
| Claude Code 2.1.227 | `fable` / `claude-fable-5-1` for the hardest long runs; `opus` / `claude-opus-5` for deep review; `sonnet` / `claude-sonnet-5` for routine work; Ollama pool only when its trade-off is explicit | Strong architecture, implementation, and independent review | CLI shape and current IDs verified; local CLI auth is currently unavailable. Prefer native Claude models: the operator observes poor cache reuse for non-Claude compatibility models. Ollama uses `ollama launch claude --model <ollama-id>`. |
| DSH 0.1.1-rc.2 | Native `deepseek-v4-pro` for hard work and `deepseek-v4-flash` for routine work; exact dated snapshots through the Ollama pool below | DeepSeek-family independent worker/reviewer | Headless help and composed default (`deepseek-v4-flash`) verified; no live call. Model selection is settings/patch-owned, not a headless flag. |
| Grok Build 1.0.13 | `grok-4.6` | Large independent coding/review packets when its operator-reported high allowance is available | CLI/model catalog verified; local account is not authenticated, so quota and execution are not currently proven. Never encode the allowance as infinite or guaranteed. |
| Cursor Agent 2026.08.25 | `composer-2.5` for fast routine work; `cursor-grok-4.6-high-fast` for strong high-volume work; `cursor-grok-4.6-xhigh` for hard reasoning; account-listed GPT/Claude models only when their API-priced use is justified | Fast native worker or independent model-family route | `composer-2.5` headless `live`; account model list verified. Resolve `cursor-agent` explicitly. The bare `agent` alias is unstable even though it currently resolves to Cursor here. |
| Kimi Code 0.36.1 | `kimi-code/k3` with `low`, `high`, or `max` effort | Long-context Kimi-family core or implementation work | Native K3 headless `live` with normal TLS. Prompt mode is already non-interactive and rejects `--auto`; use `-p` without it. |
| Kilo 7.2.52 | Ollama pool below; start with `ollama-cloud/glm-5.3-flash` for ordinary workers | Flexible multi-model worker; native orchestration when Kilo is the driver | GLM-5.3-Flash headless `live`. VS Code Agent Manager can select per-task provider/model/variant through `agent_manager_models` + `agent_manager`; CLI uses native `task` subagents or `kilo run`. Re-probe CLI and extension state separately. |
| OpenCode 1.18.15 | Ollama pool below | Low-cost headless worker after provider setup | Launch flags verified, but this machine currently has no `ollama-cloud` provider or credentials; assignment is blocked until `ollama launch opencode --model <id> --config` and a live probe pass. |
| Cline | Ollama pool below | Alternate worker after exact binary qualification | `ollama launch` supports Cline, but this host exposed conflicting Cline 3.0.60 and legacy 1.0.8 installations during the refresh. Resolve the executable and re-read its help before every assignment; no standing headless command is currently certified. |

Recommended Ollama Cloud pool, verified by `ollama show` on 2026-09-03:

| Ollama model ID | Kilo selectable ID | Prefer for |
|---|---|---|
| `glm-5.3-flash:cloud` | `ollama-cloud/glm-5.3-flash` | Default low-cost worker; tools, thinking, vision, 1M context |
| `glm-5.3:cloud` | `ollama-cloud/glm-5.3` | Hard core work, synthesis, or review when stronger reasoning earns the cost |
| `deepseek-v4-flash:0731-cloud` | `ollama-cloud/deepseek-v4-flash:0731` | Low-cost DeepSeek-family worker |
| `deepseek-v4-pro:0813-cloud` | `ollama-cloud/deepseek-v4-pro-0813` | DeepSeek-family core or independent review |
| `kimi-k3:cloud` | `ollama-cloud/kimi-k3` | Capable long-context fallback, but expensive; prefer native `kimi-code/k3` when available |

The Kilo IDs above were listed by the installed runtime. OpenCode and Cline may expose different provider aliases after `ollama launch`; use their live model/config output rather than translating the raw Ollama ID by assumption.

Other installed targets remain probe-on-demand candidates; absence from this recommendation table does not remove support.

When Kilo is the driver inside VS Code, prefer its native `agent_manager_models` and `agent_manager` tools over shelling out to `kilo run`. For CLI Kilo and other runtimes, prefer their native `task`/subagent tool when it can satisfy model, isolation, and artifact requirements. Use a headless subprocess when provider-family independence or a missing native capability actually requires it.

Ollama thinking policy for swarm packets:

- For non-trivial reasoning packets, prefer thinking enabled and hide/drop the trace.
- Do not persist the API `thinking` field or Grok `thought` field in reports, state files, or evidence.
- Very low output caps can produce thinking but no final answer. For thinking probes, allocate enough output budget or treat empty final output as a failed probe.
- Use `think:false` only for trivial formatting, extraction, or latency probes; it is not a privacy control.

Example bounded packet probes:

```bash
unset NODE_TLS_REJECT_UNAUTHORIZED
ollama show glm-5.3-flash:cloud
ollama show glm-5.3:cloud
ollama show deepseek-v4-flash:0731-cloud
ollama show deepseek-v4-pro:0813-cloud
ollama show kimi-k3:cloud
codex exec -m gpt-5.6-luna -c 'model_reasoning_effort="low"' -C "$PWD" -s read-only --ephemeral --json "Reply OK only."
kilo run --dir "$PWD" --model ollama-cloud/glm-5.3-flash --variant low --agent ask --format json "Reply OK only."
kimi -m kimi-code/k3 -p "Reply OK only." --output-format stream-json
cursor-agent -p --workspace "$PWD" --mode ask --model composer-2.5 --output-format json "Reply OK only."
grok --cwd "$PWD" -m grok-4.6 --reasoning-effort low -p "Reply OK only." --output-format json --max-turns 1
```
