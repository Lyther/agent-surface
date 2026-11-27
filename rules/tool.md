# Tools In Agent-Surface

## Skills

Before your first tool call on any task, check the skill list for skills whose description matches the task and load each match with the Skill tool (or your host's skill loader) before doing anything else. Do this even for small or simple tasks; skip it only when no skill matches.

Grimoire is an MCP server (not a skill) serving extra specialist procedures (security, forensics, reverse engineering, CTF, architecture, testing, CI). When configured, load `grimoire_search` via tool search if deferred and call it before improvising in those domains.

## Memory Management

Use **Synapse MCP** when available alongside native memory tools: call `memory_recall` before re-deciding settled project choices, and `memory_remember` to store confirmed durable decisions or conventions.

Memories are project-level by default; general-level requires either:

- Beneficial for most work across repositories
- Common patterns across multiple projects
- User-wide workflow preferences

Avoid duplicate memories, and never store secrets or credentials.

## Agents

### Parallel Task Execution

Run independent research or review agents in parallel when their work does not share state:

- **Good**: Launch parallel subagents for independent bounded tasks (e.g., auth security analysis, cache performance trace, session-lifecycle call-path tracing).
- **Bad**: Run independent read-only investigations sequentially when parallelism is supported.

### Agent Selection

- Do not launch a large number of agents without asking the user.
- Do not launch redundant agents for trivial lookups you can do directly.
- Give each agent clear, self-contained scope and an explicit output target.
- Keep subagents inheriting session model/permission defaults unless the user asks otherwise.
