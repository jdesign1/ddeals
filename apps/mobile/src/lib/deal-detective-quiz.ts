import { groupCategory, normalizeStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";
import type { NewSpecialsSummary } from "@/lib/new-specials";

export const DEAL_DETECTIVE_QUIZ_VERSION = 1;
export const DEAL_DETECTIVE_CASE_STORAGE_VERSION = 1;

const DEAL_DETECTIVE_CASE_STORAGE_PREFIX = "dd-deal-detective-case-v1:";
const DEAL_DETECTIVE_PLAYED_STORAGE_PREFIX = "dd-deal-detective-played-v1:";
const DEAL_DETECTIVE_CASE_NUMBER_STORAGE_PREFIX = "dd-deal-detective-case-number-v1:";
const DEAL_DETECTIVE_PAIR_HISTORY_STORAGE_PREFIX = "dd-deal-detective-pairs-v1:";

export type DealDetectiveQuizSide = "left" | "right";
export type DealDetectiveQuizKind = "real" | "dodgy";
export type DealDetectiveQuestionKind = "real" | "dodgy";

export interface DealDetectiveQuizCandidate {
  side: DealDetectiveQuizSide;
  dealKey: string;
  kind: DealDetectiveQuizKind;
  category: string;
  product: ProductCard;
  deal: CurrentDeal;
}

export interface DealDetectiveQuizCase {
  category: string | null;
  /** A shopper-facing sequence number for the current detective case. */
  caseNumber?: number;
  /** Which verdict the current case asks the shopper to identify. */
  questionKind?: DealDetectiveQuestionKind;
  left: DealDetectiveQuizCandidate;
  right: DealDetectiveQuizCandidate;
}

export interface StoredDealDetectiveCase {
  version: number;
  /** The catalogue publication that produced this case. Newer publications replace it. */
  publicationKey: string;
  /** Keep abandoned cases from becoming a permanent profile-menu item. */
  expiresAt: number;
  quizCase: DealDetectiveQuizCase;
}

export interface StoredDealDetectivePlayedState {
  version: number;
  publicationKey: string;
  questionKind: DealDetectiveQuestionKind;
}

export interface DealDetectiveQuizResult {
  already_recorded: boolean;
  correct: boolean;
  points_awarded: number;
  quiz_correct: number;
  quiz_attempts: number;
  detective_rank: string;
}

export interface DealDetectiveQuizChallenge {
  challenge_token: string;
}

function scopedCaseStorageKey(scope: string): string {
  return `${DEAL_DETECTIVE_CASE_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function scopedPlayedStorageKey(scope: string): string {
  return `${DEAL_DETECTIVE_PLAYED_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function scopedCaseNumberStorageKey(scope: string): string {
  return `${DEAL_DETECTIVE_CASE_NUMBER_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function isQuizCandidate(value: unknown): value is DealDetectiveQuizCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DealDetectiveQuizCandidate>;
  return (
    (candidate.side === "left" || candidate.side === "right")
    && (candidate.kind === "real" || candidate.kind === "dodgy")
    && typeof candidate.dealKey === "string"
    && typeof candidate.category === "string"
    && Boolean(candidate.product && typeof candidate.product === "object")
    && Boolean(candidate.deal && typeof candidate.deal === "object")
  );
}

function isDealDetectiveQuizCase(value: unknown): value is DealDetectiveQuizCase {
  if (!value || typeof value !== "object") return false;
  const quizCase = value as Partial<DealDetectiveQuizCase>;
  return (
    (quizCase.category === null || typeof quizCase.category === "string")
    && (quizCase.caseNumber === undefined || (Number.isSafeInteger(quizCase.caseNumber) && quizCase.caseNumber > 0))
    && (quizCase.questionKind === undefined || quizCase.questionKind === "real" || quizCase.questionKind === "dodgy")
    && isQuizCandidate(quizCase.left)
    && isQuizCandidate(quizCase.right)
  );
}

export function createStoredDealDetectiveCase(
  publicationKey: string,
  quizCase: DealDetectiveQuizCase,
  expiresAt: number,
  questionKind: DealDetectiveQuestionKind = quizCase.questionKind ?? "real",
  caseNumber = quizCase.caseNumber ?? 1,
): StoredDealDetectiveCase {
  return {
    version: DEAL_DETECTIVE_CASE_STORAGE_VERSION,
    publicationKey,
    expiresAt,
    quizCase: { ...quizCase, caseNumber, questionKind },
  };
}

export function nextDealDetectiveCaseNumber(scope = "device"): number {
  if (typeof window === "undefined") return 1;
  try {
    const storedValue = Number(window.localStorage.getItem(scopedCaseNumberStorageKey(scope)));
    const nextValue = Number.isSafeInteger(storedValue) && storedValue > 0 ? storedValue + 1 : 1;
    window.localStorage.setItem(scopedCaseNumberStorageKey(scope), String(nextValue));
    return nextValue;
  } catch {
    return 1;
  }
}

export function readStoredDealDetectiveCase(scope = "device", now = Date.now()): StoredDealDetectiveCase | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedCaseStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDealDetectiveCase>;
    if (
      parsed.version !== DEAL_DETECTIVE_CASE_STORAGE_VERSION
      || typeof parsed.publicationKey !== "string"
      || typeof parsed.expiresAt !== "number"
      || parsed.expiresAt <= now
      || !isDealDetectiveQuizCase(parsed.quizCase)
    ) return null;
    return {
      version: DEAL_DETECTIVE_CASE_STORAGE_VERSION,
      publicationKey: parsed.publicationKey,
      expiresAt: parsed.expiresAt,
      quizCase: parsed.quizCase,
    };
  } catch {
    return null;
  }
}

export function writeStoredDealDetectiveCase(
  storedCase: StoredDealDetectiveCase,
  scope = "device",
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(scopedCaseStorageKey(scope), JSON.stringify(storedCase));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredDealDetectiveCase(scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(scopedCaseStorageKey(scope));
    return true;
  } catch {
    return false;
  }
}

export function readStoredDealDetectivePlayedState(scope = "device"): StoredDealDetectivePlayedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedPlayedStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDealDetectivePlayedState>;
    if (parsed.version !== DEAL_DETECTIVE_CASE_STORAGE_VERSION || typeof parsed.publicationKey !== "string") return null;
    return {
      version: DEAL_DETECTIVE_CASE_STORAGE_VERSION,
      publicationKey: parsed.publicationKey,
      questionKind: parsed.questionKind === "dodgy" ? "dodgy" : "real",
    };
  } catch {
    return null;
  }
}

export function writeStoredDealDetectivePlayedState(
  publicationKey: string,
  questionKind: DealDetectiveQuestionKind,
  scope = "device",
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      scopedPlayedStorageKey(scope),
      JSON.stringify({ version: DEAL_DETECTIVE_CASE_STORAGE_VERSION, publicationKey, questionKind }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearStoredDealDetectivePlayedState(scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(scopedPlayedStorageKey(scope));
    return true;
  } catch {
    return false;
  }
}

export function dealDetectivePairKey(leftDealKey: string, rightDealKey: string): string {
  return [leftDealKey, rightDealKey].sort((left, right) => left.localeCompare(right)).join("|");
}

export function dealDetectivePairKeyForCase(quizCase: DealDetectiveQuizCase): string {
  return dealDetectivePairKey(quizCase.left.dealKey, quizCase.right.dealKey);
}

function scopedPairHistoryStorageKey(scope: string): string {
  return `${DEAL_DETECTIVE_PAIR_HISTORY_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

export function readStoredDealDetectivePairKeys(scope = "device"): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedPairHistoryStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0))];
  } catch {
    return [];
  }
}

