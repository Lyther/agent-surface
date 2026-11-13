# Software blueprints

Run the generator, then reshape its output. A `prototype` leaves out the items marked `mvp` and up and the `lint`, `fmt`, and `check` targets. The `lint-python`, `lint-rust`, `lint-go`, and `lint-typescript` skills review code against these configs.

## Layout

```text
<name>/
├── .github/workflows/ci.yml   core and up, or when requested
├── docs/                      usable and up: user guide, plus an operator guide when others deploy it
├── examples/                  sample inputs that `run` uses, when an executable needs input
├── <source>/                  per ecosystem below
├── <tests>/                   per ecosystem below
├── scripts/                   only automation the task runner calls
├── .editorconfig
├── .env.example               when the project reads environment variables
├── .gitattributes
├── .gitignore
├── .pre-commit-config.yaml    core and up, or when requested
├── LICENSE                    public projects
├── Makefile                   package.json scripts for Node projects
├── README.md
└── <manifest and lockfile>
```

- Monorepo: only when two or more independently built components exist now. Use the ecosystem's workspace (uv workspace, Cargo workspace, npm workspaces) with one directory per component; a Go repository keeps one module with a `cmd/<component>/` directory per command.
- New UI with no stack named: Rust with Leptos or Python with Reflex, generated from the framework's official starter. When the request or repository uses React or another web stack, keep it and use its official generator, for example `npm create vite@latest <name> -- --template react-ts`.
- Pin the runtime in the ecosystem's version file (`.python-version`, `rust-toolchain.toml` for Rust applications, the `go` line in `go.mod`, `engines.node`) at the newest stable release that the toolchain and dependencies support, and let CI read it from there.
- Executables (CLIs, services, apps) define a `run` target (`start` in Node) that exercises the first slice end to end. A CLI that needs input reads a small sample committed under `examples/`. A service runs in the foreground; to verify it, start `run` in the background, request its health route, and stop the process. Pure libraries omit `run` (`start`) and `examples/` unless requested.
- README quickstart: `make setup`, `make run`, and `make check` (`npm ci`, `npm start`, `npm run check` for Node); libraries omit `make run` / `npm start`, and a `prototype` runs `make test` (`npm test`) in place of `make check`.
- Dependency `audit`: add at `production`+ maturity or when the request asks for it, using the ecosystem command noted below.

## Python

- Requirements: uv, which installs Python.
- Generate: `uv init --package --vcs none --author-from none --python <X.Y> --name <name> .` for an application or CLI, or `--lib` instead of `--package` for a library. `<X.Y>` is the newest stable CPython in `uv python list` that the dependencies support; uv writes it to `.python-version` and `requires-python`. Replace the generated `description` and sample code.
- Layout: `src/<package>/`, `tests/test_<module>.py`, `pyproject.toml`, `uv.lock`, `.python-version`.
- Dev tools: `uv add --dev pytest`; at `mvp` and up, `uv add --dev pytest ruff "pyright[nodejs]"`.
- Private projects add `classifiers = ["Private :: Do Not Upload"]` to `[project]`.
- CI setup step: `astral-sh/setup-uv`; `make setup` then installs the Python version in `.python-version`.
- Optional `audit` target: `uv add --dev pip-audit`, then run `uv run pip-audit`.

`pyproject.toml` additions (`mvp` and up; Ruff takes its target Python version from `requires-python`):

```toml
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "W", "F", "I", "UP", "B", "C4", "SIM", "PIE", "PT", "TID", "PGH", "PLE", "DTZ", "RUF", "S"]
ignore = ["S101", "PT011", "PT018", "SIM102"]

[tool.pyright]
include = ["src", "tests"]
```

`.gitignore` language block:

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
/build/
/dist/
.pytest_cache/
.ruff_cache/
```

```make
.PHONY: setup run test lint fmt check clean

setup: ## Install locked dependencies
	uv sync --locked

run: ## Run the application (omit for libraries)
	uv run <name>

test: ## Run tests
	uv run pytest

lint: ## Check formatting, lint, and type-check
	uv run ruff format --check .
	uv run ruff check .
	uv run pyright

fmt: ## Format and apply safe lint fixes
	uv run ruff format .
	uv run ruff check --fix .

check: ## Run the format, lint, type, and test checks
	$(MAKE) lint test

clean: ## Remove generated files
	rm -rf .pytest_cache .ruff_cache dist
