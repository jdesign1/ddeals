import { CATEGORY_SECTIONS } from "@dodgey-deals/shared";

export const MAX_CATEGORY_INTERESTS = 3;

export const CATEGORY_INTERESTS = CATEGORY_SECTIONS;

const allowedCategories = new Set(CATEGORY_SECTIONS.flatMap((section) => section.categories));

/**
 * Keep account-backed interests inside the curated shopper taxonomy. The
 * caller's order is preserved so the home belts reflect the order a shopper
 * chose, while duplicate, unknown, and over-limit values are discarded.
 */
export function normalizeCategoryInterests(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (!allowedCategories.has(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length === MAX_CATEGORY_INTERESTS) break;
  }
  return normalized;
}

export function hasSameCategoryInterests(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
