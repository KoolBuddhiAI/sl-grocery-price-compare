import { getSeededKeellsMeatProducts } from "./adapters/keells.seed.ts";
import { getImportedKeellsProducts, getImportedKeellsMeatProducts, getImportedKeellsSnapshotMeta, parseKeellsImportedSnapshot, normalizeKeellsImportedSnapshot } from "./providers/keells.import.ts";
import { getImportedGlomarkMeatProducts, getImportedGlomarkSnapshotMeta, parseGlomarkImportedSnapshot, normalizeGlomarkImportedSnapshot } from "./providers/glomark.import.ts";
import { getImportedCargillsMeatProducts, getImportedCargillsSnapshotMeta, parseCargillsImportedSnapshot, normalizeCargillsImportedSnapshot } from "./providers/cargills.import.ts";
import { fetchGlomarkCategory } from "./adapters/glomark.fetch.ts";
import { fetchCargillsCategory } from "./adapters/cargills.fetch.ts";
import { getSnapshotFromKV, snapshotKey, isValidProvider, putSnapshotToKV, appendPriceHistory, getPriceHistory, getRefreshStatusFromKV, putRefreshStatusToKV, summarizeError, mergeRefreshStatusRecord } from "./kv-helpers.ts";
import type { Env, HistoryEntry } from "./kv-helpers.ts";
import type { CargillsImportedSnapshot, GlomarkImportedSnapshot, NormalizedProduct, SourceStatus } from "./schema.ts";

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

  // Fall back to static imports
  const imported = getImportedKeellsProducts(category);
  const meta = getImportedKeellsSnapshotMeta(category);

  if (imported && imported.length > 0) {
    return {
      products: imported,
      meta: {
        store: "keells" as const,
        mode: "imported_snapshot" as const,
        source_status: meta?.source_status ?? "partial",
        captured_at: meta?.captured_at ?? "2026-04-12T00:00:00.000Z",
        extraction_mode: meta?.extraction_mode ?? null,
      },
    };
  }

  // Last resort: seed data for meat only
  if (category === "meat") {
    return {
      products: getSeededKeellsMeatProducts(),
      meta: {
        store: "keells" as const,
        mode: "seeded" as const,
        source_status: "partial",
        captured_at: "2026-04-12T00:00:00.000Z",
        extraction_mode: null,
      },
    };
  }

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

  // Normalize to compute price_per_kg_lkr for history
  let normalizedForHistory: Array<{ id: string; displayed_price_lkr: number | null; price_per_kg_lkr: number | null }> = [];
  if (provider === "keells") {
    const snap = parseKeellsImportedSnapshot(body);
    if (snap) normalizedForHistory = normalizeKeellsImportedSnapshot(snap);
  } else if (provider === "glomark") {
    const snap = parseGlomarkImportedSnapshot(body);
    if (snap) normalizedForHistory = normalizeGlomarkImportedSnapshot(snap);
  } else if (provider === "cargills") {
    const snap = parseCargillsImportedSnapshot(body);
    if (snap) normalizedForHistory = normalizeCargillsImportedSnapshot(snap);
  }

  // Fallback: use raw items if normalization failed
  if (normalizedForHistory.length === 0) {
    normalizedForHistory = (payload.items as Array<{ id: string; displayed_price_lkr: number | null }>).map((it) => ({
      id: it.id,
      displayed_price_lkr: it.displayed_price_lkr,
      price_per_kg_lkr: null,
    }));
  }

  await appendPriceHistory(env, provider, category, normalizedForHistory);

  return json({
    ok: true,
    provider,
    category,
    items: payload.items.length,
  });
}

function directionOf(prev: number | null, curr: number | null): "up" | "down" | "same" | null {
  if (prev === null || curr === null) return null;
  if (curr > prev) return "up";
  if (curr < prev) return "down";
  return "same";
}

function isSourceStatus(value: unknown): value is SourceStatus {
  return value === "ok"
    || value === "partial"
    || value === "blocked_or_unstable"
    || value === "not_found";
}

function sourceStatusOfError(error: unknown): SourceStatus {
  if (typeof error === "object" && error !== null && "sourceStatus" in error && isSourceStatus((error as { sourceStatus: unknown }).sourceStatus)) {
    return (error as { sourceStatus: SourceStatus }).sourceStatus;
  }
  return "blocked_or_unstable";
}

function statusCodeForSourceStatus(sourceStatus: SourceStatus): number {
  return sourceStatus === "not_found" ? 404 : 502;
}

type EnrichedProduct = NormalizedProduct & {
  price_direction: "up" | "down" | "same" | null;
  previous_price_lkr: number | null;
  price_per_kg_direction: "up" | "down" | "same" | null;
  previous_price_per_kg_lkr: number | null;
};

