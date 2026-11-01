export const CHECK_DEALS_BELT_IDS = [
  "top-deals",
  "for-you",
] as const;

export type CheckDealsBeltId = (typeof CHECK_DEALS_BELT_IDS)[number];

export const DEFAULT_CHECK_DEALS_BELT_ORDER: readonly CheckDealsBeltId[] = CHECK_DEALS_BELT_IDS;

export const CHECK_DEALS_BELT_LABELS: Record<CheckDealsBeltId, string> = {
  "top-deals": "Top Savers & Dodgiest Deals",
  "for-you": "Your saved categories",
};

const STORAGE_PREFIX = "dodgey-deals:check-deals-belt-order:v1:";

export function normalizeCheckDealsBeltOrder(value: unknown): CheckDealsBeltId[] {
  const seen = new Set<CheckDealsBeltId>();
  const normalized: CheckDealsBeltId[] = [];

  if (Array.isArray(value)) {
    // Migrate the previous three-belt preference without losing the one
    // meaningful choice: whether saved categories appeared before or after
    // the combined Top Savers/Dodgiest Deals group.
    const legacyValues = value.filter((candidate): candidate is string => typeof candidate === "string");
    const legacyForYouIndex = legacyValues.indexOf("for-you");
    const legacyTopDealsIndex = legacyValues.findIndex(
      (candidate) => candidate === "top-savers" || candidate === "dodgiest-deals",
    );
    if (legacyTopDealsIndex >= 0) {
      if (legacyForYouIndex >= 0 && (legacyTopDealsIndex < 0 || legacyForYouIndex < legacyTopDealsIndex)) {
        return ["for-you", "top-deals"];
      }
      return [...DEFAULT_CHECK_DEALS_BELT_ORDER];
    }

    for (const candidate of value) {
      if (typeof candidate !== "string" || !CHECK_DEALS_BELT_IDS.includes(candidate as CheckDealsBeltId)) continue;
      const belt = candidate as CheckDealsBeltId;
      if (seen.has(belt)) continue;
      seen.add(belt);
      normalized.push(belt);
    }
  }

  for (const belt of DEFAULT_CHECK_DEALS_BELT_ORDER) {
    if (!seen.has(belt)) normalized.push(belt);
  }

  return normalized;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

export function readCheckDealsBeltOrder(scope = "device"): CheckDealsBeltId[] {
  if (typeof window === "undefined") return [...DEFAULT_CHECK_DEALS_BELT_ORDER];

  try {
    const stored = window.localStorage.getItem(storageKey(scope));
    return normalizeCheckDealsBeltOrder(stored ? JSON.parse(stored) : null);
  } catch {
    return [...DEFAULT_CHECK_DEALS_BELT_ORDER];
  }
}

export function writeCheckDealsBeltOrder(order: readonly CheckDealsBeltId[], scope = "device"): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(normalizeCheckDealsBeltOrder(order)));
    return true;
  } catch {
    return false;
  }
}
