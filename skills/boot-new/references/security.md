# Security workspaces

These workspaces hold client or competition data. Git tracks what the testers write: scope, notes, findings, exploit code, and evidence hashes. Signed documents, raw tool output, captured evidence, and loot stay in ignored paths on encrypted storage with cloud sync off. The scaffold runs no tool against any target.

## Pentest, red team, bug bounty, assessment

Name the workspace `<client>-<engagement-type>-<yyyy>q<n>`, using the client's short name and the quarter in which the test window starts (for example `acme-external-2026q4`), or `<program>-bugbounty` for a bug-bounty workspace.

Requirements: Git, GNU Make, and `sha256sum` or `shasum`.

```text
<workspace>/
├── README.md                   engagement card
├── Makefile                    evidence hashing and verification
├── scope/
│   ├── authorization/          signed authorization, SOW, and ROE (ignored; bug bounty uses scope/program.md)
│   ├── in-scope-hosts.txt      IPs, CIDRs, and hostnames, one per line
│   ├── in-scope-urls.txt       application and API base URLs, one per line
│   ├── out-of-scope-hosts.txt  excluded IPs, CIDRs, and hostnames
│   ├── out-of-scope-urls.txt   excluded URLs and paths
│   └── contacts.md             client contacts, emergency stop contact, testers
├── notes/
│   ├── log.md                  timestamped operator log
│   ├── methodology.md          phase checklist with coverage status
│   ├── cleanup.md              changes made on targets, with disposition
│   └── targets/                one note per host or application
├── recon/                      raw passive OSINT and DNS output (ignored)
├── scans/                      raw active-scan output (ignored)
├── exploits/                   PoC code used, each with target, expected effect, and cleanup
├── evidence/                   captured evidence (ignored), with SHA256SUMS and index.md (tracked)
├── loot/                       credentials, hashes, and sensitive data (ignored)
├── findings/                   one F-NNN-<slug>.md record per validated issue
└── report/                     deliverable source (bug bounty uses submissions/)
```

The README starts with the TLP marking, then the engagement card:

| Field | Content |
| --- | --- |
| Client and asset owner | who commissioned the test, and who owns each in-scope asset |
| Engagement type | external, internal, web application, API, cloud, red team, bug bounty, or other |
| Test window | start and end in UTC |
| Authorization | file in `scope/authorization/` with its SHA-256, approver, and date signed, or `scope/program.md` with the program URL and policy snapshot date |
| Scope | links to the four scope files |
| Rules of engagement | testing hours, prohibited techniques, rate limits, notification and stop procedure |
| Methodology | PTES, NIST SP 800-115, OWASP WSTG, or the client's program |
| TLP marking | TLP:CLEAR, TLP:GREEN, TLP:AMBER, TLP:AMBER+STRICT, or TLP:RED |
| Data handling | storage path and volume encryption status, cloud sync off, remote policy, retention period, destruction method |
| Testers | handles, with contact details in `scope/contacts.md` |

First artifacts:

- The four scope files, filled from the provided scope. Network scanners read the host files (`nmap -iL scope/in-scope-hosts.txt --excludefile scope/out-of-scope-hosts.txt`), and web tools read the URL files. An in-scope URL does not put its whole host in scope; list the host in `in-scope-hosts.txt` only when the scope names it.
- `scope/contacts.md`: client technical contact, emergency stop contact, and testers (role, name, organization, email, phone, availability).
- `notes/log.md`: timestamped operator log (UTC time, operator, source host/IP, target, action or command, result, evidence ID), starting with workspace creation.
- `notes/methodology.md`: phases of the named methodology with coverage status.
- `notes/cleanup.md`: target changes requiring cleanup (UTC time, target, change, disposition, verified by).
- `evidence/index.md`: tracked evidence register (`EVD-NNN` ID, file, SHA-256, captured UTC time, source, finding ID, handling notes).
- An empty, tracked `evidence/SHA256SUMS`.
- README quickstart: `make` and `make evidence-verify`.

Finding records carry the fields `ops-pentest-report` requires (`F-NNN` identifier, title, severity with CVSS v4.0 score and full vector, CWE, CVE when public, ATT&CK technique, affected assets, status, evidence IDs, summary, preconditions, reproduction steps, observed impact, remediation, and retest result).