export function writeStoredDealDetectivePairKeys(pairKeys: readonly string[], scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(scopedPairHistoryStorageKey(scope), JSON.stringify([...new Set(pairKeys)]));
    return true;
  } catch {
    return false;
  }
}

export async function loadStoredDealDetectivePairKeys(
  accessToken: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch("/api/deal-detective/history", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null) as { pair_keys?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Deal Detective history is unavailable.");
  return Array.isArray(payload?.pair_keys)
    ? [...new Set(payload.pair_keys.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : [];
}

export async function issueDealDetectiveChallenge(
  quizCase: DealDetectiveQuizCase,
  signal?: AbortSignal,
): Promise<DealDetectiveQuizChallenge> {
  const params = new URLSearchParams({
    leftDealKey: quizCase.left.dealKey,
    rightDealKey: quizCase.right.dealKey,
    questionKind: quizCase.questionKind ?? "real",
  });
  const response = await fetch(`/api/deal-detective/quiz?${params.toString()}`, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as Partial<DealDetectiveQuizChallenge> & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "That case is no longer available.");
  if (typeof payload?.challenge_token !== "string" || payload.challenge_token.length < 20) {
    throw new Error("We couldn't confirm that case. Please try again.");
  }
  return { challenge_token: payload.challenge_token };
}

export async function submitDealDetectiveQuiz(
  quizCase: DealDetectiveQuizCase,
  selectedSide: DealDetectiveQuizSide,
  accessToken: string,
  challengeToken: string,
  signal?: AbortSignal,
): Promise<DealDetectiveQuizResult> {
  const response = await fetch("/api/deal-detective/quiz", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      leftDealKey: quizCase.left.dealKey,
      rightDealKey: quizCase.right.dealKey,
      selectedSide,
      challengeToken,
    }),
    signal,
  });
  const payload = await response.json().catch(() => null) as Partial<DealDetectiveQuizResult> & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "We couldn't save your Deal Detective score right now.");
  if (
    typeof payload?.correct !== "boolean"
    || typeof payload.points_awarded !== "number"
    || typeof payload.quiz_correct !== "number"
    || typeof payload.quiz_attempts !== "number"
    || typeof payload.detective_rank !== "string"
  ) throw new Error("We couldn't confirm your Deal Detective score.");
  return {
    already_recorded: payload.already_recorded === true,
    correct: payload.correct,
    points_awarded: payload.points_awarded,
    quiz_correct: payload.quiz_correct,
    quiz_attempts: payload.quiz_attempts,
    detective_rank: payload.detective_rank,
  };
}

