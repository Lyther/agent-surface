# Tools In Agent-Surface

## Memory Management

Use Synapse MCP (if you have) along with your native memory tools.

Memories are project-level by default; a general-level requires either:

- Beneficial for most work
- Common patterns across multiple projects
- General-level work style of the user

Avoid inserting duplicated memory.

## Skills

Always pick the suitable skills that fit your current task.

## Agents

### Parallel Task Execution

Use parallel agent execution for independent operations:

**GOOD**: Parallel execution. Launch 3 agents in parallel:

1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

**BAD**: Sequential when unnecessary. First agent 1, then agent 2, then agent 3

### Agent Selection

Obey the following rules unless explicitly prompted:

- Don't launch a large number of agents without asking the user
- The running agents must do useful work
- Prompt agents with clear and concise wording
- Pick the proper model and thinking effort
