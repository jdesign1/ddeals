import { groupCategory, normalizeStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";
import type { NewSpecialsSummary } from "@/lib/new-specials";

export const DEAL_DETECTIVE_QUIZ_VERSION = 1;
export const DEAL_DETECTIVE_CASE_STORAGE_VERSION = 1;

const DEAL_DETECTIVE_CASE_STORAGE_PREFIX = "dd-deal-detective-case-v1:";
const DEAL_DETECTIVE_PLAYED_STORAGE_PREFIX = "dd-deal-detective-played-v1:";
const DEAL_DETECTIVE_CASE_NUMBER_STORAGE_PREFIX = "dd-deal-detective-case-number-v1:";

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

function candidateForKey(
  products: readonly ProductCard[],
  dealKey: string,
  kind: DealDetectiveQuizKind,
): Omit<DealDetectiveQuizCandidate, "side"> | null {
  const separatorIndex = dealKey.lastIndexOf("::");
  if (separatorIndex <= 0) return null;
  const productId = dealKey.slice(0, separatorIndex);
  const storeKey = dealKey.slice(separatorIndex + 2);
  const product = products.find((item) => item.id === productId);
  if (!product) return null;
  const deal = product.currentDeals.find((item) => (
    item.isOnSpecial
    && normalizeStoreKey(item.store) === storeKey
    && (kind === "real" ? item.dealType === "Real Deal" : item.dealType === "Dodgy Deal")
  ));
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
  products: readonly ProductCard[],
  dealKeys: readonly string[],
  kind: DealDetectiveQuizKind,
): Array<Omit<DealDetectiveQuizCandidate, "side">> {
  return dealKeys
    .map((dealKey) => candidateForKey(products, dealKey, kind))
    .filter((candidate): candidate is Omit<DealDetectiveQuizCandidate, "side"> => candidate !== null)
    .sort((left, right) => left.dealKey.localeCompare(right.dealKey));
}

function findPairInCategory(
  realCandidates: readonly Omit<DealDetectiveQuizCandidate, "side">[],
  dodgyCandidates: readonly Omit<DealDetectiveQuizCandidate, "side">[],
  category: string,
): { real: Omit<DealDetectiveQuizCandidate, "side">; dodgy: Omit<DealDetectiveQuizCandidate, "side"> } | null {
  const realCandidatesInCategory = realCandidates.filter((candidate) => candidate.category === category);
  const dodgyCandidatesInCategory = dodgyCandidates.filter((candidate) => candidate.category === category);
  for (const real of realCandidatesInCategory) {
    const dodgy = dodgyCandidatesInCategory.find((candidate) => candidate.product.id !== real.product.id);
    if (dodgy) return { real, dodgy };
  }
  return null;
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
): DealDetectiveQuizCase | null {
  const realCandidates = sortedCandidates(products, summary.realDealKeys, "real");
  const dodgyCandidates = sortedCandidates(products, summary.dodgyDealKeys, "dodgy");
  if (realCandidates.length === 0 || dodgyCandidates.length === 0) return null;

  const preferredPair = preferredCategories
    .map((category) => findPairInCategory(realCandidates, dodgyCandidates, category))
    .find((pair): pair is { real: Omit<DealDetectiveQuizCandidate, "side">; dodgy: Omit<DealDetectiveQuizCandidate, "side"> } => pair !== null);
  const pair = preferredPair ?? realCandidates
    .map((real) => ({ real, dodgy: dodgyCandidates.find((candidate) => candidate.product.id !== real.product.id) ?? null }))
    .find((candidate): candidate is { real: Omit<DealDetectiveQuizCandidate, "side">; dodgy: Omit<DealDetectiveQuizCandidate, "side"> } => candidate.dodgy !== null);
  if (!pair || !pair.real || !pair.dodgy) return null;

  return {
    category: preferredPair ? pair.real.category : null,
    left: { ...pair.real, side: "left" },
    right: { ...pair.dodgy, side: "right" },
  };
}
