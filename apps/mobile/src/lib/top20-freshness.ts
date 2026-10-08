import { normalizeStoreKey, type DealSnapshotKind } from "@dodgey-deals/shared";

const TOP20_SNAPSHOT_VERSION = 1;
const TOP20_STORAGE_PREFIX = "dd-top20-snapshot-v1";

export interface Top20SnapshotEntry {
  productId: string;
  store: string;
}

export interface Top20Snapshot {
  version: typeof TOP20_SNAPSHOT_VERSION;
  publishedAt: string;
  keys: string[];
  newKeys: string[];
}

export function getTop20DealKey(productId: string, store: string): string {
  return `${productId}::${normalizeStoreKey(store)}`;
}

export function getTop20StorageKey(kind: DealSnapshotKind, scopeKey: string): string {
  return `${TOP20_STORAGE_PREFIX}:${kind}:${encodeURIComponent(scopeKey || "all")}`;
}

export function createTop20Snapshot(
  entries: readonly Top20SnapshotEntry[],
  publishedAt: string | null,
): Top20Snapshot | null {
  if (!publishedAt) return null;

  return {
    version: TOP20_SNAPSHOT_VERSION,
    publishedAt,
    keys: [...new Set(entries.map(({ productId, store }) => getTop20DealKey(productId, store)))],
    newKeys: [],
  };
}

export function resolveTop20Snapshot(
  current: Top20Snapshot,
  previous: Top20Snapshot | null,
): Top20Snapshot {
  const currentKeys = new Set(current.keys);
  const newKeys = previous?.publishedAt === current.publishedAt
    ? previous.newKeys.filter((key) => currentKeys.has(key))
    : previous
      ? current.keys.filter((key) => !previous.keys.includes(key))
      : [];

  return { ...current, newKeys: [...new Set(newKeys)] };
}

export function readTop20Snapshot(storageKey: string): Top20Snapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Top20Snapshot>;
    if (
      parsed.version !== TOP20_SNAPSHOT_VERSION ||
      typeof parsed.publishedAt !== "string" ||
      !Array.isArray(parsed.keys) ||
      !Array.isArray(parsed.newKeys) ||
      !parsed.keys.every((key) => typeof key === "string") ||
      !parsed.newKeys.every((key) => typeof key === "string")
    ) {
      return null;
    }

    return {
      version: TOP20_SNAPSHOT_VERSION,
      publishedAt: parsed.publishedAt,
      keys: [...new Set(parsed.keys)],
      newKeys: [...new Set(parsed.newKeys)],
    };
  } catch {
    return null;
  }
}

export function writeTop20Snapshot(storageKey: string, snapshot: Top20Snapshot): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