function dealKeyFor(product: ProductCard, deal: CurrentDeal): string {
  return `${product.id}::${normalizeStoreKey(deal.store)}`;
}

type DealDetectiveDealMatches = Partial<Record<DealDetectiveQuizKind, CurrentDeal>>;
type DealDetectiveDealIndex = ReadonlyMap<string, ReadonlyMap<string, DealDetectiveDealMatches>>;

function indexProductDeals(
  product: ProductCard,
  realDealKeys?: string[],
  dodgyDealKeys?: string[],
): Map<string, DealDetectiveDealMatches> {
  const dealsByStore = new Map<string, DealDetectiveDealMatches>();
  for (const deal of product.currentDeals) {
    if (!deal.isOnSpecial) continue;

    if (realDealKeys && deal.dealType === "Real Deal") realDealKeys.push(dealKeyFor(product, deal));
    if (dodgyDealKeys && deal.dealType === "Dodgy Deal") dodgyDealKeys.push(dealKeyFor(product, deal));

    const storeKey = normalizeStoreKey(deal.store);
    const matches = dealsByStore.get(storeKey) ?? {};
    if (deal.dealType === "Real Deal") {
      if (!matches.real) matches.real = deal;
    } else if (deal.dealType === "Dodgy Deal" && !matches.dodgy) {
      matches.dodgy = deal;
    }
    dealsByStore.set(storeKey, matches);
  }
  return dealsByStore;
}

function candidateForKey(
  productsById: ReadonlyMap<string, ProductCard>,
  dealsByProductAndStore: DealDetectiveDealIndex,
  dealKey: string,
  kind: DealDetectiveQuizKind,
): Omit<DealDetectiveQuizCandidate, "side"> | null {
  const separatorIndex = dealKey.lastIndexOf("::");
  if (separatorIndex <= 0) return null;
  const productId = dealKey.slice(0, separatorIndex);
  const storeKey = dealKey.slice(separatorIndex + 2);
  const product = productsById.get(productId);
  if (!product) return null;
  const deal = dealsByProductAndStore.get(productId)?.get(storeKey)?.[kind];
  if (!deal) return null;
  return {
    dealKey: dealKeyFor(product, deal),
    kind,
    category: groupCategory(product.category, product.name),
    product,
    deal,
  };
}

