---
name: lint-typescript
description: "Apply strict TypeScript soundness, async, boundary-validation, UI, and tsc/ESLint rules with examples. Use when writing, reviewing, or checking TypeScript or TSX code."
---

## Baseline

Use the repository's existing package manager, `tsconfig`, runtime validator, ESLint/formatter config, and scripts (`rules/code.md`, `rules/repository.md`). Preserve current strictness; never loosen compiler flags, lint rules, or tests to pass (`rules/test.md`), and do not add `zod` or UI/state libraries merely out of preference. If a constraint below cannot be met, stop and name the blocker.

## Rules and Examples

### 1. Type Soundness and Boundary Narrowing

Never silence the compiler with `any`, `as any`, unvalidated `as SomeType`, non-null `!`, `@ts-ignore`, `@ts-nocheck`, or blanket `eslint-disable` (`as const` is safe; `@ts-expect-error` requires an inline reason and issue reference). Treat parsed JSON, network responses, storage payloads, and CLI/env inputs as `unknown` and narrow them at the boundary with type guards or the repository's schema library (`Zod`, `Valibot`, `ArkType`, `TypeBox`).

```ts
// Bad: type-launders untrusted JSON and forces non-null !
const data = (await res.json()) as UserPayload;
const email = data.contacts[0]!.email;

// Good: narrow unknown at the boundary and handle undefined from indexed access
const raw: unknown = await res.json();
const data = UserPayloadSchema.parse(raw);
const primary = data.contacts[0];
if (!primary) {
  throw new MissingContactError(data.userId);
}
const email = primary.email;
```

### 2. Promises and Async Control Flow

Never leave floating promises, pass `async` callbacks to `forEach` or void-returning callbacks, swallow errors with `.catch(() => {})` or `catch { return undefined }`, or return an unawaited promise inside `try` (which skips the local `catch`). Use `for...of` when order matters and `await Promise.all(...)` / `Promise.allSettled(...)` for independent concurrent work.

```ts
// Bad: forEach ignores returned promises; return without await bypasses catch
items.forEach(async (item) => {
  await syncItem(item);
});

async function loadConfig(path: string): Promise<Config> {
  try {
    return readJson(path); // rejection escapes try/catch
  } catch (err) {
    throw new ConfigError("load failed", { cause: err });
  }
}

// Good: awaited concurrency and awaited return inside try
await Promise.all(items.map((item) => syncItem(item)));

async function loadConfig(path: string): Promise<Config> {
  try {
    return await readJson(path);
  } catch (err) {
    throw new ConfigError("load failed", { cause: err });
  }
}
```

### 3. Dynamic Keys and JavaScript Foot-Guns

Never use a plain `{}` object as a mutable map for external or user-controlled keys (`__proto__`, `constructor`, and `toString` collide with `Object.prototype`); use `new Map<string, V>()` or a null-prototype object (`Object.create(null)`) with `Object.hasOwn`.

```ts
// Bad: prototype-key collision and silent undefined truthiness
const counts: Record<string, number> = {};
for (const tag of untrustedTags) {
  counts[tag] = (counts[tag] || 0) + 1;
}

// Good: Map isolates arbitrary external keys
const counts = new Map<string, number>();
for (const tag of untrustedTags) {
  counts.set(tag, (counts.get(tag) ?? 0) + 1);
}
```

Also avoid `==` (use `===`), `var`, `arguments`, `eval` / `new Function`, unbound `this` method references, and committed `console.log` / `debugger` diagnostics.

### 4. React and `.tsx` UI Checks

When `.tsx` or frontend UI files change, verify before toolchain gates:

- **Stack**: keep the repo's router, data-fetching layer, component library, theme tokens, test runner, and build tool; add no UI/state dependency (`Arco`, `Semi`, `VisActor`, `TanStack Query`, `Redux`, `Zustand`, `Tailwind`, etc.) unless the repo uses it or the task requires and vets it.
- **Intent**: product UI follows the product design system; internal admin/ops consoles stay dense and scannable (list/detail/action patterns, not marketing heroes).
- **Typed contracts**: type table rows, filters, route params, and request/response payloads from API contracts or validated schemas—never `any` records.
- **State ownership**: URL/search params hold shareable view state (filters, sort, pagination, active tab); loaders or server-state caches hold remote data; component state holds only local transients (never mirror server data into global stores).
- **States and a11y**: render loading, error, empty, permission-denied, and pending/failure action states; require confirmation on destructive actions; preserve semantic elements, keyboard navigation, and focus across modals/drawers; use design tokens instead of ad hoc inline colors or spacing.

## Strict `tsconfig.json` Baseline

When seeding `tsconfig.json` for a greenfield project (preserving any stricter flags already present):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  }
}
```

Add `"erasableSyntaxOnly": true` (and `"allowImportingTsExtensions": true` with `"noEmit": true`) only when Node runs `.ts`/`.mts` directly via type-stripping; keep it out of projects that rely on enums, parameter properties, or bundler emit. For typed ESLint, prefer `parserOptions.projectService: true`.

## Procedure and Toolchain Gate

1. Identify the `.ts`/`.tsx` and config files touched or under review, and check them against the rules above (including Section 4 when UI changed).
2. Read `package.json` and run the narrowest repository scripts on the touched scope first: typecheck (`tsc --noEmit`), lint (`eslint`), format check, and tests covering the touched files.
3. When the change touches shared behavior, public APIs, security, data, or build tooling, run the full gate (`npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, or the repo's `check` script).
4. Report any unconfigured or missing check as `not available`—never as passed.

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
