# Gemini CLI legacy adapter

Current implementation renders command sources to Gemini CLI TOML command files and global context for the Google transition window.

Implemented target paths:

- user/project: `.gemini/commands/**/*.toml`
- user/project: `.gemini/GEMINI.md`

MCP settings are not mutated automatically. Add MCP servers through Gemini CLI or a reviewed `settings.json` change.

Google announced that consumer Gemini CLI users should migrate to Antigravity CLI by June 18, 2026. New Google CLI work should target `antigravity-cli`; this adapter remains only as a legacy transition export and avoids extension-package duplication.
