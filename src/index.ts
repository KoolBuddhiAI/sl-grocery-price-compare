import { getSeededKeellsMeatProducts } from "./adapters/keells.seed.ts";
import { getImportedKeellsMeatProducts, getImportedKeellsSnapshotMeta, parseKeellsImportedSnapshot, normalizeKeellsImportedSnapshot } from "./providers/keells.import.ts";
import { getImportedGlomarkMeatProducts, getImportedGlomarkSnapshotMeta, parseGlomarkImportedSnapshot, normalizeGlomarkImportedSnapshot } from "./providers/glomark.import.ts";
import { getImportedCargillsMeatProducts, getImportedCargillsSnapshotMeta, parseCargillsImportedSnapshot, normalizeCargillsImportedSnapshot } from "./providers/cargills.import.ts";
import { fetchGlomarkCategory } from "./adapters/glomark.fetch.ts";
import { fetchCargillsCategory } from "./adapters/cargills.fetch.ts";
import { getSnapshotFromKV, snapshotKey, isValidProvider, putSnapshotToKV, appendPriceHistory, getPriceHistory } from "./kv-helpers.ts";
import type { Env } from "./kv-helpers.ts";
import type { NormalizedProduct } from "./schema.ts";

const CATEGORIES = ["meat", "seafood", "vegetables", "fruits"] as const;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    },
    ...init
  });
}

async function getKeellsProducts(env?: Env, category: string = "meat") {
  // Try KV first
  const kvData = await getSnapshotFromKV(env, snapshotKey("keells", category));
  const kvSnapshot = kvData ? parseKeellsImportedSnapshot(kvData) : null;

  if (kvSnapshot && kvSnapshot.items.length > 0) {
    return {
      products: normalizeKeellsImportedSnapshot(kvSnapshot),
      meta: {
        store: "keells" as const,
        mode: "kv_snapshot" as const,
        source_status: kvSnapshot.source_status,
        captured_at: kvSnapshot.captured_at,
        extraction_mode: kvSnapshot.extraction_mode,
      },
    };
  }

  // Fall back to static imports (only available for meat)
  if (category === "meat") {
    const imported = getImportedKeellsMeatProducts();
    const meta = getImportedKeellsSnapshotMeta();
    return {
      products: imported ?? getSeededKeellsMeatProducts(),
      meta: {
        store: "keells" as const,
        mode: imported ? "imported_snapshot" as const : "seeded" as const,
        source_status: meta?.source_status ?? "partial",
        captured_at: meta?.captured_at ?? "2026-04-12T00:00:00.000Z",
        extraction_mode: meta?.extraction_mode ?? null,
      },
    };
  }

  // No static fallback for non-meat categories
  return {
    products: [],
    meta: {
      store: "keells" as const,
      mode: "none" as const,
      source_status: "not_found" as const,
      captured_at: null,
      extraction_mode: null,
    },
  };
}

async function getGlomarkProducts(env?: Env, category: string = "meat") {
  // Try KV first
  const kvData = await getSnapshotFromKV(env, snapshotKey("glomark", category));
  const kvSnapshot = kvData ? parseGlomarkImportedSnapshot(kvData) : null;

  if (kvSnapshot && kvSnapshot.items.length > 0) {
    return {
      products: normalizeGlomarkImportedSnapshot(kvSnapshot),
      meta: {
        store: "glomark" as const,
        mode: "kv_snapshot" as const,
        source_status: kvSnapshot.source_status,
        captured_at: kvSnapshot.captured_at,
        extraction_mode: kvSnapshot.extraction_mode,
      },
    };
  }

  // Fall back to static imports (only available for meat)
  if (category === "meat") {
    const imported = getImportedGlomarkMeatProducts();
    const meta = getImportedGlomarkSnapshotMeta();
    return {
      products: imported ?? [],
      meta: {
        store: "glomark" as const,
        mode: imported ? "imported_snapshot" as const : "none" as const,
        source_status: meta?.source_status ?? "not_found",
        captured_at: meta?.captured_at ?? null,
        extraction_mode: meta?.extraction_mode ?? null,
      },
    };
  }

  // No static fallback for non-meat categories
  return {
    products: [],
    meta: {
      store: "glomark" as const,
      mode: "none" as const,
      source_status: "not_found" as const,
      captured_at: null,
      extraction_mode: null,
    },
  };
}

