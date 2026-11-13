---
name: boot-new
description: "Use when creating a new project or reorganizing an existing project's folder structure. Builds the conventional layout for the project's kind (software, pentest or other security engagement, CTF, bug or CVE reproduction, research), initializes Git, writes the baseline repository files, and verifies the first run from a fresh clone."
---

## Objective

Build a repository that a newcomer can navigate and run from its README alone: the conventional layout for the project's kind and ecosystem, Git with a scaffold commit (for new repositories), the shared baseline files, one task entry point, and a first slice whose quickstart commands pass. A bare source folder, a tree of empty directories, or a new project without Git is not a scaffold.

## Input

`boot-new [run|check] [--kind auto|software|pentest|ctf|repro|research|other] [--maturity auto|prototype|mvp|core|usable|production|business]`

- `run` (default): plan, build, commit, and verify.
- `check`: inspect and print the plan without writing or installing anything.

Resolve from the request and target directory:

- All kinds: kind, project name (kebab-case), parent directory, and visibility (public, private, or client-confidential; pentest defaults to client-confidential, others to private).
- Software: language, shape (CLI, service, library, web UI, desktop), and maturity (`auto` reads the request and defaults to `mvp`). The blueprint's package manager and runtime version apply unless the request or repository names others.
- Pentest: the engagement card fields in `references/security.md`.
- CTF: event, format, flag format, start and end time.
- Repro: target, affected version, fixed version (when known), and reference (CVE, advisory, or issue).
- Research: question or claim, language, data sources and their licenses, and compute needs.

When a consequential input that affects scope, safety, or execution is still unknown (such as engagement authorization, restricted dataset access, or an unknown Go module host), mark it `PENDING` and list it under "Open items" in the README. Do not invent open items for fields the project does not use. Ask one focused question through `ops-ask` only when the language is unknown and nothing in the request or directory implies one, or when a public project has no named license.

## Blueprints

| Kind | Blueprint | Covers |
| --- | --- | --- |
| all | `references/baseline.md` | shared baseline files, optional hooks, and optional CI |
| software | `references/software.md` | CLIs, services, libraries, and web UIs in Python, Rust, Go, TypeScript, and other ecosystems |
| pentest, ctf | `references/security.md` | pentest, red team, bug bounty, and assessment workspaces; CTF events |
| repro | `references/repro.md` | bug, crash, regression, and CVE reproductions |
| research | `references/research.md` | experiments, data analysis, ML, and paper or benchmark reproduction |

Each blueprint lists its required tools, layout, files, and README quickstart. For `other` (docs site, infrastructure as code, dataset, writing) and for an ecosystem no blueprint covers, look up the official generator and documented layout, official docs first, cite them in the plan, and apply the shared baseline. Follow the blueprint unless a stated project need requires a deviation, and name each deviation in the plan.

## Procedure

