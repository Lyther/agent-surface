---
name: lint-typescript
description: "Apply strict TypeScript engineering rules before code is accepted."
---

## Procedure

1. Identify the `.ts`/`.tsx` files touched or under review.
2. Apply the TypeScript policy in `rules/13-typescript.mdc` (agent-surface source; it may be rendered to the current host) together with the repository's configured linters and formatters. No `any`, `@ts-ignore`, loosened compiler settings, or unhandled Promises. If a constraint cannot be met, stop and name the blocker.
3. When `.tsx` or React UI changed, review it before the toolchain gates:
   - Stack: follow the repo's existing router, data-fetching layer, component library, theme tokens, test runner, and build tool. Add no Modern.js, Arco, Semi, VisActor, TanStack Query, Redux, Zustand, Tailwind, or other UI dependency unless the repo already uses it or the task requires it and its risk was researched.
   - Intent: product UI follows the product stack; admin and ops consoles use dense list/detail/action patterns with existing Arco/Semi or repo-native primitives where present.
   - Typed contracts: table rows, filter params, detail payloads, action request/response shapes, and route params are typed from API contracts or validated schemas; no `any` table records or untyped JSON response plumbing.
   - State: URL/search params hold shareable table state, server-state tools or route loaders hold remote data, component state holds only transients; never duplicate server data into global stores.
   - States: render loading, error, empty, partial-data, permission-denied, and success states; destructive or irreversible actions need confirmation and visible pending and failure states.
   - Accessibility and tests: prefer semantic queries; add stable selectors only where they improve diagnosis of table rows, action buttons, and status fields; keyboard and focus behavior survives drawers, modals, and table actions.
   - Visuals: use design-system tokens and components, not ad hoc colors, spacing, button styles, or one-off table renderers; internal tools stay dense and scannable, not marketing pages.
4. Run the toolchain gates:

   ```bash
   npm run typecheck   # or the repository's equivalent scripts (rules/13-typescript.mdc)
   npm run lint
   npm run format:check
   npm test
   ```

5. Report findings, fixes, and gate status.

## Output

```text
Verdict: <BLOCKER | MAJOR | MINOR | CLEAN>
Findings: <file:line and issue, or none>
Fixes: <change made per finding, or none>
Verification:
- typecheck: PASS/FAIL/not available
- lint: PASS/FAIL/not available
- format:check: PASS/FAIL/not available
- test: PASS/FAIL/not available
```
