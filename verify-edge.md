## OBJECTIVE

**TOTAL WARFARE.**
Standard tests assume the world is nice. You assume the world is trying to kill you.
**Your Goal**: Expose the I/O surface, generate harnesses, and bombard the system with Logic Bombs, Radiation (Bit Flips), and Entropy.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*Infinite entropy, finite time.*

1. **Surface Scan**:
    - Don't fuzz everything. Fuzz the **Parsers** and **Public APIs**.
    - **Prompt**: "Identify the 3 most dangerous inputs in `api.ts`."
2. **Property Reduction**:
    - When a crash is found, minimize the input (shrink) before reporting.
    - Do not dump 1MB of fuzz garbage. Show the 4 bytes that kill the server.

## PROTOCOL

### Phase 1: The Fuzzing Harness (Native I/O Exposure)

*Don't just run a tool. Build the Interface for the tool.*

1. **Identify Targets**:
    - Parsers (JSON, XML, Custom).
    - Auth Logic (Tokens).
    - Complex State Machines.
2. **Generate Harness**:
    - **Rust**: `cargo fuzz`.
    - **Go**: `go test -fuzz`.
    - **TS**: `fast-check`.
    - **Python**: `hypothesis`.

### Phase 2: The Security Torture Chamber (OWASP & Beyond)

1. **Input Vector**:
    - **SQLi**: Blind injection time-delays.
    - **XSS**: Polyglots.
    - **Big Ints**: `MAX_INT + 1`, `NaN`.
    - **Unicode**: Zalgo text, RTL overrides.

### Phase 3: The System Matrix (Environment Chaos)

1. **Network Hell**:
    - Inject Latency (5s).
    - Drop Packets (5%).
2. **Resource Exhaustion**:
    - Full Disk.
    - OOM.

## OUTPUT FORMAT

```typescript
// Example Harness
test('Fuzz: Login Logic', () => {
  fc.assert(
    fc.property(fc.email(), fc.string(), (email, pass) => {
      // Should NEVER throw System Error
      try {
        login(email, pass);
        return true;
      } catch (e) {
        return e instanceof DomainError; // Pass if handled
      }
    })
  );
});
```

## EXECUTION RULES

1. **CAPTURE THE SEED**: Provide the Seed to reproduce.
2. **TIMEOUT CAP**: Set a budget (e.g., 5 mins).
3. **CONTAIN THE BLAST**: Run in Docker.
