## INPUT HANDLING (The Pipe)

- **IF** input is a URL (e.g., `git clone ...` or `https://...`):
    1. **CLONE IT**: `git clone [URL] .` (Ensure directory is empty or create new).
    2. **THEN**: Execute the standard Repro Protocol below.
- **IF** input is current directory:
  - Proceed directly to Phase 1.

## OBJECTIVE

**KILL "WORKS ON MY MACHINE".**
Create a **Hermetic, Deterministic Build Environment**.
The goal: `git clone` -> `make up` -> Working App.
No manual installs. No "magic" global dependencies.

## VIBE CODING INTEGRATION

Reproducible environments enable **fearless iteration**:

- AI can break things → `make clean && make up` restores state
- Deterministic builds → AI-generated code works same everywhere
- One-command setup → Faster context switching between projects

## PROTOCOL

### Phase 1: Artifact Detection

1. **Check Containerization**: Look for `Dockerfile`, `docker-compose.yml` (Compose v2). If missing → create.
2. **Check Scripts**: Look for `Makefile`, `package.json` scripts.
3. **Check Config**: Look for `.env.example`, `.dockerignore`.
4. **Python Tooling**: If Python detected, enforce `uv` for env & execution. **⛔ BANNED**: raw `pip`. Prefer containerized runs or `uv sync` + `uv run ...`.
5. **Lockfiles**: Ensure lockfiles exist (`uv.lock`, `poetry.lock`, `Cargo.lock`, `package-lock.json`/`pnpm-lock.yaml`).

### Phase 2: The Container Mandate (CREATE if missing)

1. **Dockerfile Rules (The "Anti-Casino" Policy)**:
    - **⛔ BANNED**: `latest` tags.
    - **✅ REQUIRED**: Pin image by version; prefer digest pin when possible.
        - *Good*: `node:22-bookworm-slim@sha256:...`
        - *Good*: `python:3.13-slim-bookworm`
    - **Optimization**: Use Multi-Stage builds.
        - `builder`: Install deps, compile code.
        - `runner`: Copy artifacts, minimal runtime; run as non-root.
    - **Apt Hygiene (Debian/Ubuntu)**: `apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*`.
    - **BuildKit Caching**: Prefer `--mount=type=cache` for package caches when feasible.
    - **.dockerignore**: Required to keep context small.

2. **Compose Rules**:
    - Define `app`, `db`, `cache` services.
    - **Networking**: Explicitly define a bridge network.
    - **Volumes**: Use named volumes for persistence (e.g., `postgres_data:/var/lib/postgresql/data`).
    - **Healthchecks**: Mandatory for `db` and `app`.
      - Postgres example:
        - `test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]`
        - `interval: 5s`, `timeout: 5s`, `retries: 20`.
    - **Dependencies**: `depends_on` with `condition: service_healthy` for `app`.
    - **Platform**: When needed (e.g., Apple Silicon), set `platform: linux/amd64` for consistent images.

### Phase 3: The "One-Button" Interface (Makefile)

Standardize the developer experience. Create a `Makefile`:

1. `make setup`: Copy `.env.example` -> `.env`.
2. `make up`: `docker compose up -d` (wait for healthchecks).
3. `make down`: Stop containers.
4. `make clean`: `docker compose down -v` (Nuclear option).
5. `make rebuild`: `docker compose build --no-cache --pull`.

## OUTPUT FORMAT

Output the full content of:

1. `Dockerfile`
2. `docker-compose.yml`
3. `Makefile`
4. `.env.example`
5. `.dockerignore`

## EXECUTION RULES

1. **VERSION PINNING**: You must choose a stable, recent version if none is specified (e.g., `Node 22`, `Python 3.13`, `Postgres 17`). NEVER leave it open; prefer digest pins in CI.
2. **HEALTHCHECKS**: Your DB service in compose MUST have a `healthcheck`. The App service MUST `depends_on` the DB with `condition: service_healthy`.
3. **NO ROOT**: Final container should run as a non-root user.
4. **BUILDKIT**: Build with BuildKit enabled (`DOCKER_BUILDKIT=1`) and cache mounts when useful.
5. **REPRO CI**: In CI, run `docker compose build --pull --no-cache` to verify determinism.

## AI GUARDRAILS

| ⛔ Banned | ✅ Required |
|----------|-------------|
| `latest` tags | Pinned versions (prefer digests) |
| Global npm/pip installs | Container-isolated deps |
| Manual setup steps | Scripted automation |
| Undocumented env vars | `.env.example` template |
| Unhealthy services | Healthchecks + depends_on conditions |
