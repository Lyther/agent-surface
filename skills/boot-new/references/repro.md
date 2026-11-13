# Reproduction blueprint

For a bug, crash, regression, or vulnerability (CVE or advisory) at a pinned version. A paper or benchmark result uses `research.md`.

Name the project `<target>-<reference>-repro`, for example `struts2-cve-2024-53677-repro` or `myapp-issue-1234-repro`.

Requirements: the runtime the target needs (or Docker Engine with Compose v2 for service targets) and GNU Make. README quickstart: `make repro` (or `make verify` when a fixed control build is included), followed by `make down` when Compose is used.

```text
<name>/
├── README.md          target, affected/fixed versions, setup, reproduction steps, expected vs observed result
├── Makefile           repro (plus up, verify, down, clean when services or a fixed control are used)
├── env/               pinned environment (compose.yaml, Dockerfile, or target config when needed)
├── poc/               minimal trigger script, input, or test
├── evidence/          captured reproduction logs
└── analysis/          root cause, diff, or bisect notes (when part of the task)
```

Rules:

- Pin the exact affected build: image tag with digest, package version, commit SHA, or kernel/VM image and config in `env/`.
- When a fixed version or comparison build is known or part of the task, add a pinned `fixed` control build and a `verify` target confirming that the trigger reproduces on `affected` and does not reproduce on `fixed`. The trigger then exits 0 when the defect reproduces, 1 when the target answers without it, and any other status when the request or the script fails, so `verify` never counts a failure as a fix.
- Strip every component, option, and step the trigger does not need.
- For a non-service bug in a library or CLI, a minimal script or a failing test in the target's own test framework is sufficient; do not wrap it in containers unless the environment requires isolation.
- When running a vulnerable service in containers, publish ports on `127.0.0.1` only (`127.0.0.1:8080:<port>`), wait for health (`docker compose up -d --wait`) instead of sleeping, and follow `boot-repro` for Dockerfile and Compose details.
- Fix any seeds, clocks, or inputs the trigger depends on.
- Ignore `evidence/*` and re-include `!evidence/.gitkeep` when run output can hold secrets or sensitive data.

`env/compose.yaml` shape for containerized service targets (omit `fixed` when no fixed build exists yet):

```yaml
services:
  affected:
    image: <image>:<affected-version>@sha256:<digest>
    ports:
      - "127.0.0.1:8080:<container-port>"
    healthcheck:
      test: ["CMD", "<command the image provides>"]
      interval: 5s
      timeout: 3s
      retries: 20
  fixed:
    profiles: [fixed]
    image: <image>:<fixed-version>@sha256:<digest>
    ports:
      - "127.0.0.1:8081:<container-port>"
    healthcheck:
      test: ["CMD", "<command the image provides>"]
      interval: 5s
      timeout: 3s
      retries: 20
```

`Makefile` for a containerized reproduction (without a fixed control, drop `verify` and `FIXED_URL`; a non-container reproduction keeps only `help` and a `repro` that runs the trigger without `up`):

```make
.DEFAULT_GOAL := help
.PHONY: help up repro verify down clean

COMPOSE := docker compose -f env/compose.yaml
AFFECTED_URL := http://127.0.0.1:8080
FIXED_URL := http://127.0.0.1:8081
STAMP := $(shell date -u +%Y%m%dT%H%M%SZ)

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Start the builds and wait until healthy
	$(COMPOSE) --profile fixed up -d --wait

repro: up ## Run the trigger against the affected build (exit 0 when reproduced)
	poc/trigger.sh $(AFFECTED_URL) > evidence/$(STAMP)-affected.log 2>&1; status=$$?; cat evidence/$(STAMP)-affected.log; exit $$status

verify: repro ## Pass when the affected build reproduces and the fixed build answers without the defect
	poc/trigger.sh $(FIXED_URL) > evidence/$(STAMP)-fixed.log 2>&1; status=$$?; cat evidence/$(STAMP)-fixed.log; test $$status -eq 1

down: ## Stop the builds
	$(COMPOSE) --profile fixed down

clean: ## Stop the builds and delete their volumes
	$(COMPOSE) --profile fixed down -v
```