function sortedCandidates(
  productsById: ReadonlyMap<string, ProductCard>,
  dealsByProductAndStore: DealDetectiveDealIndex,
  dealKeys: readonly string[],
  kind: DealDetectiveQuizKind,
): Array<Omit<DealDetectiveQuizCandidate, "side">> {
  return dealKeys
    .map((dealKey) => candidateForKey(productsById, dealsByProductAndStore, dealKey, kind))
    .filter((candidate): candidate is Omit<DealDetectiveQuizCandidate, "side"> => candidate !== null)
    .sort((left, right) => left.dealKey.localeCompare(right.dealKey));
}

type DealDetectivePair = {
  real: Omit<DealDetectiveQuizCandidate, "side">;
  dodgy: Omit<DealDetectiveQuizCandidate, "side">;
};

type DealDetectiveCandidate = Omit<DealDetectiveQuizCandidate, "side">;

function indexCandidatesByCategory(
  candidates: readonly DealDetectiveCandidate[],
): Map<string, DealDetectiveCandidate[]> {
  const indexed = new Map<string, DealDetectiveCandidate[]>();
  for (const candidate of candidates) {
    const categoryCandidates = indexed.get(candidate.category) ?? [];
    categoryCandidates.push(candidate);
    indexed.set(candidate.category, categoryCandidates);
  }
  return indexed;
}

function findPairsInCategory(
  realCandidatesByCategory: ReadonlyMap<string, readonly DealDetectiveCandidate[]>,
  dodgyCandidatesByCategory: ReadonlyMap<string, readonly DealDetectiveCandidate[]>,
  category: string,
): DealDetectivePair[] {
  const realCandidatesInCategory = realCandidatesByCategory.get(category) ?? [];
  const dodgyCandidatesInCategory = dodgyCandidatesByCategory.get(category) ?? [];
  const pairs: DealDetectivePair[] = [];
  for (const real of realCandidatesInCategory) {
    for (const dodgy of dodgyCandidatesInCategory) {
      if (dodgy.product.id !== real.product.id) pairs.push({ real, dodgy });
    }
  }
  return pairs;
}

