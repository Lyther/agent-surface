# Grok Build Adapter

Generates Grok Build skills, project instructions, and external Agent Skills.

## Outputs

- `.grok/skills/<command>/SKILL.md`
- `.grok/skills/<external-skill>/...`
- `AGENTS.md` for project-scope installs

## Notes

- Grok reads `.grok/skills/`, `~/.grok/skills/`, enabled plugin skills, and Agent Skills compatibility roots.
- Project instructions use the `AGENTS.md` family. User-scope installs only emit skill folders.
