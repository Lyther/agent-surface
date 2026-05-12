# Cline adapter

Current implementation renders command sources to Cline workflow files and generated rules.

Implemented target paths:

- user: `~/Documents/Cline/Workflows/*.md`
- user: `~/Documents/Cline/Rules/agent-surface.md`
- project: `.clinerules/workflows/*.md`
- project: `.clinerules/agent-surface.md`
- custom: any reviewed `--dest` path

Cline built-in slash commands are not treated as a custom command-file primitive.
