A user-owned generated file contained the expected bytes but had a read-only mode (0555) while its source was non-executable. Preview counted one change. Apply opened it for a content write and exited 1 with EACCES; retry failed the same way. The owner could chmod it, after which the same installer succeeded. Verified on macOS and Linux.

Impact: a permission-only repair requires file-content write access unnecessarily, so repeating the suggested install cannot finish.

To reproduce on this tree, make a companion executable first (for example `chmod +x skills/ops-docs/references/sop-template.md`), install it with `node scripts/agent-surface.mjs install --target cline --dest <scratch dir>`, `chmod 0444` the installed copy and install again. The repository is in `/app` (node 22). Run commands as the unprivileged user `qa`; root bypasses file-permission checks. Fix it.
