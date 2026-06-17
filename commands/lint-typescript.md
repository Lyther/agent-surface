---
name: lint-typescript
phase: verify
description: "Apply strict TypeScript engineering rules before code is accepted."
---
## §0 META: YOU WILL BE AUDITED

You are generating TypeScript code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

TypeScript exists to prevent JavaScript's chaos. If your code requires `any`, `@ts-ignore`, or loose compiler settings, you're doing it wrong.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.ts`/`.tsx` files were touched or are under review.
2. **Apply language rules**: The full TypeScript policy is in `rules/13-lang-typescript.mdc` in agent-surface source and may be rendered to the current host. Audit against every section.
3. **Frontend/Admin UI pass**: If `.tsx`/React UI changed, run this additional review before toolchain gates:
   - **Stack preservation**: Verify the implementation follows the repo's existing router, data-fetching layer, component library, theme tokens, test runner, and build tool. Do not introduce Modern.js, Arco, Semi, VisActor, TanStack Query, Redux, Zustand, Tailwind, or another UI dependency unless the repo already uses it or the user approved the dependency change.
   - **Intent fit**: Product UI follows the product stack; admin/ops console UI follows dense list/detail/action patterns and uses existing Arco/Semi or repo-native primitives where present.
   - **Typed contracts**: Table rows, filter params, detail payloads, action request/response shapes, and route params are typed from API contracts or validated schemas. No `any` table records or untyped JSON response plumbing.
   - **State topology**: URL/search params hold shareable table state; server-state tools or route loaders hold remote data; component state holds only transients. Do not duplicate server data into global stores.
   - **Component quality**: Loading, error, empty, partial-data, permission-denied, and success states are rendered. Destructive or irreversible actions require confirmation and visible pending/failure states.
   - **Accessibility and testing**: Prefer semantic queries in tests. Add stable selectors only where they improve diagnosis for table rows, action buttons, and status fields. Keyboard/focus behavior must survive drawers, modals, and table actions.
   - **Visual consistency**: Use design-system tokens/components instead of ad hoc colors, spacing, button styles, or one-off table renderers. Internal tools should be dense and scannable, not marketing pages.
4. **Run toolchain gates**:

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
```

4. **Report findings** using the output format below.

## OUTPUT FORMAT

### PART 1: UNDERSTANDING

```text
Task: [restate the task in your own words]
Constraints: [list any constraints from context]
Ambiguities: [list anything unclear — ASK if critical]
```

### PART 2: DESIGN

```text
DATA MODELS:
[Zod schemas for boundaries]
[TypeScript types/interfaces for internal]

ERROR STRATEGY:
[Error classes and handling]

DEPENDENCIES:
[Each package with justification]
```

### PART 3: IMPLEMENTATION

```text
[Complete, working code — all files, all functions, all tests]
```

### PART 4: VERIFICATION

```text
Toolchain commands: [list]
tsc --noEmit: [PASS/FAIL]
eslint: [PASS or specific issues]
vitest: [PASS with count]
```

## ENFORCEMENT REMINDER

**You are being watched.** Every `any`, every `@ts-ignore`, every unhandled Promise will be traced back to your negligence. Do it right or don't do it at all.
