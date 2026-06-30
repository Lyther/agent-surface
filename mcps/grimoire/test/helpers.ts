// grimoire test helpers — build a fixture-backed index into a temp dir and hand back a Store.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, type BuildResult } from "../src/indexer.js";
import { Store } from "../src/store.js";

const here = dirname(fileURLToPath(import.meta.url)); // dist/test
// Fixtures are SOURCE files (not compiled): dist/test -> dist -> grimoire -> test/fixtures.
export const FIXTURE_PACK = join(here, "..", "..", "test", "fixtures", "pack");
export const FIXTURE_QUERIES = join(here, "..", "..", "test", "fixtures", "queries", "queries.json");
export const FIXTURE_COMMIT = "fixturecommit000000000000000000000000aaaa";

export interface Setup { dir: string; res: BuildResult; store: Store; cleanup: () => void }

export function setupIndex(opts?: { commit?: string; indexedAt?: string }): Setup {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-"));
  const res = buildIndex({
    packs: [{ serviceId: "fixture", path: FIXTURE_PACK, commit: opts?.commit ?? FIXTURE_COMMIT }],
    outDir: dir,
    indexedAt: opts?.indexedAt ?? "2026-01-01T00:00:00.000Z",
  });
  const store = new Store({ dir });
  const cleanup = (): void => { store.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, res, store, cleanup };
}
