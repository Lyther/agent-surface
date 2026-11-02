---
name: qa-self-critique
description: "Find issues in recently modified files and fix them immediately."
---

## OBJECTIVE

**PRE-COMMIT SELF-VERIFICATION & AUTO-FIX.**
You are verifying and correcting your own recent changes before commit.
**Your Goal**: Find issues in recently modified files and fix them immediately.
**The Standard**: Verify the fix is correct before applying it. A wrong fix is worse than no fix.

## COMPUTE DIRECTIVE

Before emitting any fix, reason through each finding in your thinking block. Verify the fix is correct before applying it. Do not rush to output — a wrong fix is worse than no fix.

## INPUT

```text
qa-self-critique <target> [--fix | --dry-run] [--focus <domains>]
```

## PARAMETERS

| Parameter | Default | Description |
|-----------|---------|-------------|
| `<target>` | required | File(s) or directory just modified |
| `--fix` | default | Find issues and fix them immediately |
| `--dry-run` | off | Report issues without fixing (for review before commit) |
| `--focus <domains>` | all | Comma-separated: `completeness`, `logic`, `types`, `arch`, `tests` |

## WHEN TO RUN

After implementing a feature or fix, before committing. This is a self-correction pass on YOUR OWN recent output — not a review of someone else's code.

- This is a standalone manual audit, not a required workflow handoff stage.

## PROTOCOL

### Pass 1: Tool Scan (EXECUTE, DO NOT GUESS)

**If you have bash/tool access, run these commands first.** Ingest stdout. Fix based on tool output, not visual inspection.

```bash
# 1a. Incomplete work
grep -rnE 'TODO|FIXME|HACK|XXX|STUB|NotImplementedError|pass$|\.\.\.($| #)' {{target}}

# 1b. Type laziness
grep -rnE '\bAny\b|dict\[str,\s*Any\]|#\s*type:\s*ignore' {{target}}

# 1c. Hardcoded strings (potential prompt/config leaks)
# Multi-line string detection needs Python, not single-line grep
python3 -c "
import ast, sys, os
for root, _, files in os.walk('{{target}}'):
    for f in files:
        if not f.endswith('.py'): continue
        path = os.path.join(root, f)
        try:
            tree = ast.parse(open(path).read())
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) > 200:
                    print(f'{path}:{node.lineno}: long string ({len(node.value)} chars)')
        except: pass
"

# 1d. Non-real substitute sweep. Names do not change the policy.
rg -n -i 'mock|fake|fixture|stub|spy|emulat|simulat|adapter|harness|in[-_ ]?memory|monkeypatch|recorded|synthetic|sandbox|test[-_ ]?(mode|implementation)' {{target}} 2>/dev/null
rg -n 'SUBSTITUTE_JUSTIFICATION' {{target}} 2>/dev/null

# 1e. Phantom imports (Python) — top-level module only; submodule imports may not resolve
#     out-of-context, so treat results as a hint, not a verdict.
python3 - <<'PY' "{{target}}"
import ast, importlib.util, os, sys
target = sys.argv[1]
for root, _, files in os.walk(target):
    for f in files:
        if not f.endswith('.py'):
            continue
        path = os.path.join(root, f)
        try:
            tree = ast.parse(open(path, encoding='utf-8').read())
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module] if node.module else []
            else:
                continue
            for mod in names:
                if not mod:
                    continue
                top = mod.split('.', 1)[0]
                if importlib.util.find_spec(top) is None:
                    print(f'PHANTOM: {path}:{node.lineno}: {mod}')
PY

# 1f. Secrets scan
grep -rnEi 'password\s*=|api_key\s*=|secret\s*=|token\s*=.*['\''\"]\w{8,}' {{target}}

# 1g. Formatter/lint drift on YOUR changes (editor-vs-gate). Run the repo's own
#     formatter/linter in --check mode on the changed files — an editor's format-on-save
#     can have re-touched them with an ungated style (wrong line length, reordered
#     imports, re-indented shell). Use the repo's config, not ad-hoc flags. Examples:
#       ruff format --check <files> && ruff check <files>
#       gofumpt -l <files> ; shfmt -d <files>
#       npm run lint ; npm run format:check  # only when defined by the repo
#     If anything is flagged, that is a drift finding — re-run the formatter and fix.
```

**If you do NOT have tool access:** Skip Pass 1. Proceed to Pass 2 with visual inspection only, and note that your coverage is reduced.

### Pass 2: Semantic Checks (ONE DOMAIN AT A TIME)

Process each domain sequentially against the files in scope. Do not attempt all at once.

#### 2a. Completeness

- Any placeholder logic? Stub returns? Empty except blocks?
- Any function that was declared but never fully implemented?
- Do all imports resolve to real modules/exports?
- **Action if found:** Implement immediately. Do not report and move on.

#### 2b. Logic & Error Handling

- Trace the primary input. What happens when it's null/empty/malformed?
- External I/O (network, file, DB): wrapped in error handling?
- Off-by-one: loop bounds, array indexing, range boundaries (`..` vs `..=`)
- State transitions: are all branches covered? Any unreachable code?
- **Action if found:** Fix immediately.

#### 2c. Type Strictness

- `Any` used out of laziness (not necessity)?
  → Replace with `TypedDict`, `Protocol`, bounded generics, or concrete types
