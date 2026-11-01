export const DEAL_DETECTIVE_STREAK_VERSION = 2;

export interface DealDetectiveStreakState {
  version: number;
  streak: number;
  lastCaseKey: string | null;
  lastResult: "win" | "loss" | null;
  completedCaseKeys: string[];
}

const DEAL_DETECTIVE_STREAK_STORAGE_PREFIX = "dd-deal-detective-streak-v2:";

const EMPTY_STREAK: DealDetectiveStreakState = {
  version: DEAL_DETECTIVE_STREAK_VERSION,
  streak: 0,
  lastCaseKey: null,
  lastResult: null,
  completedCaseKeys: [],
};

function storageKey(scope: string): string {
  return `${DEAL_DETECTIVE_STREAK_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDealDetectiveStreak(scope = "device"): DealDetectiveStreakState {
  const storage = getStorage();
  if (!storage) return { ...EMPTY_STREAK };

  try {
    const raw = storage.getItem(storageKey(scope));
    if (!raw) return { ...EMPTY_STREAK };
    const parsed = JSON.parse(raw) as Partial<DealDetectiveStreakState>;
    const parsedStreak = parsed.streak;
    if (
      parsed.version !== DEAL_DETECTIVE_STREAK_VERSION
      || typeof parsedStreak !== "number"
      || !Number.isSafeInteger(parsedStreak)
      || parsedStreak < 0
      || (parsed.lastCaseKey !== null && typeof parsed.lastCaseKey !== "string")
      || (parsed.lastResult !== null && parsed.lastResult !== "win" && parsed.lastResult !== "loss")
      || !Array.isArray(parsed.completedCaseKeys)
      || parsed.completedCaseKeys.some((caseKey) => typeof caseKey !== "string")
    ) return { ...EMPTY_STREAK };
    const streak = parsedStreak as number;
    return {
      version: DEAL_DETECTIVE_STREAK_VERSION,
      streak,
      lastCaseKey: parsed.lastCaseKey ?? null,
      lastResult: parsed.lastResult ?? null,
      completedCaseKeys: parsed.completedCaseKeys,
    };
  } catch {
    return { ...EMPTY_STREAK };
  }
}

export function advanceDealDetectiveStreak(
  current: DealDetectiveStreakState,
  caseKey: string,
  won: boolean,
): DealDetectiveStreakState {
  if (current.completedCaseKeys.includes(caseKey)) return current;
  return {
    version: DEAL_DETECTIVE_STREAK_VERSION,
    streak: won && current.lastResult === "win" ? current.streak + 1 : won ? 1 : 0,
    lastCaseKey: caseKey,
    lastResult: won ? "win" : "loss",
    completedCaseKeys: [...current.completedCaseKeys, caseKey],
  };
}

export function recordDealDetectiveStreak(
  scope: string,
  caseKey: string,
  won: boolean,
): DealDetectiveStreakState {
  const next = advanceDealDetectiveStreak(readDealDetectiveStreak(scope), caseKey, won);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(storageKey(scope), JSON.stringify(next));
    } catch {
      // The current game still reflects the result when local storage is unavailable.
    }
  }
  return next;
}
