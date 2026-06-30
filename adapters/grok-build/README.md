# Grok Build Adapter

Generates Grok Build skills, project instructions, and external Agent Skills.

## Outputs

- `.grok/skills/<command>/SKILL.md`
- `.grok/skills/<external-skill>/...`
- `AGENTS.md` for project-scope installs
- `.grok/references/rules/<rule>.md` for project-scope scoped language references

## Notes

- Grok reads `.grok/skills/`, `~/.grok/skills/`, enabled plugin skills, and Agent Skills compatibility roots.
- External skill packs render only when the optional-service entry declares `skill_roots`. `anthropic-cybersecurity-skills` is kept as a pinned source asset but is not emitted into Grok Build skill roots by default.
- Project instructions use the `AGENTS.md` family. User-scope installs only emit skill folders.
- Project instruction files bundle only always-on rules. Scoped language policies are reference files for project-aware commands.
