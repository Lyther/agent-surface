# Grok Build Adapter

Generates Grok Build skills, project instructions, and external Agent Skills.

## Outputs

- `.grok/skills/<command>/SKILL.md`
- `.grok/skills/<external-skill>/...`
- `AGENTS.md` for project-scope installs
- `.grok/references/rules/<rule>.md` for project-scope scoped language references

## Notes

- Grok reads `.grok/skills/`, `~/.grok/skills/`, enabled plugin skills, and Agent Skills compatibility roots.
- Project instructions use the `AGENTS.md` family. User-scope installs only emit skill folders.
- Project instruction files bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
