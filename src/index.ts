import { getSeededKeellsMeatProducts } from "./adapters/keells.seed.ts";
import { getImportedKeellsMeatProducts, getImportedKeellsSnapshotMeta } from "./providers/keells.import.ts";
import { getImportedGlomarkMeatProducts, getImportedGlomarkSnapshotMeta } from "./providers/glomark.import.ts";
import { getImportedCargillsMeatProducts, getImportedCargillsSnapshotMeta } from "./providers/cargills.import.ts";
import { fetchGlomarkCategory } from "./adapters/glomark.fetch.ts";
import { fetchCargillsCategory } from "./adapters/cargills.fetch.ts";
import type { NormalizedProduct } from "./schema.ts";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    ...init
  });
}

function getKeellsProducts() {
  const imported = getImportedKeellsMeatProducts();
  const meta = getImportedKeellsSnapshotMeta();
  return {
    products: imported ?? getSeededKeellsMeatProducts(),
    meta: {
      store: "keells" as const,
      mode: imported ? "imported_snapshot" : "seeded",
      source_status: meta?.source_status ?? "partial",
      captured_at: meta?.captured_at ?? "2026-04-12T00:00:00.000Z",
      extraction_mode: meta?.extraction_mode ?? null,
    },
  };
}

function getGlomarkProducts() {
  const imported = getImportedGlomarkMeatProducts();
  const meta = getImportedGlomarkSnapshotMeta();
  return {
    products: imported ?? [],
    meta: {
      store: "glomark" as const,
      mode: imported ? "imported_snapshot" : "none",
      source_status: meta?.source_status ?? "not_found",
      captured_at: meta?.captured_at ?? null,
      extraction_mode: meta?.extraction_mode ?? null,
    },
  };
}

function getCargillsProducts() {
  const imported = getImportedCargillsMeatProducts();
  const meta = getImportedCargillsSnapshotMeta();
  return {
    products: imported ?? [],
    meta: {
      store: "cargills" as const,
      mode: imported ? "imported_snapshot" : "none",
      source_status: meta?.source_status ?? "not_found",
      captured_at: meta?.captured_at ?? null,
      extraction_mode: meta?.extraction_mode ?? null,
    },
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/products") {
      const storeFilter = url.searchParams.get("store");

      const keells = storeFilter && storeFilter !== "keells" ? null : getKeellsProducts();
      const glomark = storeFilter && storeFilter !== "glomark" ? null : getGlomarkProducts();
      const cargills = storeFilter && storeFilter !== "cargills" ? null : getCargillsProducts();

      const allProducts: NormalizedProduct[] = [
        ...(keells?.products ?? []),
        ...(glomark?.products ?? []),
        ...(cargills?.products ?? []),
      ];

      const stores: Record<string, unknown> = {};
      if (keells) stores.keells = keells.meta;
      if (glomark) stores.glomark = glomark.meta;
      if (cargills) stores.cargills = cargills.meta;

      return json({
        data: allProducts,
        meta: {
          total: allProducts.length,
          category: "meat",
          stores,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/cargills/fetch") {
      const snapshot = await fetchCargillsCategory("meat");
      return json({
        data: snapshot.items,
        meta: {
          store: "cargills",
          category: "meat",
          source_status: snapshot.source_status,
          captured_at: snapshot.captured_at,
          extraction_mode: snapshot.extraction_mode,
          count: snapshot.items.length,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/glomark/fetch") {
      const snapshot = await fetchGlomarkCategory("meat");
      return json({
        data: snapshot.items,
        meta: {
          store: "glomark",
          category: "meat",
          source_status: snapshot.source_status,
          captured_at: snapshot.captured_at,
          extraction_mode: snapshot.extraction_mode,
          count: snapshot.items.length,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const keells = getKeellsProducts();
      const glomark = getGlomarkProducts();
      const cargills = getCargillsProducts();

      return json({
        stores: {
          keells: { ...keells.meta, count: keells.products.length },
          glomark: { ...glomark.meta, count: glomark.products.length },
          cargills: { ...cargills.meta, count: cargills.products.length },
        },
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
