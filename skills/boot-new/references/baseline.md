# Baseline files

Compose each file from the blocks the project uses and drop the rest.

## .gitignore

Build the file in this order:

1. The language block from the blueprint. For a language no blueprint covers, start from its github/gitignore template (`https://raw.githubusercontent.com/github/gitignore/main/<Name>.gitignore`), delete sections for frameworks and tools the project does not use, and anchor build-output directories to the root (`/build/` rather than `build/`) so that a source directory with the same name stays tracked.
2. The shared blocks below. Omit any editor or agent directory whose configuration the request or the existing repository shares.
3. The kind block from the blueprint, when it has one.

```gitignore
# OS files
.DS_Store
Thumbs.db
desktop.ini

# Local editor and agent state
.idea/
.vscode/
*.code-workspace
.agent-surface/
.agents/
.claude/
.cursor/
.factory/
.gemini/
.windsurf/

# Secrets and local configuration
.env
.env.*
!.env.example
.envrc
.netrc
*.pem
*.key
*.p12
*.pfx
*.kdbx
id_rsa*
id_ecdsa*
id_ed25519*
secrets/
```

Keep an ignored directory in the tree by ignoring its contents and re-including the placeholder:

```gitignore
loot/*
!loot/.gitkeep
```

Check with `git check-ignore <path>` (without `-v`, which also prints paths that a `!` rule re-includes) and `git ls-files -ci --exclude-standard`.

## .gitattributes

```gitattributes
* text=auto eol=lf
```

Add `*.bat text eol=crlf` / `*.cmd text eol=crlf` when the repository ships Windows batch scripts, and `*.<ext> binary` lines (such as `*.png`, `*.pdf`, `*.pcap`, `*.so`) for binary asset types the repository stores so Git disables text diffs and merges on them.

## .editorconfig

Include `[*]` plus only the sections that match files in the repository:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 4

[*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,yml,yaml,html,css,scss,sh,bash}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[{Makefile,*.mk,*.go,go.mod}]
indent_style = tab
```

## Makefile

Start with the help target so `make` alone lists the targets. Declare phony targets `.PHONY`, give each user-facing target a `## description`, chain dependent steps in a recipe with `&&`, and call another target with `$(MAKE) <target>`.

```make
.DEFAULT_GOAL := help
.PHONY: help

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
```

## README.md

````markdown
# <name>

<What it is, who it is for, and its status, in one paragraph. A prototype says it is disposable.>

| Kind | Maturity | Visibility |
| --- | --- | --- |
| <kind> | <maturity> | <public, private, or client-confidential> |

## Layout

```text
<tree with one line per directory and top-level file, each with its purpose>
```

## Requirements

- <tool> (verified with <version>)

## Quickstart

```sh
<the blueprint's quickstart commands>
```

## Development

Install the Git hooks once per clone with `pre-commit install`.

## Configuration

Copy `.env.example` to `.env` and set each value.

## License

<The SPDX identifier with a link to LICENSE, or "Proprietary. Not licensed for distribution.">

## Open items

| Missing input | Provided by | Unblocks |
| --- | --- | --- |
| <input> | <person or team> | <what it unblocks> |
````

Drop the Maturity column for kinds other than software, "Development" when the project has no `.pre-commit-config.yaml`, "Configuration" when it reads no environment variables, and "Open items" when nothing is missing. Blueprints add their own sections.

## .env.example

```dotenv
# Base URL of the upstream API. Required.
API_BASE_URL=https://api.example.com
# Token for the upstream API. Required; never commit the real value.
API_TOKEN=change-me
```

## .pre-commit-config.yaml (software: core and up, or when requested)

```yaml
repos:
  - repo: local
    hooks:
      - id: lint
        name: lint
        entry: make lint
        language: system
        pass_filenames: false
```

- The hook calls the project's `lint` target, which checks formatting without rewriting files, so a commit never changes files it does not include; Node projects use two hooks, `npm run format:check` and `npm run lint`. Commits, CI, and editors run the same locked tools offline.
- When secret or file-size scanning is also wanted at commit time, add `detect-private-key` and `check-added-large-files` from `https://github.com/pre-commit/pre-commit-hooks` pinned to a verified tag or commit SHA.
- `pre-commit` is a required tool for these scaffolds; install the hooks with `pre-commit install`, and run `pre-commit run --all-files` after staging.

## CI (software: core and up, or when requested)

Use GitHub Actions when the host is GitHub or unknown, and an equivalent `.gitlab-ci.yml` job on GitLab. Security workspaces get no CI.

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@<commit-sha> # <tag>
        with:
          persist-credentials: false
      # toolchain setup steps from the software blueprint
      - run: make setup
      - run: make check
```

- Pin every action to the full commit SHA of a verified release tag (`<sha> # <tag>`), resolved from the action repository (`git ls-remote --tags`); never invent a SHA.
- Use a fixed runner label (`ubuntu-24.04` or a newer LTS label), not `ubuntu-latest`.
- Node projects run `npm ci` and `npm run check` instead of the make targets. Append `make audit` (or `npm run audit`) when the project defines an `audit` target and requires it in CI.
