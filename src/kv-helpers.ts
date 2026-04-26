import type { RefreshStatusRecord, SourceStatus } from "./schema.ts";

/**
 * KV storage helpers for reading/writing snapshot data.
 *
 * The SNAPSHOTS KV namespace may be undefined during local dev
 * (unless wrangler is started with --kv). All helpers handle
 * that gracefully by returning null.
 */

export interface Env {
  SNAPSHOTS: KVNamespace;
  SNAPSHOT_API_KEY: string;
}

const VALID_PROVIDERS = ["keells", "glomark", "cargills"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

export function isValidProvider(value: string): value is Provider {
  return (VALID_PROVIDERS as readonly string[]).includes(value);
}

export function snapshotKey(provider: string, category: string): string {
  return `snapshots:${provider}:${category}`;
}

export function refreshStatusKey(provider: string, category: string): string {
  return `refresh-status:${provider}:${category}`;
}

function isSourceStatus(value: unknown): value is SourceStatus {
  return value === "ok"
    || value === "partial"
    || value === "blocked_or_unstable"
    || value === "not_found";
}

function parseRefreshStatusRecord(value: unknown): RefreshStatusRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isValidProvider(String(record.provider))) return null;
  if (typeof record.category !== "string" || record.category.length === 0) return null;
  if (typeof record.attempted_at !== "string" || record.attempted_at.length === 0) return null;
  if (!isSourceStatus(record.source_status)) return null;
  if (typeof record.item_count !== "number") return null;
  if (typeof record.message !== "string") return null;
  if (typeof record.success !== "boolean") return null;
  return record as RefreshStatusRecord;
}

export async function getSnapshotFromKV(
  env: Env | undefined,
  key: string
): Promise<unknown | null> {
  try {
    if (!env?.SNAPSHOTS) return null;
    const raw = await env.SNAPSHOTS.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function putSnapshotToKV(
  env: Env,
  key: string,
  data: unknown
): Promise<void> {
  await env.SNAPSHOTS.put(key, JSON.stringify(data));
}

export async function getRefreshStatusFromKV(
  env: Env | undefined,
  provider: string,
  category: string
): Promise<RefreshStatusRecord | null> {
  const data = await getSnapshotFromKV(env, refreshStatusKey(provider, category));
  return parseRefreshStatusRecord(data);
}

export async function putRefreshStatusToKV(
  env: Env,
  record: RefreshStatusRecord
): Promise<void> {
  await env.SNAPSHOTS.put(
    refreshStatusKey(record.provider, record.category),
    JSON.stringify(record)
  );
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export type HistoryEntry = {
  date: string;
  prices: Record<string, number | null>;
  prices_per_kg?: Record<string, number | null>;
};

export async function appendPriceHistory(
  env: Env,
  provider: string,
  category: string,
  items: Array<{ id: string; displayed_price_lkr: number | null; price_per_kg_lkr?: number | null }>
): Promise<void> {
  const key = `history:${provider}:${category}`;
  const today = new Date().toISOString().slice(0, 10);

  let history: HistoryEntry[] = [];
  try {
    const raw = await env.SNAPSHOTS.get(key);
    if (raw) history = JSON.parse(raw);
  } catch {}

  const prices: Record<string, number | null> = {};
  const prices_per_kg: Record<string, number | null> = {};
  for (const item of items) {
    prices[item.id] = item.displayed_price_lkr;
    prices_per_kg[item.id] = item.price_per_kg_lkr ?? null;
  }

  const entry: HistoryEntry = { date: today, prices, prices_per_kg };

  const existingIndex = history.findIndex(h => h.date === today);
  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.unshift(entry);
  }

  // Keep last 30 days only
  history = history.slice(0, 30);

  await env.SNAPSHOTS.put(key, JSON.stringify(history));
}

export async function getPriceHistory(
  env: Env | undefined,
  provider: string,
  category: string
): Promise<HistoryEntry[]> {
  if (!env?.SNAPSHOTS) return [];
  try {
    const raw = await env.SNAPSHOTS.get(`history:${provider}:${category}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
