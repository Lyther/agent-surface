// grimoire — the 4 read-only tool definitions: their input shapes (zod, for the host
// schema + validation) and the dispatch to the store. server.ts wires these onto an
// McpServer. Results are the typed status DTOs from store; the server renders them as
// structuredContent + a labeled text mirror.
import type { ZodRawShape } from "zod";
import {
  FileGetInput, GetInput, ListInput, SearchInput, TOOL_DESCRIPTIONS,
  type FileGetArgs, type GetArgs, type ListArgs, type SearchArgs,
} from "./contract.js";
import type { Store } from "./store.js";

export interface GrimoireTool {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  run(store: Store, args: unknown): unknown;
}

export function grimoireTools(): GrimoireTool[] {
  return [
    {
      name: "grimoire_search",
      description: TOOL_DESCRIPTIONS["grimoire_search"]!,
      inputShape: SearchInput.shape,
      run: (s, a) => { const x = a as SearchArgs; return s.search(x.query, x.k); },
    },
    {
      name: "grimoire_list",
      description: TOOL_DESCRIPTIONS["grimoire_list"]!,
      inputShape: ListInput.shape,
      run: (s, a) => { const x = a as ListArgs; return s.list(x.category, x.cursor); },
    },
    {
      name: "grimoire_get",
      description: TOOL_DESCRIPTIONS["grimoire_get"]!,
      inputShape: GetInput.shape,
      run: (s, a) => { const x = a as GetArgs; return s.get(x.id); },
    },
    {
      name: "grimoire_file_get",
      description: TOOL_DESCRIPTIONS["grimoire_file_get"]!,
      inputShape: FileGetInput.shape,
      run: (s, a) => { const x = a as FileGetArgs; return s.fileGet(x.id, x.path); },
    },
  ];
}
