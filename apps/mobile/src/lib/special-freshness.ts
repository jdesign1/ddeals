import type { CurrentDeal } from "@dodgey-deals/shared";

/**
 * A special is "new" for three days after its current price-history run
 * starts. The specials-only scrape runs daily, so this gives a new deal
 * several chances to be seen without labelling a weekly promotion as new
 * for most of its life.
 *
 * `scrapedAt` is intentionally not used here: it is the shared cache refresh
 * timestamp, so every current deal would look new after a cache refresh.
 */
export const NEW_SPECIAL_WINDOW_DAYS = 3;
/** Keep the NEW cue useful when a retailer launches many specials together. */
export const MAX_NEW_SPECIAL_BADGES_PER_VIEW = 6;
const NEW_SPECIAL_WINDOW_MS = NEW_SPECIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type SpecialFreshnessDeal = Pick<CurrentDeal, "isOnSpecial" | "saleStartedAt">;

export function getSpecialStartTime(deal: Pick<CurrentDeal, "saleStartedAt">): number {
  if (!deal.saleStartedAt) return -Infinity;
  const timestamp = Date.parse(deal.saleStartedAt);
  return Number.isFinite(timestamp) ? timestamp : -Infinity;
}

export function isNewSpecial(deal: SpecialFreshnessDeal, now = Date.now()): boolean {
  if (!deal.isOnSpecial) return false;
  const startedAt = getSpecialStartTime(deal);
  return startedAt <= now && now - startedAt < NEW_SPECIAL_WINDOW_MS;
}

/** Sort newest specials first, with currently-new specials explicitly ahead. */
export function compareLatestSpecials(
  a: SpecialFreshnessDeal,
  b: SpecialFreshnessDeal,
  now = Date.now()
): number {
  const newFirst = Number(isNewSpecial(b, now)) - Number(isNewSpecial(a, now));
  if (newFirst !== 0) return newFirst;
  return getSpecialStartTime(b) - getSpecialStartTime(a);
}

/**
 * Select a small, deterministic set of marked entries for a rendered view.
 * The caller's existing sort order is preserved, so Latest still gets the
 * newest entries while other sorts remain useful to the user.
 */
export function getNewSpecialKeys<T>(
  items: readonly T[],
  getDeal: (item: T) => SpecialFreshnessDeal,
  getKey: (item: T) => string,
  now = Date.now()
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (isNewSpecial(getDeal(item), now)) keys.add(getKey(item));
    if (keys.size >= MAX_NEW_SPECIAL_BADGES_PER_VIEW) break;
  }
  return keys;
}
