---
name: ops-learn
description: "Use when capturing a durable lesson after debugging or user feedback and persisting it to Synapse, native memory, or repo instructions."
---

## Objective

After a concrete incident or user correction, extract the reusable pattern behind it, classify its durability, and persist it to the right memory sink so the same mistake is not repeated.

## Sinks

| Kind | Sink |
|---|---|
| Durable user preference or cross-project habit | **Synapse MCP** (`memory_remember` — project scope by default; global scope only when useful across repos); if Synapse is unavailable, use the host's native memory or repository `AGENTS.md` |
| Repo-tracked rule/note explicitly requested for teammates | Repository `AGENTS.md` (or repo's existing instruction file) |
| Transient one-off incident detail | Do not persist |

Never persist secrets, credentials, or internal plugin state. Never rewrite `rules/*.md` unless the user explicitly asks to change policy source.

## Procedure

1. Identify the underlying pattern or anti-pattern rather than a one-off stack trace.
2. Check existing memories (`memory_recall` or existing notes) to avoid duplicates.
3. Classify scope: project-specific architectural/tooling fact vs cross-project user habit.
4. Store concise, actionable guidance pointing to the invariant and trigger context.

## Output

State the extracted rule, target sink (`Synapse project`, `Synapse global`, `native memory`, or `repo file`), and what changed (or skipped as duplicate/transient).
