---
name: ops-learn
description: "Extract durable patterns and persist them to the right memory sink."
---

## Objective

After a concrete incident, extract the pattern behind it, classify its durability, and persist it to the right memory sink, so the same tactical bug does not recur and the same stable preference is not re-taught. `ops-learn` is the manual, immediate fast path; the continual-learning plugin mines transcripts and keeps `AGENTS.md` current over time.

## Sinks

| Kind | Sink |
|---|---|
| Durable user preference: a stable user correction or preference | `AGENTS.md`, `## Learned User Preferences` |
| Durable workspace fact: a stable repo or tooling fact | `AGENTS.md`, `## Learned Workspace Facts` |
| Tactical lesson: repeat bug pattern, local gotcha or anti-pattern, short-lived engineering heuristic | `.cursor/lessons.md` |
| Transient one-off incident detail | do not persist |

Tactical bug mechanics never go in `AGENTS.md`. When a lesson is both tactical and durable, write one concise tactical bullet to `.cursor/lessons.md` and one durable bullet to the correct `AGENTS.md` learned section. Never edit the plugin-owned state `.cursor/hooks/state/continual-learning*.json` (`continual-learning.json`, `continual-learning-index.json`); the plugin owns transcript mining and index refresh.

## Procedure

1. Find the root cause, not the surface: "the build failed" becomes "production code imported a type from development dependencies". Record the anti-pattern, not the stack trace.
2. Choose the sink first.
3. Classify the failure mode: knowledge gap ("didn't know API X changed"), process failure ("forgot to run tests before commit"), or tooling gap ("linter didn't catch it").
4. Write the lesson in under 2 lines, general rather than specific ("don't hardcode IDs", not "don't hardcode ID 123"): "Always use Optional Chaining (`?.`) on nullable relations", not "We forgot to check if the user was null before accessing the id property in the service." Skip it when an equivalent lesson already exists.
5. Tactical: add it to `.cursor/lessons.md` in the file's existing sectioned bullet style, as `- [Topic] Lesson learned (Context)` or tighter, e.g. `- [Docker] Always pin base images to SHA, not tags.`
6. Durable: if `AGENTS.md` does not exist, create it with only `## Learned User Preferences` and `## Learned Workspace Facts`. Add plain bullets only inside those two sections, e.g. `- Prefer exact, verifiable file counts in plans — do not estimate.` Deduplicate semantically similar bullets, keep each section to at most 12 bullets, and preserve the generated rule content above them. Never move durable facts into `rules/*.mdc`; those files are policy source, not learned memory.

## Output

```markdown
# LESSON LEARNED

## The Incident
- **What**: Production crash on null user.
- **Why**: We assumed `req.user` is always present after auth middleware, but it's optional.

## The Classification
- **Memory Type**: Tactical lesson
- **Failure Mode**: Knowledge gap
- **Target**: `.cursor/lessons.md`

## The Lesson
- **Category**: TypeScript / Express
- **Rule**: "Treat `req.user` as `User | undefined`, even in protected routes."

## Action
- ✅ Added to `.cursor/lessons.md`
- ⚠️ Recommended adding lint rule `strict-null-checks`.
- ➖ No durable `AGENTS.md` update needed.
```