async function getCargillsProducts(env?: Env, category: string = "meat") {
  // Try KV first
  const kvData = await getSnapshotFromKV(env, snapshotKey("cargills", category));
  const kvSnapshot = kvData ? parseCargillsImportedSnapshot(kvData) : null;

  if (kvSnapshot && kvSnapshot.items.length > 0) {
    return {
      products: normalizeCargillsImportedSnapshot(kvSnapshot),
      meta: {
        store: "cargills" as const,
        mode: "kv_snapshot" as const,
        source_status: kvSnapshot.source_status,
        captured_at: kvSnapshot.captured_at,
        extraction_mode: kvSnapshot.extraction_mode,
      },
    };
  }

  // Fall back to static imports (only available for meat)
  if (category === "meat") {
    const imported = getImportedCargillsMeatProducts();
    const meta = getImportedCargillsSnapshotMeta();
    return {
      products: imported ?? [],
      meta: {
        store: "cargills" as const,
        mode: imported ? "imported_snapshot" as const : "none" as const,
        source_status: meta?.source_status ?? "not_found",
        captured_at: meta?.captured_at ?? null,
        extraction_mode: meta?.extraction_mode ?? null,
      },
    };
  }

  // No static fallback for non-meat categories
  return {
    products: [],
    meta: {
      store: "cargills" as const,
      mode: "none" as const,
      source_status: "not_found" as const,
      captured_at: null,
      extraction_mode: null,
    },
  };
}