- `# type: ignore` without explanation?
  → Fix the underlying type issue, not the symptom
- Return types match declared signatures?
- **Action if found:** Fix immediately.
- **Exception:** `# type: ignore  # <reason>` with genuine justification is acceptable.

#### 2d. Architecture

- Multi-line strings containing instructions/prompts/schemas embedded in code?
  → Extract to external file, load via utility
- `__init__` params referencing a concrete class that already has a second implementation?
  → Replace with protocol/interface
- Duplicate type/class definitions across files?
  → Consolidate to one canonical definition
- Secrets or per-deployment values (hosts, accounts, paths) hardcoded?
  → Read them from the environment
- **Action if found:** Fix immediately.

#### 2e. Kernel error-path quadrant (when `lint:kernel` mode applies)

Skip this domain when the target is not C kernel code. When it is:

- For each cleanup helper called under `out_*:` / `goto err_*`, did you read it end-to-end? List every state mutation it performs. If the helper has more side effects than "undo the previous step", you are likely calling the wrong helper.
- Enumerate `(input × concurrent-op)` quadrants for every selector in the failing function (`gbl_chg`, `map_chg`, `max_hpages`, ...). A quadrant with no documented cleanup is a bug.
- Grep the same file for existing `out_*` ladders on the same struct. The pattern you need is probably already there — mirror it instead of inventing.
- For paired charge / uncharge of two ownership domains (e.g., `h_cg` vs `h_cg_rsvd`), are they stored in **separate** locals? If a single local is reused, task migration / preemption can break ownership.
- Reservation / accounting deltas: does any cleanup unconditionally `++` a counter that has a global invariant (`resv_huge_pages <= free_huge_pages`)? A concurrent free can drop `free_huge_pages` between the failed step and the cleanup. Decrement under the owning lock; do not raw-bump shared counters.
- **Action if found:** Fix immediately by mirroring an existing `out_*` ladder in the same file. Do not invent new cleanup logic when precedent exists.

#### 2f. Test Quality

- Any mock, fake, stub, spy, emulator, in-memory service, monkeypatch, recorded service response, sandbox, test mode, or renamed replacement for a boundary the code calls? A constructed input that the real code reads is not a substitute.
  → Require a complete `SUBSTITUTE_JUSTIFICATION` for each use. If the real component or a disposable real instance can safely and deterministically serve the assertion, remove the substitute.
- Does the necessity say only "faster", "easier", "hermetic", "offline", "CI", "flaky service", or "missing credentials"?
  → Reject it. Missing real prerequisites block that test layer; they do not authorize fake evidence.
- Is a substitute-backed run counted as evidence for the boundary it replaced (integration, E2E, acceptance, security, readiness)?
  → Remove it from the evidence set and mark the required real layer `BLOCKED` until it runs.
- `# type: ignore` in tests hiding production type bugs?
  → Fix the production types, not the test
- Tests asserting implementation details (mock call counts) instead of behavior?
  → Rewrite to assert outputs/state
- **Action if found:** Fix immediately.

### Pass 3: Apply Fixes

**`--fix` mode (default):**

Output ONLY the file modifications. For each fix, emit:

```text
# [one-line description of what was fixed]
[file edit / diff / tool call to apply the change]
```

No apologies. No "I noticed that...". No Markdown report sections. Just the fix with a one-line label.

After all fixes are applied:

```text
[AUDIT_COMPLETE]: {N} issues fixed across {M} files.
```

**`--dry-run` mode:**

Output a compact finding list (no fixes applied):

```text
[AUDIT_DRY_RUN]:
- {file}:{line}: {one-line description} [{domain}]
- {file}:{line}: {one-line description} [{domain}]
...
{N} issues found. Run /audit --fix to apply.
```

**If clean:**

```text
[AUDIT_PASS]: Clean. Ready to commit.
```

## CAPABILITY BOUNDARIES

**Can do:**

- Pattern-match incomplete code, bad types, structural smells
- Trace logic paths for null/error/edge cases
- Identify architecture violations by inspection
- Fix all of the above in-place

**Cannot do without tools:**

- Verify imports actually resolve (needs Python interpreter)
- Run tests (needs execution environment)
- Check dependency versions for CVEs (needs package audit tools)
- Measure actual complexity metrics (needs AST tooling)

If a check requires tools you don't have, skip it. Do not pretend.

## EXECUTION RULES

1. **FIX, don't report.** This is not `qa-review`. You are correcting your own work: fix what the scan shows is wrong, and add no guard, check, configuration, or test that a found defect does not call for.
2. **Tool output overrides visual inspection.** If grep found it, it's real. Don't rationalize it away.
3. **One domain at a time.** Don't scan for type issues while thinking about error handling.
4. **No apologies, no narrative.** "Fixed X" not "I noticed I forgot X, sorry about that."
5. **Wrong fix > no fix? NO.** If you're unsure about a fix, flag it for human review instead of applying a bad patch.

## DISTRIBUTION

This canonical skill is emitted to each runtime's native Agent Skills root. It is not duplicated into command surfaces on hosts that already support skills.

## EXAMPLES

```text
qa-self-critique src/auth/
qa-self-critique . --dry-run
qa-self-critique src/ tests/ --focus types,arch
qa-self-critique src/api/router.py --fix
```
