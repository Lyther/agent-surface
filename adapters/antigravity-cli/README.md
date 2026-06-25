# Antigravity CLI plugin adapter

Render `commands/*.md` as Antigravity CLI plugin skills, package always-on rules as plugin rules, keep scoped language rules as references, and include normalized subagents.

Default user install target:

- `~/.gemini/config/plugins/agent-surface/plugin.json`
- `~/.gemini/config/plugins/agent-surface/README.md`
- `~/.gemini/config/plugins/agent-surface/rules/<always-on-rule>.md`
- `~/.gemini/config/plugins/agent-surface/references/rules/<scoped-rule>.md`
- `~/.gemini/config/plugins/agent-surface/skills/<command>.md`
- `~/.gemini/config/plugins/agent-surface/skills/<external-skill>/SKILL.md`
- `~/.gemini/config/plugins/agent-surface/agents/<name>.md`

Validate generated output with:

```bash
agy plugin validate ~/.gemini/config/plugins/agent-surface
```

The local `agy 1.0.12` validator accepts flat command skills, nested external skill directories, and `agents/*.md` in this package. It reports rules as package files but only summarizes skills and agents, so rule loading should be re-probed if Antigravity changes its plugin loader.

The separate `antigravity` binary is a desktop-supervised surface unless current help/probe output proves a headless mode. Gemini CLI remains a legacy compatibility target and is generated separately by `gemini-cli`.

Only `alwaysApply: true` rules are packaged under plugin `rules/`. Scoped language and cybersecurity policies are reference files and should be attached by project-aware commands only when applicable.