Check encryption on the volume holding the workspace path (`diskutil info "$(df "<workspace>" | awk 'NR==2 {print $1}')"` on macOS, `findmnt -no SOURCE --target "<workspace>"` with `lsblk` on Linux, or `manage-bde -status` on the workspace drive on Windows); record `unknown` if it cannot be verified. A workspace on an unencrypted volume, in a temporary directory, or inside a cloud-synced folder (iCloud Drive, Dropbox, OneDrive, Google Drive) is an open item to resolve before testing starts. Testing starts only after the authorization artifact is in place and recorded in the engagement card.

Kind block for `.gitignore`:

```gitignore
# Signed documents, raw tool output, and captured data stay on encrypted storage, never in Git
scope/authorization/*
!scope/authorization/.gitkeep
recon/*
!recon/.gitkeep
scans/*
!scans/.gitkeep
evidence/*
!evidence/SHA256SUMS
!evidence/index.md
loot/*
!loot/.gitkeep
# The same data saved outside those directories
*.burp
*.har
*.pcap
*.pcapng
*.kirbi
*.ccache
*.dmp
*.dit
*.pot
*.potfile
```

`Makefile` (`make evidence-add FILE=evidence/<file>` appends that file's hash and never rewrites earlier lines, so a later edit to a recorded evidence file fails `evidence-verify`):

```make
.DEFAULT_GOAL := help
.PHONY: help evidence-add evidence-verify

SHA256 := $(shell command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo shasum -a 256)

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

evidence-add: ## Append the hash of FILE (a file under evidence/) to evidence/SHA256SUMS
	@$(SHA256) "$(FILE)" >> evidence/SHA256SUMS

evidence-verify: ## Check every recorded evidence hash
	@if [ -s evidence/SHA256SUMS ]; then $(SHA256) -c evidence/SHA256SUMS; else echo "No evidence recorded yet."; fi
```

Run `evidence-verify` in the workspace; a fresh clone carries `SHA256SUMS` without the ignored evidence files, so once evidence is recorded `evidence-verify` passes only where the evidence files are present.

Variants:

- Red team: add `notes/deconfliction.md` for control-group contacts and stop procedures, and add `infra/` (with keys in an ignored `infra/secrets/`) when the engagement manages redirector or C2 infrastructure as code.
- Bug bounty: replace `scope/authorization/` with a tracked `scope/program.md` (program URL, policy snapshot date, in-scope assets, rules, and test account names; keep credentials in `secrets/`), and replace `report/` with `submissions/` (one file per report with platform ID and status).

## CTF

Requirements: Git, GNU Make, `sha256sum` or `shasum`, and `uv` when solves use Python.

```text
<event>-<yyyy>/
├── README.md                event, format, flag format, rules, start and end in UTC, team, platform URL
├── Makefile                 dist-verify
├── tools/                   helpers shared across challenges
└── <category>/<challenge>/
    ├── dist/                provided files as downloaded, hashed in dist/SHA256SUMS
    ├── notes.md             recon, hypotheses, mitigations (checksec for pwn), result
    └── solve.py             runnable solve from dist/; local by default, remote by argument
```

- Create the event root, `README.md`, `Makefile`, `tools/`, and any challenge directories already provided; add later challenges as they open and hash their provided files into `dist/SHA256SUMS` before modifying them.
- Large VM images stay ignored; record their hashes in the challenge's `notes.md` instead of `dist/SHA256SUMS` so `dist-verify` passes in a clone.
- Python solves can declare dependencies in a PEP 723 inline metadata block (`uv run solve.py`).
- README quickstart: `make dist-verify`.
- Keep flags and solves out of public remotes until the event ends and its rules allow publication.

`Makefile`:

```make
.DEFAULT_GOAL := help
.PHONY: help dist-verify

SHA256 := $(shell command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo shasum -a 256)

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dist-verify: ## Check each challenge's provided files against its dist/SHA256SUMS
	@find . -path ./.git -prune -o -path '*/dist/SHA256SUMS' -print | sort | { \
		found=0; \
		while IFS= read -r f; do \
			found=1; \
			(cd "$$(dirname "$$f")" && $(SHA256) -c SHA256SUMS) || exit 1; \
		done; \
		[ "$$found" = 1 ] || echo "No challenge files recorded yet."; \
	}
```

Kind block for `.gitignore`:

```gitignore
*.ova
*.qcow2
*.vmdk
*.iso
.gdb_history
```
