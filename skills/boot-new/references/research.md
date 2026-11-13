# Research blueprint

For experiments, data analysis, ML training and evaluation, and reproducing a paper's or benchmark's results. Sources: Wilson et al., "Good enough practices in scientific computing" (PLOS Computational Biology, 2017); Cookiecutter Data Science v2; The Turing Way's research compendium.

Requirements: the language toolchain (`uv` for Python, `R` with `renv` for R, `julia` for Julia), GNU Make, and the compute the README names.

```text
<name>/
├── README.md         question, data sources, how to reproduce each result, results table
├── Makefile          setup, data, test, lint, fmt, check, all, clean
├── <manifest>        pyproject.toml + uv.lock (Python), DESCRIPTION + renv.lock (R), or Project.toml + Manifest.toml (Julia)
├── configs/          experiment configs, including seeds
├── data/
│   ├── raw/          original inputs, never edited
│   ├── external/     third-party data
│   ├── interim/      intermediate transforms (generated)
│   └── processed/    final analysis or model inputs (generated)
├── notebooks/        exploratory notebooks (e.g. 01-explore.ipynb), when used
├── <source>/         src/<package>/ (Python), R/ (R), or src/ (Julia)
├── <tests>/          tests/ or test/
├── models/           trained artifacts (ignored)
├── results/          generated metrics, tables, and figures
└── docs/             notes, decisions, paper drafts (when used)
```

Rules:

- Seed the language environment from the matching toolchain:
  - Python: follow the software blueprint's Python section (`uv`, `pyproject.toml`, `uv.lock`, `.python-version`, `src/<package>/`, `tests/`).
  - R: initialize `renv` (`renv::init()`), put reusable functions in `R/`, and tests in `tests/testthat/`.
  - Julia: initialize a package environment (`Project.toml` and `Manifest.toml`), put module code in `src/`, and tests in `test/runtests.jl`.
- Treat `data/raw/` as read-only, and produce everything else from it with code that a `make` target runs.
- Record each data source in the README: URL or DOI, version or access date, license, and SHA-256. `make data` downloads and verifies public sources; a restricted source gets an open item naming its access process.
- Track small, redistributable data; ignore large, restricted, or non-redistributable data.
- Move logic from notebooks into the source directory once a second notebook or a `make` target needs it; when notebooks are committed, strip outputs with `nbstripout`.
- Save each run's config, seed, and Git commit next to its results.
- `make all` runs, in order, every step that produces a reported result.
- Paper or benchmark reproduction: the README results table lists each metric with the reported value, the reproduced value, and the command that produced it; ship the training and evaluation entry points and the pretrained weights with checksums, or state why not.
- README quickstart: `make setup` and `make check`. Name `make all` separately in the README with its expected runtime and hardware.

Kind block for `.gitignore` (delete `data/raw/*` when small raw data is tracked in Git):

```gitignore
data/raw/*
data/external/*
data/interim/*
data/processed/*
models/*
results/*
!data/*/.gitkeep
!models/.gitkeep
!results/.gitkeep
.ipynb_checkpoints/
```
