Under umask 0077, the previous artifact created and retained an ordinary managed file at 0600. Its bytes and execute mask were unchanged. The current preview reported zero writes, and apply reported zero writes while setting 0644. Public-file controls reproduced the mode change on macOS and Linux.

Impact: a routine repeat can silently widen the file-level read boundary on a private local asset. Planning checks execute bits, while the skip branch applies the whole declared mode.

On this tree no shipped companion declares a mode, so to reproduce, make one executable first (for example `chmod +x skills/ops-docs/references/sop-template.md`) and install it with `node scripts/agent-surface.mjs install --target cline --dest <scratch dir>` twice. The repository is in `/app` (node 22). Run commands as the unprivileged user `qa`; root bypasses file-permission checks. Fix it.
