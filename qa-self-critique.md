## OBJECTIVE

**THE MIRROR TEST.**
You are your own harshest critic.
Before you declare "Done", you must pause and look in the mirror.
**Your Goal**: Catch your own mistakes (logic, style, incomplete thoughts) before the human does.
**The Standard**: If the human finds a trivial bug you could have found, you failed.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

1. **Wait State**:
    - Do NOT run this on every single line change.
    - Run this **after** a `dev-feature` implementation but **before** `ship-commit`.
2. **Fresh Eyes**:
    - "Forget" the prompt that generated the code. Look at the *Result* as if a stranger wrote it.

## PROTOCOL

### Phase 1: The Completion Audit (Did I finish?)

*AI often gets tired and leaves `// TODO` or `...`.*

1. **Scan for Placeholders**:
    - Grep for: `TODO`, `FIXME`, `...`, `pass`, `impl later`.
    - **Action**: If found, **STOP**. You are not done.
    - **Self-Correction**: Implement the missing piece immediately.
2. **Scan for Hallucinations**:
    - Look at imports. Do they look "too convenient"? (e.g., `import { magicFix } from 'utils'`).
    - **Action**: Verify the file/export actually exists.

### Phase 2: The Logic Interrogation

*Does it actually work, or does it just look like code?*

1. **The "Happy Path" Check**:
    - Trace the inputs. If `user` is null, what happens?
    - If `api` times out, does it crash?
2. **The "Off-By-One" Check**:
    - Loops and array indexing.
    - Ranges (`start..end` vs `start..=end`).

### Phase 3: The Refinement Loop

*Polishing the stone.*

1. **Complexity Check**:
    - "Is this `if/else` nested 4 levels deep?" → **Flatten it**.
    - "Is this function 50 lines?" → **Split it**.
2. **Naming Check**:
    - "Is variable `x` descriptive?" → Rename to `userIndex`.
    - "Is function `doIt` descriptive?" → Rename to `processTransaction`.

### Phase 4: Architecture Alignment (NEW)

*Does the code respect project principles?*

1. **Hard-Coded Strings Check**:
    - Grep for: long strings in `.py` files, especially multi-line strings with instructions.
    - **Red Flag**: System prompts, schema instructions, or templates embedded in code.
    - **Action**: Move to external files (`.txt`, `.md`, `.yaml`) and load via a loader module.

2. **Strict Typing Check**:
    - Grep for: `Any`, `dict[str, Any]`, `object`, `# type: ignore`.
    - **Red Flag**: Using `Any` because you were lazy, not because it's necessary.
    - **Action**: Replace with bounded types (`JsonValue`, `TypedDict`, protocols).
    - **Exception**: `# type: ignore` with a comment explaining WHY is acceptable.

3. **Interface Contract Check**:
    - For each interface/protocol, verify the implementation signature matches.
    - **Red Flag**: Interface says `returns X`, implementation returns `Y`.
    - **Action**: Align them. Pick one source of truth.

4. **Dependency Direction Check**:
    - Check `__init__` params. Do they reference concrete classes or protocols?
    - **Red Flag**: `def __init__(self, sandbox: KaliSandbox)` (concrete).
    - **Action**: Use protocols: `def __init__(self, sandbox: SandboxProtocol)`.

5. **Duplicate Definition Check**:
    - Before creating a new class/enum, grep for existing definitions.
    - **Red Flag**: `class Discovery` in two places with different fields.
    - **Action**: One canonical definition + mappers if layers need different shapes.

### Phase 5: Test Policy Compliance (NEW)

*Are tests written correctly?*

1. **Mock/Spy/Stub Audit**:
    - Grep for: `Mock`, `MagicMock`, `AsyncMock`, `patch`, `@mock`.
    - **Policy**: Fakes are preferred. Mocks hide behavior.
    - **Action**: Replace mocks with hand-written Fake classes.
    - Example: `FakeSandbox` with explicit methods instead of `MockSandbox` with `AsyncMock`.

2. **Type Ignore in Tests**:
    - Grep for: `# type: ignore` in test files.
    - **Red Flag**: Indicates your production code has bad typing.
    - **Action**: Fix the production code's type hints, not the test.

## PROMPT PAYLOAD

```text
Act as a Senior Software Engineer reviewing a Junior's PR.
Analyze the code I just wrote/modified in: {{files}}.

**1. Completion Check**:
- Are there any `TODO`s, `...`, or missing implementations?
- **Action**: If YES, list them and implement them NOW.

**2. Hallucination Check**:
- Are all imports real?
- Are all variable names defined?

**3. Quality Check**:
- Are there any "Happy Path" assumptions (missing error handling)?
- Is there any code that is overly complex (nesting > 3)?
- Are type definitions strict (no `any`)?

**4. Architecture Check** (NEW):
- Are there hard-coded prompts or strings that should be external?
- Do interface contracts match implementations?
- Are dependencies on protocols (good) or concrete classes (bad)?
- Are there duplicate type definitions across layers?

**5. Test Policy Check** (NEW):
- Are tests using mocks/spies (bad) or fakes (good)?
- Are there `# type: ignore` comments hiding production bugs?

**OUTPUT**:
- If Clean: "✅ SELF-CRITIQUE PASSED. Ready to commit."
- If Issues: List specific issues and the **Corrected Code Block**.
```

## OUTPUT FORMAT

```markdown
# 🪞 SELF-CRITIQUE REPORT

## 🔴 Unfinished Business
- Found `// TODO: Handle error` in `src/auth.ts`.
- **Fix**: Implemented `try/catch` block.

## ⚠️ Code Smells
- Nested `if` in `calculateTax` (Depth 4).
- **Fix**: Refactored to Guard Clauses.

## 🏗️ Architecture Violations (NEW)
- Hard-coded SYSTEM_PROMPT in `conversation.py`.
- **Fix**: Moved to `prompts/conversation_system.txt`, loaded via `get_prompt()`.

## 🧪 Test Policy Violations (NEW)
- `AsyncMock` used in `test_conversation.py`.
- **Fix**: Replaced with `FakeRouter` class.

## ✅ Verdict
Code is now clean. Running tests...
```

## EXECUTION RULES

1. **AUTO-FIX**: Do not just "report" the error. **FIX IT**.
2. **NO APOLOGIES**: Don't say "I forgot X". Just say "Fixed X".
3. **STRICT TYPES**: If you used `any` because you were lazy, fix it now.
4. **REALITY**: If you imported a ghost library, delete it and write the util yourself.
5. **PROTOCOLS OVER CONCRETE** (NEW): If `__init__` takes a concrete class, make it a protocol.
6. **FAKES OVER MOCKS** (NEW): If tests use `Mock`/`AsyncMock`, replace with hand-written fakes.
7. **PROMPTS ARE EXTERNAL** (NEW): If you wrote a multi-line string with instructions, extract it.

## GREP COMMANDS FOR AUDIT

```bash
# Phase 1: Placeholders
grep -rn "TODO\|FIXME\|pass$" src/

# Phase 4: Architecture
grep -rn "Any\|dict\[str, Any\]\|# type: ignore" src/
grep -rn '""".*\n.*\n.*"""' src/  # Multi-line strings (potential prompts)

# Phase 5: Test Policy
grep -rn "Mock\|MagicMock\|AsyncMock\|@patch" tests/
grep -rn "# type: ignore" tests/
```