function enrichWithPriceChanges(
  products: NormalizedProduct[],
  histories: Map<string, HistoryEntry[]>
): EnrichedProduct[] {
  return products.map(product => {
    const history = histories.get(product.store);
    if (!history || history.length < 2) {
      return {
        ...product,
        price_direction: null,
        previous_price_lkr: null,
        price_per_kg_direction: null,
        previous_price_per_kg_lkr: null,
      };
    }

    // history[0] is today/latest, history[1] is previous
    const previousPrices = history[1]?.prices || {};
    const previousPricesPerKg = history[1]?.prices_per_kg || {};
    const prevPrice = previousPrices[product.id] ?? null;
    const prevPricePerKg = previousPricesPerKg[product.id] ?? null;

    return {
      ...product,
      price_direction: directionOf(prevPrice, product.displayed_price_lkr),
      previous_price_lkr: prevPrice,
      price_per_kg_direction: directionOf(prevPricePerKg, product.price_per_kg_lkr),
      previous_price_per_kg_lkr: prevPricePerKg,
    };
  });
}

async function refreshProviderCategory<TSnapshot extends GlomarkImportedSnapshot | CargillsImportedSnapshot>(
  env: Env,
  provider: "glomark" | "cargills",
  category: string,
  fetchSnapshot: (category: string) => Promise<TSnapshot>,
  normalizeSnapshot: (
    snapshot: TSnapshot
  ) => Array<{ id: string; displayed_price_lkr: number | null; price_per_kg_lkr?: number | null }>
): Promise<void> {
  const attemptedAt = new Date().toISOString();
  const previousStatus = await getRefreshStatusFromKV(env, provider, category);

  try {
    const snapshot = await fetchSnapshot(category);
    const itemCount = snapshot.items.length;
    const success = itemCount > 0;
    const message = success
      ? `${provider}: fetched ${itemCount} items and updated snapshot`
      : `${provider}: fetch completed with 0 items; snapshot/history not updated`;

    if (success) {
      await putSnapshotToKV(env, snapshotKey(provider, category), snapshot);
      await appendPriceHistory(env, provider, category, normalizeSnapshot(snapshot));
    }

    await putRefreshStatusToKV(env, mergeRefreshStatusRecord(previousStatus, {
      provider,
      category,
      attempted_at: attemptedAt,
      source_status: snapshot.source_status,
      item_count: itemCount,
      message,
      success,
    }));
  } catch (error) {
    await putRefreshStatusToKV(env, mergeRefreshStatusRecord(previousStatus, {
      provider,
      category,
      attempted_at: attemptedAt,
      source_status: sourceStatusOfError(error),
      item_count: 0,
      message: summarizeError(error),
      success: false,
    }));
  }
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
      const histories = new Map<string, HistoryEntry[]>();
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
      try {
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
      } catch (error) {
        const sourceStatus = sourceStatusOfError(error);
        return json({
          error: summarizeError(error),
          meta: {
            store: "cargills",
            category,
            source_status: sourceStatus,
          },
        }, { status: statusCodeForSourceStatus(sourceStatus) });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/glomark/fetch") {
      const category = url.searchParams.get("category") || "meat";
      try {
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
      } catch (error) {
        const sourceStatus = sourceStatusOfError(error);
        return json({
          error: summarizeError(error),
          meta: {
            store: "glomark",
            category,
            source_status: sourceStatus,
          },
        }, { status: statusCodeForSourceStatus(sourceStatus) });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const healthData: Record<string, unknown> = {};

      for (const category of CATEGORIES) {
        const keells = await getKeellsProducts(env, category);
        const glomark = await getGlomarkProducts(env, category);
        const cargills = await getCargillsProducts(env, category);
        const glomarkRefresh = await getRefreshStatusFromKV(env, "glomark", category);
        const cargillsRefresh = await getRefreshStatusFromKV(env, "cargills", category);

        healthData[category] = {
          keells: { ...keells.meta, count: keells.products.length },
          glomark: { ...glomark.meta, count: glomark.products.length, refresh_status: glomarkRefresh },
          cargills: { ...cargills.meta, count: cargills.products.length, refresh_status: cargillsRefresh },
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
      ctx.waitUntil(refreshProviderCategory(
        env,
        "glomark",
        category,
        fetchGlomarkCategory,
        snapshot => normalizeGlomarkImportedSnapshot(snapshot)
      ));
      ctx.waitUntil(refreshProviderCategory(
        env,
        "cargills",
        category,
        fetchCargillsCategory,
        snapshot => normalizeCargillsImportedSnapshot(snapshot)
      ));
    }
  },
};