async function handleSnapshotPush(request: Request, env: Env): Promise<Response> {
  // Check authorization
  const authHeader = request.headers.get("Authorization");
  const expectedToken = env?.SNAPSHOT_API_KEY;

  if (!expectedToken || !authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const provider = payload.provider;
  const category = payload.category;

  if (typeof provider !== "string" || !isValidProvider(provider)) {
    return json({ error: "Invalid provider. Must be keells, glomark, or cargills." }, { status: 400 });
  }

  if (typeof category !== "string" || !category) {
    return json({ error: "Missing category field" }, { status: 400 });
  }

  if (!Array.isArray(payload.items)) {
    return json({ error: "Missing or invalid items array" }, { status: 400 });
  }

  const key = snapshotKey(provider, category);
  await putSnapshotToKV(env, key, body);
  await appendPriceHistory(env, provider, category, payload.items as Array<{ id: string; displayed_price_lkr: number | null }>);

  return json({
    ok: true,
    provider,
    category,
    items: payload.items.length,
  });
}

function enrichWithPriceChanges(
  products: NormalizedProduct[],
  histories: Map<string, Array<{ date: string; prices: Record<string, number | null> }>>
): Array<NormalizedProduct & { price_direction: string | null; previous_price_lkr: number | null }> {
  return products.map(product => {
    const history = histories.get(product.store);
    if (!history || history.length < 2) {
      return { ...product, price_direction: null, previous_price_lkr: null };
    }

    // history[0] is today/latest, history[1] is previous
    const previousPrices = history[1]?.prices || {};
    const prevPrice = previousPrices[product.id] ?? null;
    const currentPrice = product.displayed_price_lkr;

    let direction: string | null = null;
    if (prevPrice !== null && currentPrice !== null) {
      if (currentPrice > prevPrice) direction = "up";
      else if (currentPrice < prevPrice) direction = "down";
      else direction = "same";
    }

    return { ...product, price_direction: direction, previous_price_lkr: prevPrice };
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/snapshots") {
      return handleSnapshotPush(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      const store = url.searchParams.get("store");
      const category = url.searchParams.get("category") || "meat";

      if (!store) {
        return json({ error: "Missing required query parameter: store" }, { status: 400 });
      }

      const history = await getPriceHistory(env, store, category);
      return json({ data: history });
    }

    if (request.method === "GET" && url.pathname === "/api/products") {
      const storeFilter = url.searchParams.get("store");
      const categoryFilter = url.searchParams.get("category") || "meat";

      const keells = storeFilter && storeFilter !== "keells" ? null : await getKeellsProducts(env, categoryFilter);
      const glomark = storeFilter && storeFilter !== "glomark" ? null : await getGlomarkProducts(env, categoryFilter);
      const cargills = storeFilter && storeFilter !== "cargills" ? null : await getCargillsProducts(env, categoryFilter);

      const allProducts: NormalizedProduct[] = [
        ...(keells?.products ?? []),
        ...(glomark?.products ?? []),
        ...(cargills?.products ?? []),
      ];

      // Load price histories for enrichment
      const storeNames = ["keells", "glomark", "cargills"].filter(
        s => !storeFilter || s === storeFilter
      );
      const histories = new Map<string, Array<{ date: string; prices: Record<string, number | null> }>>();
      for (const s of storeNames) {
        const h = await getPriceHistory(env, s, categoryFilter);
        if (h.length > 0) histories.set(s, h);
      }

      const enrichedProducts = enrichWithPriceChanges(allProducts, histories);

      const stores: Record<string, unknown> = {};
      if (keells) stores.keells = keells.meta;
      if (glomark) stores.glomark = glomark.meta;
      if (cargills) stores.cargills = cargills.meta;

      return json({
        data: enrichedProducts,
        meta: {
          total: enrichedProducts.length,
          category: categoryFilter,
          stores,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/cargills/fetch") {
      const category = url.searchParams.get("category") || "meat";
      const snapshot = await fetchCargillsCategory(category);
      return json({
        data: snapshot.items,
        meta: {
          store: "cargills",
          category,
          source_status: snapshot.source_status,
          captured_at: snapshot.captured_at,
          extraction_mode: snapshot.extraction_mode,
          count: snapshot.items.length,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/glomark/fetch") {
      const category = url.searchParams.get("category") || "meat";
      const snapshot = await fetchGlomarkCategory(category);
      return json({
        data: snapshot.items,
        meta: {
          store: "glomark",
          category,
          source_status: snapshot.source_status,
          captured_at: snapshot.captured_at,
          extraction_mode: snapshot.extraction_mode,
          count: snapshot.items.length,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const healthData: Record<string, unknown> = {};

      for (const category of CATEGORIES) {
        const keells = await getKeellsProducts(env, category);
        const glomark = await getGlomarkProducts(env, category);
        const cargills = await getCargillsProducts(env, category);

        healthData[category] = {
          keells: { ...keells.meta, count: keells.products.length },
          glomark: { ...glomark.meta, count: glomark.products.length },
          cargills: { ...cargills.meta, count: cargills.products.length },
        };
      }

      return json({
        categories: [...CATEGORIES],
        stores: healthData,
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const category of CATEGORIES) {
      // Fetch Glomark
      const glomarkSnapshot = await fetchGlomarkCategory(category);
      if (glomarkSnapshot.items.length > 0) {
        await env.SNAPSHOTS.put(snapshotKey("glomark", category), JSON.stringify(glomarkSnapshot));
        await appendPriceHistory(env, "glomark", category, glomarkSnapshot.items);
      }

      // Fetch Cargills
      const cargillsSnapshot = await fetchCargillsCategory(category);
      if (cargillsSnapshot.items.length > 0) {
        await env.SNAPSHOTS.put(snapshotKey("cargills", category), JSON.stringify(cargillsSnapshot));
        await appendPriceHistory(env, "cargills", category, cargillsSnapshot.items);
      }
    }
  },
};
