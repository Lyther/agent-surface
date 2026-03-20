## §0 META: YOU WILL BE AUDITED

You are generating TypeScript code that will be **reviewed line-by-line by a hostile auditor** who assumes you are lazy, incompetent, and lying until proven otherwise.

TypeScript exists to prevent JavaScript's chaos. If your code requires `any`, `@ts-ignore`, or loose compiler settings, you're doing it wrong.

**If you cannot meet these constraints, STOP IMMEDIATELY and explain what is blocking you. Do not produce garbage and hope it passes.**

## PROCEDURE

1. **Identify scope**: Determine which `.ts`/`.tsx` files were touched or are under review.
2. **Apply language rules**: The full TypeScript policy is in `.cursor/rules/13-lang-typescript.mdc`. It loads automatically for `.ts`/`.tsx` files. Audit against every section.
3. **Run toolchain gates**:

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
