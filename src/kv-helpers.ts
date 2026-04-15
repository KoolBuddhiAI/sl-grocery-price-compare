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