function allDealDetectivePairs(
  realCandidates: readonly Omit<DealDetectiveQuizCandidate, "side">[],
  dodgyCandidates: readonly Omit<DealDetectiveQuizCandidate, "side">[],
  preferredCategories: readonly string[],
): DealDetectivePair[] {
  const categories = preferredCategories.filter((category, index, values) => values.indexOf(category) === index);
  const realCandidatesByCategory = indexCandidatesByCategory(realCandidates);
  const dodgyCandidatesByCategory = indexCandidatesByCategory(dodgyCandidates);
  const pairs: DealDetectivePair[] = [];
  const seen = new Set<string>();
  for (const category of categories) {
    for (const pair of findPairsInCategory(realCandidatesByCategory, dodgyCandidatesByCategory, category)) {
      const pairKey = `${pair.real.dealKey}|${pair.dodgy.dealKey}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      pairs.push(pair);
    }
  }
  if (pairs.length > 0) return pairs;

  // Preserve the original safety fallback: when no preferred category has a
  // same-category pair, any valid cross-category pair is still usable.
  for (const real of realCandidates) {
    for (const dodgy of dodgyCandidates) {
      if (dodgy.product.id !== real.product.id) pairs.push({ real, dodgy });
    }
  }
  return pairs;
}

function buildDealDetectiveQuizCaseFromIndexes(
  productsById: ReadonlyMap<string, ProductCard>,
  dealsByProductAndStore: DealDetectiveDealIndex,
  summary: Pick<NewSpecialsSummary, "realDealKeys" | "dodgyDealKeys">,
  preferredCategories: readonly string[],
  rotationIndex: number,
  excludedPairKeys: readonly string[],
): DealDetectiveQuizCase | null {
  const realCandidates = sortedCandidates(productsById, dealsByProductAndStore, summary.realDealKeys, "real");
  const dodgyCandidates = sortedCandidates(productsById, dealsByProductAndStore, summary.dodgyDealKeys, "dodgy");
  if (realCandidates.length === 0 || dodgyCandidates.length === 0) return null;

  const excludedPairs = new Set(excludedPairKeys);
  const pairs = allDealDetectivePairs(realCandidates, dodgyCandidates, preferredCategories)
    .filter((pair) => !excludedPairs.has(dealDetectivePairKey(pair.real.dealKey, pair.dodgy.dealKey)));
  if (pairs.length === 0) return null;
  const safeRotationIndex = Number.isSafeInteger(rotationIndex) && rotationIndex >= 0 ? rotationIndex : 0;
  const pair = pairs[safeRotationIndex % pairs.length];
  const realOnLeft = safeRotationIndex % 2 === 0;
  const preferredCategory = preferredCategories.includes(pair.real.category) ? pair.real.category : null;

  return {
    category: preferredCategory,
    left: { ...(realOnLeft ? pair.real : pair.dodgy), side: "left" },
    right: { ...(realOnLeft ? pair.dodgy : pair.real), side: "right" },
  };
}

/**
 * Selects a stable, verified Real Saver/Dodgy Deal pair from the unread batch.
 * Category preference is a preference order, not a promise: if no preferred
 * category has both verdicts, the first valid pair from the batch is used.
 */
export function buildDealDetectiveQuizCase(
  products: readonly ProductCard[],
  summary: Pick<NewSpecialsSummary, "realDealKeys" | "dodgyDealKeys">,
  preferredCategories: readonly string[] = [],
  rotationIndex = 0,
  excludedPairKeys: readonly string[] = [],
): DealDetectiveQuizCase | null {
  // Preserve products.find()'s first-match behavior for any duplicate IDs
  // while making each deal-key lookup constant-time.
  const productsById = new Map<string, ProductCard>();
  const dealsByProductAndStore = new Map<string, Map<string, DealDetectiveDealMatches>>();
  for (const product of products) {
    if (!productsById.has(product.id)) {
      productsById.set(product.id, product);
      dealsByProductAndStore.set(product.id, indexProductDeals(product));
    }
  }
  return buildDealDetectiveQuizCaseFromIndexes(
    productsById,
    dealsByProductAndStore,
    summary,
    preferredCategories,
    rotationIndex,
    excludedPairKeys,
  );
}

/**
 * Builds a current-catalogue fallback case while collecting its summary keys
 * during the same first-product/index pass. This avoids a second full-catalogue
 * traversal when no stored or unread case is available.
 */
export function buildCurrentDealDetectiveQuizCase(
  products: readonly ProductCard[],
  preferredCategories: readonly string[] = [],
  rotationIndex = 0,
  excludedPairKeys: readonly string[] = [],
): DealDetectiveQuizCase | null {
  const productsById = new Map<string, ProductCard>();
  const dealsByProductAndStore = new Map<string, Map<string, DealDetectiveDealMatches>>();
  const realDealKeys: string[] = [];
  const dodgyDealKeys: string[] = [];

  for (const product of products) {
    if (!productsById.has(product.id)) {
      productsById.set(product.id, product);
      dealsByProductAndStore.set(
        product.id,
        indexProductDeals(product, realDealKeys, dodgyDealKeys),
      );
      continue;
    }

    // Keep collecting duplicate-product keys exactly as the old catalogue
    // summary did, while retaining the first product for deal resolution.
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial) continue;
      if (deal.dealType === "Real Deal") realDealKeys.push(dealKeyFor(product, deal));
      if (deal.dealType === "Dodgy Deal") dodgyDealKeys.push(dealKeyFor(product, deal));
    }
  }

  return buildDealDetectiveQuizCaseFromIndexes(
    productsById,
    dealsByProductAndStore,
    { realDealKeys, dodgyDealKeys },
    preferredCategories,
    rotationIndex,
    excludedPairKeys,
  );
}
