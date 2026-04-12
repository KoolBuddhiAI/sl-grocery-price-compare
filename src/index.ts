import { getSeededKeellsMeatProducts } from "./adapters/keells.seed.ts";
import { getImportedKeellsMeatProducts, getImportedKeellsSnapshotMeta } from "./providers/keells.import.ts";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/products") {
      const importedProducts = getImportedKeellsMeatProducts();
      const importedMeta = getImportedKeellsSnapshotMeta();

      return json({
        data: importedProducts ?? getSeededKeellsMeatProducts(),
        meta: {
          store: "keells",
          category: "meat",
          mode: importedProducts ? "imported_snapshot" : "seeded",
          source_status: importedMeta?.source_status ?? "partial",
          captured_at: importedMeta?.captured_at ?? "2026-04-12T00:00:00.000Z",
          note: importedProducts
            ? "Using checked-in browser-assisted Keells snapshot data. Live Keells fetching remains intentionally disabled in this environment."
            : "Static seeded Keells sample records only. Live Keells fetching is intentionally disabled in this environment because access is region blocked.",
          import: importedMeta
            ? {
                extraction_mode: importedMeta.extraction_mode
              }
            : null
        }
      });
    }

    return json(
      {
        error: "Not found"
      },
      { status: 404 }
    );
  }
};
