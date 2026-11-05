// SUBSTITUTE_JUSTIFICATION
// - substitute: FIXTURE_PACK and makeStore's disposable index
// - replaces: third-party source packs only in parser/store unit tests that need controlled records and malformed states
// - necessity: real pinned packs cannot safely and deterministically supply each required tiny or malformed input
// - real-option: eval.test.ts and acceptance.test.ts run the checked-out pinned packs when present
// - proof-limit: fixture-backed tests prove local indexing/query behavior, not real-pack content or installation
// - real-proof: npm run install:grimoire, then spawned stdio search/get against the resulting multi-pack index
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

export interface Setup { dir: string; res: BuildResult; store: Store; cleanup: () => void }

export function setupIndex(): Setup {
  const dir = mkdtempSync(join(tmpdir(), "grimoire-"));
  const res = buildIndex({ packs: [{ serviceId: "fixture", path: FIXTURE_PACK }], outDir: dir });
  const store = new Store({ dir });
  const cleanup = (): void => { store.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, res, store, cleanup };
}
