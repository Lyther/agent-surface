---
name: boot-repro
description: "Create a reproducible environment and command path for a project."
---

## Objective

Make the project hermetic and deterministic: `git clone` -> `make up` -> working app, with no manual setup steps, global npm or pip installs, or undocumented environment variables; dependencies live in the container.

## Input

- A URL (`git clone ...` or `https://...`): run `git clone [URL] .` into an empty directory (create a new one if needed), then follow the procedure.
- The current directory: start at step 1.

## Procedure

1. Detect artifacts: `Dockerfile` and `docker-compose.yml` (Compose v2), created if missing; `Makefile` and `package.json` scripts; `.env.example` and `.dockerignore`. Ensure lockfiles exist (`uv.lock`, `poetry.lock`, `Cargo.lock`, `package-lock.json` or `pnpm-lock.yaml`). For Python, use `uv` (`uv sync`, `uv run ...`) or containerized runs, never raw `pip`.
2. Dockerfile:
   - Pin the base image by version and prefer a digest (`node:22-bookworm-slim@sha256:...`, `python:3.13-slim-bookworm`); never `latest`. With no version specified, choose a stable recent one (Node 22, Python 3.13, Postgres 17).
   - Multi-stage: `builder` installs dependencies and compiles; `runner` copies artifacts into a minimal runtime and runs as a non-root user.
   - Debian/Ubuntu: `apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*`.
   - Build with BuildKit (`DOCKER_BUILDKIT=1`), using `--mount=type=cache` for package caches when useful.
   - Add a `.dockerignore` to keep the context small.
3. Compose:
   - Define `app` plus only the backing services the project uses (for example `db` or `cache`); a stateless tool gets `app` alone.
   - Define an explicit bridge network and named volumes for persistence (e.g. `postgres_data:/var/lib/postgresql/data`).
   - Give `app` and each backing service a healthcheck, e.g. Postgres: `test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]`, `interval: 5s`, `timeout: 5s`, `retries: 20`.
   - `app` uses `depends_on` with `condition: service_healthy` for each backing service.
   - Set `platform: linux/amd64` when needed for consistent images (e.g. Apple Silicon).
4. Makefile:
   - `make setup`: copy `.env.example` -> `.env` only when `.env` does not exist.
   - `make up`: `docker compose up -d --wait` (returns once healthchecks pass).
   - `make down`: stop containers.
   - `make clean`: `docker compose down -v` (removes volumes).
   - `make rebuild`: `docker compose build --no-cache --pull`.
5. In CI, run `docker compose build --pull --no-cache` to verify determinism, with digest-pinned images.

## Output

Create or update `Dockerfile`, `docker-compose.yml`, `Makefile`, `.env.example` (every environment variable, documented), and `.dockerignore`; without file-edit tools, output their full content.