```

## Rust

- Requirements: rustup.
- Generate: `cargo init --vcs none --name <name>`, adding `--lib` for a library, then replace the generated sample code.
- Layout (Cargo conventions): `src/main.rs` or `src/lib.rs`, `src/bin/` for more binaries, `tests/` for integration tests, and `examples/` and `benches/` once they have content. Commit `Cargo.lock`.
- Applications pin the toolchain in `rust-toolchain.toml`, with `channel` set to the current stable version and `components = ["rustfmt", "clippy"]`.
- Private projects set `publish = false` under `[package]`.
- Run `cargo generate-lockfile` before the first `--locked` command.
- CI setup step: `rustup toolchain install`, which installs the toolchain that `rust-toolchain.toml` names.
- Optional `audit` target: `cargo audit` (requires `cargo-audit`).

`Cargo.toml` lint table (`mvp` and up):

```toml
[lints.clippy]
all = { level = "deny", priority = -1 }
dbg_macro = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
undocumented_unsafe_blocks = "deny"
unimplemented = "deny"
unwrap_used = "deny"
```

`clippy.toml` (with the lint table), which lets tests use `unwrap` and `expect`:

```toml
allow-expect-in-tests = true
allow-unwrap-in-tests = true
```

`.gitignore` language block:

```gitignore
# Rust
/target/
```

```make
.PHONY: setup run test lint fmt check clean

setup: ## Fetch locked dependencies
	cargo fetch --locked

run: ## Run the binary (omit for libraries)
	cargo run --locked

test: ## Run tests, including doctests
	cargo test --locked --all-features

lint: ## Check formatting and run Clippy with warnings as errors
	cargo fmt --all --check
	cargo clippy --locked --all-targets --all-features -- -D warnings

fmt: ## Format
	cargo fmt --all

check: ## Run the format, lint, and test checks
	$(MAKE) lint test

clean: ## Remove build output
	cargo clean
```

## Go

- Requirements: Go; `golangci-lint` v2 (`mvp` and up).
- Generate: `go mod init <module-path>`, using the repository path (`github.com/<owner>/<name>`) when the host is known, otherwise `<name>` plus an open item.
- Layout (<https://go.dev/doc/modules/layout>): one command keeps `main.go` at the root; supporting packages go in `internal/<package>/`; several commands, or commands beside importable packages, use `cmd/<command>/main.go`; a library keeps its package at the root. Tests sit beside the code as `*_test.go`. Add `pkg/` or `src/` only when the repository already uses them. Commit `go.sum` once dependencies exist.
- Seed `.golangci.yml` from the recipe in rule `12-go` (`mvp` and up); `golangci-lint run` checks formatting as well as lint rules, and `golangci-lint fmt` fixes formatting.
- CI setup steps: `actions/setup-go` with `go-version-file: go.mod`, then `golangci/golangci-lint-action` with a pinned `version` and `install-only: true`, so the shared `make check` step runs lint and tests once.
- Optional `audit` target: `go get -tool golang.org/x/vuln/cmd/govulncheck@latest`, then `go tool govulncheck ./...`.

`.gitignore` language block:

```gitignore
# Go
/bin/
*.test
```

```make
.PHONY: setup run build test lint fmt check clean

setup: ## Download modules
	go mod download

run: ## Run the command (omit for libraries)
	go run .

build: ## Build the binary into bin/ (omit for libraries)
	go build -o bin/<name> .

test: ## Run tests (add -race when the package uses concurrency)
	go test ./...

lint: ## Lint, including formatting
	golangci-lint run ./...

fmt: ## Format
	golangci-lint fmt

check: ## Run the lint and test checks
	$(MAKE) lint test

clean: ## Remove build output
	rm -rf bin
```

## TypeScript on Node

- Requirements: Node.js 22.18 or later with npm.
- Generate: `npm init -y`, then `npm pkg delete main`, `npm pkg set type=module`, and `npm pkg set 'engines.node=>=22.18'`. Applications and private projects add `npm pkg set private=true --json`. Set `license` to the chosen SPDX identifier, or to `UNLICENSED` for a private project.
- Dev tools (`mvp` and up): `npm install --save-dev typescript @types/node eslint @eslint/js typescript-eslint prettier`.
- Layout: `src/index.ts` and `test/<name>.test.ts`; relative imports carry the `.ts` extension.
- CI setup step: `actions/setup-node` with `node-version-file: package.json`.
- Optional `audit` script: `"audit": "npm audit --omit=dev"`.

`tsconfig.json` (`mvp` and up; the strict flags from rule `13-typescript`, plus the options for code Node runs directly):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "types": ["node"],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

A library that publishes JavaScript adds a `tsconfig.build.json` that emits `dist/` with declarations and `rewriteRelativeImportExtensions`, and points `exports` at `dist/`.

`eslint.config.js` (`mvp` and up; the `node:test` entry lets tests call `test()` without awaiting it):

```js
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["describe", "it", "suite", "test"],
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
```

`package.json` scripts:

| Script | Command |
| --- | --- |
| `start` | `node src/index.ts` (omit for libraries) |
| `test` | `node --test 'test/**/*.test.ts'` |
| `typecheck` | `tsc` |
| `lint` | `eslint .` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `check` | `npm run format:check && npm run typecheck && npm run lint && npm test` |

A `prototype` keeps only `start` and `test`.

`.gitignore` language block:

```gitignore
# Node
node_modules/
/dist/
/coverage/
*.tsbuildinfo
npm-debug.log*
```

## Other ecosystems

Use the ecosystem's official generator and documented layout as `SKILL.md` describes (C and C++ with CMake: `src/`, `include/<name>/`, and `tests/`), and build `.gitignore` from the github/gitignore template as `baseline.md` describes.
