/**
 * Product search for the mobile app and browser surfaces.
 *
 * Product metadata is stored in separate fields, so a query must be matched
 * token-by-token across the fields rather than as one substring inside each
 * field. That is what makes "Anchor Protein" find a product with brand
 * "Anchor" and name "Protein Milk".
 *
 * Matching deliberately gets more permissive in layers:
 *   1. exact whole-token matches
 *   2. prefix matches (important while typing on mobile)
 *   3. within-token substring matches
 *   4. bounded Levenshtein matches for likely typos
 *
 * Every meaningful query token must match somewhere. This preserves useful
 * precision for multi-word product searches while still allowing the words
 * to live in different metadata fields. Recognized natural-language terms
 * use the existing curated synonym rules as an additional token match.
 */

import { getSearchSynonymRule, productMatchesSynonymRule } from "./search-synonyms.ts";

export interface ProductSearchFields {
  name: string | null | undefined;
  brand: string | null | undefined;
  category: string | null | undefined;
}

export type ProductSearchMatchKind = "exact" | "prefix" | "substring" | "fuzzy" | "synonym";

export interface ProductSearchMatch {
  score: number;
  kind: ProductSearchMatchKind;
  matchedTokens: number;
  queryTokens: number;
}

/** Normalizes casing and accents while preserving word boundaries for tokens. */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Tokenizes normal product text. Punctuation is a word boundary. */
export function tokenizeSearchText(value: string | null | undefined): string[] {
  return normalizeSearchText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Tokenizes a field for typo matching as well as normal token matching.
 * A whitespace token keeps hyphenated names such as Weet-Bix together while
 * the regular tokenizer still lets "weet" and "bix" match independently.
 */
function tokenizeForFuzzy(value: string | null | undefined): string[] {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

const STOP_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);

function queryTokens(value: string): string[] {
  const tokens = tokenizeSearchText(value);
  const meaningful = tokens.filter((token) => !STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens;
}

function levenshteinDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMinimum = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

function typoBudgetForLength(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

function fuzzyMatch(queryToken: string, candidateToken: string): boolean {
  if (!queryToken || !candidateToken) return false;
  const budget = typoBudgetForLength(queryToken.length);
  return budget > 0 && levenshteinDistance(queryToken, candidateToken, budget) <= budget;
}

interface SearchField {
  value: string;
  tokens: string[];
  fuzzyTokens: string[];
  weight: number;
}

interface IndexedProduct {
  fields: SearchField[];
  combined: string;
}

const productSearchIndex = new WeakMap<object, IndexedProduct>();

function indexProduct(product: ProductSearchFields): IndexedProduct {
  const cached = productSearchIndex.get(product as object);
  if (cached) return cached;

  const fields: SearchField[] = [
    { value: normalizeSearchText(product.brand), tokens: tokenizeSearchText(product.brand), fuzzyTokens: tokenizeForFuzzy(product.brand), weight: 1.3 },
    { value: normalizeSearchText(product.name), tokens: tokenizeSearchText(product.name), fuzzyTokens: tokenizeForFuzzy(product.name), weight: 1.15 },
    { value: normalizeSearchText(product.category), tokens: tokenizeSearchText(product.category), fuzzyTokens: tokenizeForFuzzy(product.category), weight: 0.95 },
  ];
  const indexed = { fields, combined: fields.map((field) => field.value).filter(Boolean).join(" ") };
  productSearchIndex.set(product as object, indexed);
  return indexed;
}

function synonymMatch(queryToken: string, product: ProductSearchFields): boolean {
  const rule = getSearchSynonymRule(queryToken);
  return rule ? productMatchesSynonymRule(rule, product) : false;
}

function bestTokenMatch(queryToken: string, product: ProductSearchFields, indexed: IndexedProduct): { quality: number; kind: ProductSearchMatchKind; fieldWeight: number } | null {
  let best: { quality: number; kind: ProductSearchMatchKind; fieldWeight: number } | null = null;

  for (const field of indexed.fields) {
    for (const token of field.tokens) {
      let quality = 0;
      let kind: ProductSearchMatchKind = "exact";
      if (token === queryToken) quality = 1;
      else if (queryToken.length >= 3 && token.startsWith(queryToken)) {
        quality = 0.82;
        kind = "prefix";
      } else if (queryToken.length >= 3 && token.includes(queryToken)) {
        quality = 0.62;
        kind = "substring";
      } else if (fuzzyMatch(queryToken, token)) {
        quality = 0.36;
        kind = "fuzzy";
      }

      if (quality && (!best || quality * field.weight > best.quality * best.fieldWeight)) {
        best = { quality, kind, fieldWeight: field.weight };
      }
    }

    // This catches an unhyphenated query such as "weetbix" against the
    // stored form "Weet-Bix", without making punctuation a hard miss.
    for (const token of field.fuzzyTokens) {
      if (token.length > 0 && fuzzyMatch(queryToken, token)) {
        const candidate = { quality: 0.36, kind: "fuzzy" as const, fieldWeight: field.weight };
        if (!best || candidate.quality * candidate.fieldWeight > best.quality * best.fieldWeight) best = candidate;
      }
    }
  }

  if (synonymMatch(queryToken, product)) {
    const candidate = { quality: 0.58, kind: "synonym" as const, fieldWeight: 1 };
    if (!best || candidate.quality * candidate.fieldWeight > best.quality * best.fieldWeight) best = candidate;
  }

  return best;
}

/** Returns detailed relevance information, or null when the product misses a query token. */
export function getProductSearchMatch(product: ProductSearchFields, query: string): ProductSearchMatch | null {
  const tokens = queryTokens(query);
  if (!tokens.length) return null;

  const indexed = indexProduct(product);
  const matches = tokens.map((token) => bestTokenMatch(token, product, indexed));
  if (matches.some((match) => match === null)) return null;

  const resolvedMatches = matches as Array<NonNullable<(typeof matches)[number]>>;
  let score = resolvedMatches.reduce((total, match) => total + match.quality * match.fieldWeight, 0);
  const normalizedQuery = tokens.join(" ");

  // Phrase matches are especially useful for branded products and compensate
  // for metadata split across `brand` and `name`.
  if (indexed.combined.includes(normalizedQuery)) score += 1.5;

  const allExact = resolvedMatches.every((match) => match.kind === "exact");
  const hasBrandMatch = resolvedMatches.some((match) => match.fieldWeight === 1.3 && (match.kind === "exact" || match.kind === "prefix"));
  if (allExact) score += 1;
  if (hasBrandMatch) score += 1.25;

  return {
    score,
    kind: resolvedMatches.some((match) => match.kind === "fuzzy")
      ? "fuzzy"
      : resolvedMatches.some((match) => match.kind === "synonym")
        ? "synonym"
        : resolvedMatches.some((match) => match.kind === "prefix")
          ? "prefix"
          : resolvedMatches.some((match) => match.kind === "substring")
            ? "substring"
            : "exact",
    matchedTokens: resolvedMatches.length,
    queryTokens: tokens.length,
  };
}

/** True when every meaningful query token matches across the product fields. */
export function productMatchesSearch(product: ProductSearchFields, query: string): boolean {
  return getProductSearchMatch(product, query) !== null;
}

/** Convenience helper for callers that only need relevance ranking. */
export function getProductSearchRelevance(product: ProductSearchFields, query: string): number {
  return getProductSearchMatch(product, query)?.score ?? 0;
}
