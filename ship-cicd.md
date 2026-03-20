## OBJECTIVE

**THE ASSEMBLY LINE.**
Humans forget. Machines do not.
Your goal is to build the **Automation Infrastructure** that enforces the `User Rules` automatically.
**The Law**: If it's not in CI, it doesn't exist. If it bypasses Pre-commit, it is illegal.

## CONTEXT STRATEGY (TOKEN ECONOMICS)

*CI Logs are mostly noise.*

1. **Log Parsing**:
    - Do not read the entire 10MB CI log.
    - Grep for `Error:`, `Failed:`, `Exit code 1`.
2. **Config Focus**:
    - When editing `.github/workflows`, read ONLY that file, not the source code.

## VIBE CODING INTEGRATION

CI is the **safety net** for vibe coding:

- AI generates code fast → CI catches mistakes
- Rapid iteration works only with rapid feedback
- Pre-commit hooks prevent AI hallucinations from entering git

## PROTOCOL

### Phase 1: The Local Police (Pre-commit Hooks)

*Stop the garbage before it enters Git.*

1. **Install the Sheriff**:
    - **JS/TS**: Install `husky` + `lint-staged`.
    - **Rust/Python/General**: Install `pre-commit` (Python based framework).
2. **Configure the Rules (`.pre-commit-config.yaml`)**:
    - **Secret Scan**: `gitleaks` / `trufflehog` (Block commits with keys).
    - **Formatter**: `prettier` / `rustfmt` / `black` (Enforce style).
    - **Linter**: `eslint` / `clippy` (Catch basic errors).
    - **No-Go**: DO NOT run heavy tests here. Pre-commit must be fast (< 2s).
3. **Enforcement**:
    - Run `git init`.
    - Run `pre-commit install`.

### Phase 2: The Remote Factory (CI Pipeline)

*GitHub Actions / GitLab CI.*
**Input**: `00-boot/repro.md` (How to run it) & `03-verify/test.md` (How to test it).

Generate the Workflow File (e.g., `.github/workflows/ci.yml`):

1. **Trigger**: On `push` to `main` and `pull_request`.
2. **Job 1: Verification (The Gate)**:
    - Checkout code.
    - Setup Cache (npm/cargo/docker layers).
    - Run `make test` (Unit + Integration).
    - Run `make lint`.
    - Run `make audit` (Security/Deps; SBOM + vulnerability scan).
3. **Job 2: The Build (Preview)**:
    - Attempt `docker buildx build` (multi-arch)
    - *Goal*: Verify the Dockerfile works; generate SBOM; sign image (cosign attest) in non-prod registry
4. **Language-Specific Setup**:
    - **Python**: Use `uv` for deterministic envs: `uv sync`; `uv run pytest -q`
    - **Node**: `actions/setup-node` with cache; `npm ci` then `npm test`. Or `bun install`.
    - **Rust**: cache cargo; `cargo test`/`cargo clippy -- -D warnings`
5. **Security & Supply Chain**:
    - Pin action versions (SHA); enable dependency review
    - **Authentication**: Use OIDC (`aws-actions/configure-aws-credentials` or `google-github-actions/auth`). NO LONG-LIVED KEYS.
    - Enforce signed commits/tags
6. **Platform Matrix**:
    - **Mobile**: MacOS runners for iOS build; Android SDK setup.
    - **IoT**: QEMU setup for ARM emulation tests (`docker/setup-qemu-action`).
7. **Environments**:
    - Per-PR ephemeral env (preview apps) with auto-teardown

### Phase 3: Reporting & Policies

1. **Artifacts**: Upload JUnit, coverage, SBOM, and logs
2. **Concurrency**: Cancel in-progress workflows for superseded commits
3. **Branch Protection**: Require passing checks; disallow force-push to `main`
4. **Thresholds**: Fail fast on lint/test; gate on coverage/perf/security budgets

## OUTPUT FORMAT

**1. The Pre-commit Config (`.pre-commit-config.yaml`)**

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.2
    hooks:
      - id: gitleaks
```

**2. The CI Workflow (`.github/workflows/ci.yml`)**

```yaml
name: The Factory
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup
        run: make setup
      - name: Verify
        run: |
          make test
          make audit
```

## EXECUTION RULES

1. **FAIL FAST**: Put fastest jobs first. Don't run a 10-minute E2E if Linter fails.
2. **CACHE EVERYTHING**: Cache dependencies and Docker layers.
3. **NO "SKIP CI"**: Banned. If you need to skip CI, your commit is trash.
4. **PIN ACTIONS**: Use SHA-pinned actions to prevent supply-chain attacks.
5. **SECRETS**: Use OIDC/secret managers; ban plaintext secrets in CI variables.

## AI GUARDRAILS

| Check | Purpose |
|-------|---------|
| `import` verification | Catch phantom dependencies |
| Type checking (strict) | Catch AI type errors |
| Security scan (gitleaks) | Catch leaked secrets |
| Unused code detection | Catch AI dead code |
| Lint (strict) | Enforce consistent style |