1. Inspect the target (read-only). Run `git -C <nearest existing ancestor of the target> rev-parse --show-toplevel`: a printed path means the target sits inside that repository, so follow "Existing projects" instead of creating a nested repository; exit code 128 means it does not. A target that already holds project files (manifests or source) also follows "Existing projects". For an existing directory, record its manifests, Git state, and uncommitted, ignored, and untracked files.
2. Check which required tools (`git` and the blueprint's requirements for the selected kind and maturity) are present on the machine.
3. Plan: print the tree with a one-line purpose for every directory and top-level file, the quickstart commands, any missing tools, each deviation from the blueprint, and any open items. Stop here in `check` mode.
4. Install any missing required tool with the platform package manager, or report `BLOCKED` with the install command. Create the directory with `mkdir -p` and run `git init -b main` in it.
5. When the ecosystem has an official generator, run it in place with its own VCS step disabled, reshape its output to the blueprint, and replace its sample code and placeholder text. Never hand-write what a generator produces.
6. Add the blueprint's directories and files, then the shared baseline. Create only directories that hold files now or that the blueprint requires as ignored workspaces (kept with `.gitkeep` via `dir/*` and `!dir/.gitkeep`).
7. Write the first slice. Software executables: an entry point that performs the first behavior the request names (or a `--version` or health path when it names none) and a test that calls it; libraries: the first exported function or type and a test that calls it. Other kinds: the first artifacts the blueprint lists. Write no placeholder function, TODO stub, or task target that cannot run yet.
8. Generate the lockfile where the ecosystem has one (`uv lock`, `cargo generate-lockfile`, `go mod tidy`, `npm install`) and run the checks needed to confirm the scaffold works. Fix every failure without loosening a check.
9. Run `git add -A` and read `git status --short`. Keep secrets, credentials, data captured from targets, and build output out of the index by fixing `.gitignore`. When the scaffold has `.pre-commit-config.yaml`, run `pre-commit run --all-files` after staging so hooks check the tracked snapshot. Commit with the message `Create project scaffold`. If Git has no author identity, stop and report `BLOCKED`; never set one.
10. Clone the repository into a temporary directory, run the README's quickstart commands there, and delete the clone. On failure, fix the scaffold, amend the scaffold commit, and repeat.
11. Add a remote or push only when the user asks. Never add a remote to a pentest workspace unless the client's data-handling terms allow that host.

## Shared baseline

Every kind gets these files; `references/baseline.md` holds their content.

- `README.md`: purpose and status; kind, maturity (software only), and visibility; a layout map with one line per directory and top-level file; requirements with the versions verified; quickstart commands; license; and, when applicable, configuration, open items, and the blueprint's extra sections.
- `.gitignore`: the blueprint's language block, the OS, local editor/agent, and secret blocks, then the blueprint's kind block. Track lockfiles.
- `.gitattributes`: text normalized to LF, plus binary or CRLF rules for file types the repository stores.
- `.editorconfig`: UTF-8, LF, final newline, trimmed trailing whitespace, and indentation for the project's languages.
- One task entry point: `package.json` scripts for Node projects, otherwise a `Makefile` whose default target lists the others; keep an existing runner (just, Task, nox). Software defines `setup`, `test`, and `clean`, plus `lint`, `fmt`, and `check` from `mvp` up, `run` for executables, and `audit` when requested or at `production`+ maturity; Node projects use `npm ci` and the blueprint's scripts in place of these targets; other kinds use the targets their blueprint lists. Add only targets whose commands work.
- `.env.example`: only when the project reads environment variables, listing each variable with a dummy value while `.env` and `.env.*` stay ignored.
- License: a public project gets a `LICENSE` file with the SPDX license the user names. A private or client-confidential project gets no `LICENSE` file, states "Proprietary. Not licensed for distribution." in the README, and blocks accidental publishing in its manifest as the blueprint shows.

## Software maturity

Size the scaffold to the requested maturity (`03-project-defaults`):

- `prototype`: the baseline, the blueprint's test runner, and a README note that the project is disposable; no formatter, linter, or type-checker setup, hooks, or CI.
- `mvp` (default): the blueprint's lint, formatter, and type-checker config and focused tests. Add `.pre-commit-config.yaml`, CI, or `audit` at `mvp` only when the request or repository workflow asks for them.
- `core`: `.pre-commit-config.yaml`, a CI workflow running `setup` and `check`, integration tests, and only the persistence or integrations the core contract requires.
- `usable`: a user guide in `docs/`, `CHANGELOG.md` (Keep a Changelog), an operator guide when others deploy or operate the project, and `CONTRIBUTING.md` when others contribute.
- `production`: `SECURITY.md` and an `audit` target or dependency-update config (Dependabot or Renovate); container, deployment, and release files (`boot-repro`, `ship-cicd`) only for the deployment and release path the project has.
- `business`: only the tenancy, audit, compliance, and governance controls the business or regulatory contract names.

Add no database, cache, queue, extra service, container, monorepo, or cloud resource without a current requirement.

## Existing projects

1. Print the move map (`old -> new`) with every reference that changes and the baseline files to add. Stop here in `check` mode.
2. Run the project's current checks and record the results as the baseline.
3. In an unversioned directory, write `.gitignore` first, run `git init -b main`, confirm that no secret is staged, and commit the untouched files as `Import existing files` so the restructure becomes a reviewable diff.
4. Leave uncommitted, ignored, and untracked work in place; when a path you must move has uncommitted changes, stop and list it.
5. Apply the move map with `git mv` so history follows the files.
6. Update imports, manifests, build and test config, CI paths, container contexts, scripts, and documentation links, then add any missing baseline files.
7. Keep the stack, conventions, and any stronger existing tooling; never migrate technology to match a blueprint.
8. Re-run the baseline checks and the README's quickstart in the working tree; each check must equal or improve its recorded baseline.
9. Leave the restructure uncommitted for review unless the user asks to commit (`ship-commit` packages it once accepted).

For an `ops-nuke` respawn, build the approved design's layout in the respawn worktree, skip `git init` and the import commit, and treat the old implementation as reference evidence, not a template. Route broad accumulated cleanup to `ops-clean`.

## Completion

- `COMPLETE`:
  - New repository: the `Create project scaffold` commit exists; the README's quickstart commands pass in a fresh clone; `git check-ignore` matches `.env` and any ignored kind directories; and `git ls-files -ci --exclude-standard` prints nothing.
  - Existing project: the moved layout and baseline files are in place; each recorded baseline check matches or improves its baseline result and the README quickstart passes in the working tree; and no secret or ignored file is tracked or staged.
- `IMPLEMENTED BUT UNVERIFIED`: the files exist, but the verification run did not happen.
- `BLOCKED`: a missing toolchain, Git identity, credential, service, or required input stops the run; name it with the command that unblocks it.

## Output

In `check` mode, print the planned layout tree, quickstart commands, missing tools, blueprint deviations, and open items. In `run` mode, do not repeat the layout tree or quickstart already written to `README.md`; report the path, branch, commit (or uncommitted restructure state), verified toolchain versions, blueprint deviations, open items, and the standard `Changed` / `Checks` / `Status` / `Blockers` report.
