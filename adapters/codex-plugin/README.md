# codex-plugin adapter

An **export format**, not a host to install into. `build` renders a portable plugin package and the
local marketplace manifest a host's own plugin manager consumes; that manager then owns installation,
caching, enablement, and removal. `install --target codex-plugin` is refused, and `--target all`
skips it, because agent-surface has no business deciding where a package belongs.

```bash
node scripts/agent-surface.mjs build --target codex-plugin
codex plugin marketplace add dist/codex-plugin
codex plugin add agent-surface@agent-surface
codex plugin list
codex plugin remove agent-surface@agent-surface
```

Generated layout, relative to the marketplace root you pass to `plugin marketplace add`:

```text
.agents/plugins/marketplace.json                    Marketplace manifest
plugins/agent-surface/plugin.json                   Portable Agent Plugins manifest
plugins/agent-surface/skills/ops-swarm/SKILL.md     Canonical skill
plugins/agent-surface/skills/ops-swarm/references/  Its companion files
```

One plugin manifest, in the portable location the format specifies. Its `$schema` identifier is a
required const in the [published manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json),
not decoration: against `codex-cli 0.153.2` a package whose manifest omits it is rejected on install
with `missing plugin.json`, and the same package with it installs, caches its companions, appears in
model-visible discovery, and is cleanly removed. An earlier revision read that rejection as a missing
host-specific manifest and shipped a `.codex-plugin/` copy alongside; the copy was compensating for
an invalid manifest and is gone. Installing here does **not** establish that other hosts load the
package; they are unqualified.

Two layout details are fixed by the host rather than chosen here: the marketplace manifest lives
under `.agents/plugins/`, and a relative plugin source resolves from the marketplace **root**, not
from the manifest's own directory.

The pilot packages one canonical skill. It renders the same source every other adapter renders, so
there is no second copy to maintain. Plugin-contributed skills are namespaced `<plugin>:<skill>`, so
the packaged `agent-surface:ops-swarm` and a direct-file `ops-swarm` can be installed at once without
colliding — though both still occupy discovery space, which is accepted for the pilot rather than
solved with a deduplication mechanism.

Rules, subagents, and MCP servers are deliberately absent. This pilot proves the package loading path
for skills; forcing other source kinds into a portable shape that does not represent their semantics
would prove nothing.
