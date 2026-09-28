# DSH adapter

DSH (DeepSeek Harness) is supported at its stable Developer Preview boundary: native Agent Skills only. Canonical and reviewed external skills render to `~/.dsh/skills/<name>/SKILL.md` or `.dsh/skills/<name>/SKILL.md`.

Security: [CVE-2026-82533](https://cveawg.mitre.org/api/cve/CVE-2026-82533) (critical) affects DSH builds before `0.1.2-alpha.1`. Read the installed package version without launching the client, and upgrade an affected build before using it. This adapter has not been requalified on a fixed build. Install and build plans show the `DSH_REQUALIFY_AFTER_SECURITY_UPDATE` notice.

Manual commands, Cordis profiles, subagents, and MCP are not generated. Those contracts are still changing, and DSH's workspace-scoped MCP design is unresolved. Add them only after the runtime publishes stable file formats and a real discovery run passes.

References:

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)
- [Workspace MCP discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/941)
