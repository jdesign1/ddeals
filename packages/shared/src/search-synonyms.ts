/**
 * Query-term synonym expansion for FullScreenSearch.tsx's text search
 * (2026-08-21, per Jay's ask: "search terms like milk, egg, eggs, dairy,
 * cheese etc actually find popular items of that kind, not just items with
 * the title words").
 *
 * Checked against live `dodgy_deals_cache` data before writing anything
 * here (not assumed): "milk", "egg"/"eggs", and "cheese" already work fine
 * under the EXISTING plain substring match (name/brand/category, see
 * FullScreenSearch.tsx's `textMatched`) -- this retailer taxonomy's real
 * category strings are hierarchical ("Fridge, Deli & Eggs > Milk > UHT Milk
 * & Milk Powder") and most product names literally contain their own type
 * word ("Meadow Fresh Milk Standard UHT"), so those terms are already
 * substrings of the text being searched, and the existing whole-word
 * category/name relevance tiering (`getSearchRelevance`) already ranks the
 * real category items above incidental mentions. No entry for them below
 * on purpose -- adding one would be a no-op, so leaving them out is a
 * deliberate "don't touch what already works" call, not an oversight.
 *
 * "dairy" is a genuinely different, confirmed bug, not a missing-word gap:
 * there is no "Dairy" category node anywhere in this taxonomy (the real
 * dairy-case categories are named "Milk"/"Cheese"/"Yoghurt"/"Butter &
 * Margarine", all under "Fridge, Deli & Eggs"), so the current plain
 * substring match on "dairy" returns almost entirely DAIRY-FREE and
 * plant-based products instead -- "dairy" is a substring of "Dairy Free"
 * (category: "...> Dairy Free Yoghurt", "...> Dairy Free Milk", "...>
 * Dairy Free Spreads", "...> Dairy Free & Meat Free > Tofu") and of "Dairy
 * Milk" chocolate branding ("Cadbury Dairy Milk..."). Confirmed live
 * (`dodgy_deals_cache`, 2026-08-21): querying "dairy" today returns 167
 * rows, and spot-checking the first 100 turned up tofu, coconut yoghurt,
 * plant-based ice cream, and Cadbury "Dairy Milk" chocolate bars/desserts
 * ahead of, or instead of, actual milk/cheese/yoghurt/butter -- the exact
 * opposite of what a shopper searching "dairy" wants.
 *
 * A first pass just expanding "dairy" to milk/cheese/yoghurt/butter as
 * plain substrings (checked against name+brand+category, same convention
 * as the existing matcher) fixed the dairy-free collision but traded it for
 * a WORSE one: "milk"/"cheese"/"butter" are common English words used all
 * over this catalogue's flavour descriptors and branding, completely
 * unrelated to the dairy aisle -- confirmed live, that version's "dairy"
 * match pulled in Peanut Butter, Butter Chicken sauce, "Dairy Milk"-branded
 * chocolate bars, cheese-flavoured chips, Milo, and shampoo/soap containing
 * "milk"/"shea butter" in their name (494 of 1132 matches, ~44%, were this
 * kind of noise). Two more real findings drove the final shape below:
 *  - The noise was near-universally OUTSIDE the "Fridge"-prefixed top-level
 *    categories (Pantry/Health & Body/Frozen/Snacks/Drinks own all of it) --
 *    gating the free-text NAME match to `category` starting with "Fridge"
 *    (this taxonomy's own dairy-case top-level bucket, covering both
 *    "Fridge, Deli & Eggs" and the same catalogue's bare "Fridge & Deli"
 *    fallback rows that never got a deeper subcategory) removes it
 *    entirely without hand-listing every noise word -- the CATEGORY match
 *    itself needs no such gate, since a category segment literally named
 *    "Milk"/"Cheese"/"Yoghurt"/"Butter" is trustworthy whichever top-level
 *    bucket it sits under (e.g. "Hot & Cold Drinks > ... > Flavoured Milk"
 *    is genuinely dairy).
 *  - A second, separate false positive slipped through even inside the
 *    Fridge gate: "Coconut Cream & Milk"/"Coconut Milk"/"Coconut Cream" are
 *    plant-based, not dairy, but "milk" is a real substring of their own
 *    category/name text. Fixed with two explicit exclude phrases below
 *    ("coconutmilk"/"coconutcream") rather than excluding "coconut"
 *    outright, since a genuine dairy product exists that merely mentions
 *    coconut as a flavour ("Mango & Coconut Authentic Greek Yoghurt",
 *    category "...> Yoghurt > Large Yoghurt Tubs") -- a blanket "coconut"
 *    exclude was tried and confirmed (live data) to wrongly drop it.
 *  - Matching is done per-WORD-TOKEN (splitting on whitespace/punctuation
 *    first, then substring-matching each whole token), not against the
 *    whole name/category squished into one string the way this file's
 *    existing plain-substring convention does -- squishing spaces out
 *    entirely can accidentally stitch two unrelated words into a false
 *    substring across the join (confirmed live: "veg" as a synonym term
 *    against a fully-squished string wrongly matched "schick hydro Shave
 *    Gel" -- "...shave" + "gel..." squish into "...shavegel...", which
 *    contains "vege"). Token-substring matching still lets a short term
 *    like "veg" match a real single word like "Vegetables"/"Vege" (it's
 *    still a substring WITHIN that one token), it just can't span a word
 *    boundary that was never there.
 *
 * Same live-data-first check found two more real recall gaps worth fixing
 * alongside "dairy" (not requested by name, but the same class of bug: a
 * shopper's own natural word for a real, well-stocked category returning
 * near-zero results because it isn't literally present anywhere in this
 * particular retailer's taxonomy text). Both are distinctive enough words
 * that they don't need "dairy"'s category-gating -- checked directly
 * against name AND category, same as this file's simplest form:
 *  - "yogurt"/"yogurts" (American spelling) -- 8 matches live vs. 328 for
 *    "yoghurt" (the NZ spelling every category/product here actually
 *    uses). Same shape of bug this app already fixed once for "Weetbix"/
 *    "weet-bix" (project.md's 2026-07-10 entry) -- there it was
 *    punctuation, already handled by `normalizeSearchText`; this one is a
 *    genuine spelling variant, which normalizing punctuation can't fix.
 *  - "diaper"/"diapers" (American term) -- 0 matches live vs. 79 for
 *    "nappy"/"nappies" (the only word this taxonomy/these product names
 *    ever use).
 *
 * "veggie"/"veggies" (colloquial short form) is the third gap found --
 * 5 matches live (coincidental hits, not the real aisle) vs. 138 once
 * expanded to "vegetable"/"veg", gated the same way "dairy" is (checked
 * live: outside a `category` starting with "Fruit" or "Frozen > Frozen
 * Vegetables", "veg" picks up unrelated noise the same way "milk"/"butter"
 * did for "dairy").
 *
 * `getSearchSynonymRule(normalizedQuery)` returns `null` for every OTHER
 * query, so the caller's existing plain-substring behavior is completely
 * unchanged for anything not listed here -- this is additive, not a
 * replacement for the general matcher.
 */

export interface SearchSynonymRule {
  /** Matches if the product's raw CATEGORY text contains any of these as a
   * whole word-TOKEN substring (see this file's own doc comment on why
   * token-substring, not squished-string substring) -- checked regardless
   * of which top-level category bucket the product sits under, since a
   * category segment literally named e.g. "Milk"/"Cheese" is trustworthy
   * wherever it appears. */
  categoryTerms?: string[];
  /** Matches if the product's raw NAME contains any of these as a whole
   * word-TOKEN substring. If `nameTermCategoryPrefixes` is set, only
   * applied to products whose raw `category` starts with one of those
   * prefixes -- required for generic/short terms ("milk", "butter", "veg")
   * that are common English words unrelated to groceries outside the right
   * aisle; not needed for distinctive single-purpose words ("yoghurt",
   * "nappy") that don't collide with anything else in this catalogue. */
  nameTerms?: string[];
  nameTermCategoryPrefixes?: string[];
  /** A product is excluded if its normalized (name + brand + category,
   * squished together, same convention as the rest of this file's search
   * matching) contains ANY of these plain substrings, even if it also
   * matched a term above. Deliberately plain substring, not token-based --
   * these are pre-curated multi-word phrases ("dairy free", "coconut
   * milk") meant to be checked as adjacent-word phrases, which token
   * matching can't express without matching adjacent-token pairs. */
  excludeTerms?: string[];
}

const SEARCH_SYNONYMS: Record<string, SearchSynonymRule> = {
  dairy: {
    categoryTerms: ["milk", "cheese", "yoghurt", "butter"],
    nameTerms: ["milk", "cheese", "yoghurt", "yogurt", "butter"],
    nameTermCategoryPrefixes: ["Fridge"],
    excludeTerms: [
      "dairyfree",
      "nondairy",
      "dairymilk",
      "plantbased",
      "peanutbutter",
      "nutbutter",
      "coconutmilk",
      "coconutcream",
    ],
  },
  yogurt: { categoryTerms: ["yoghurt"], nameTerms: ["yoghurt"] },
  yogurts: { categoryTerms: ["yoghurt"], nameTerms: ["yoghurt"] },
  diaper: { categoryTerms: ["nappy", "nappies"], nameTerms: ["nappy", "nappies"] },
  diapers: { categoryTerms: ["nappy", "nappies"], nameTerms: ["nappy", "nappies"] },
  veggie: {
    categoryTerms: ["veg"],
    nameTerms: ["vegetable", "veggie", "veg"],
    nameTermCategoryPrefixes: ["Fruit", "Frozen > Frozen Vegetables"],
  },
  veggies: {
    categoryTerms: ["veg"],
    nameTerms: ["vegetable", "veggie", "veg"],
    nameTermCategoryPrefixes: ["Fruit", "Frozen > Frozen Vegetables"],
  },
};

/** `normalizedQuery` must already be run through the caller's own
 * `normalizeSearchText` (lowercase, non-alphanumeric stripped) -- this
 * module doesn't normalize its input, it only does the dictionary lookup,
 * so a raw un-normalized query (e.g. with punctuation/casing) will simply
 * miss every entry here and fall through to `null`, same as any other
 * unrecognized query. */
export function getSearchSynonymRule(normalizedQuery: string): SearchSynonymRule | null {
  return SEARCH_SYNONYMS[normalizedQuery] ?? null;
}

const tokenize = (s: string | null | undefined): string[] =>
  (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Whole-word-TOKEN substring match -- true if ANY of `terms` is a
 * substring of ANY single token of `text` (tokens split on whitespace/
 * punctuation first). See this file's own doc comment for why this,
 * rather than matching against the whole string squished together. */
function tokenSubstringMatch(text: string | null | undefined, terms: string[]): boolean {
  const tokens = tokenize(text);
  return terms.some((term) => tokens.some((tok) => tok.includes(term)));
}

export interface SynonymMatchableProduct {
  name: string | null | undefined;
  brand: string | null | undefined;
  category: string | null | undefined;
}

/** Applies a synonym rule (from `getSearchSynonymRule`) against one
 * product's raw text fields. Pulled out as its own function, rather than
 * left for each caller to reimplement, so the actual matching semantics
 * (category-term / gated-name-term / exclude-phrase precedence) live and
 * are tested in exactly one place -- same "pure, hook-free, testable"
 * split this package already uses elsewhere (see e.g. `deal-detail.ts`'s
 * own doc comment on why its logic is split out of the component it's
 * used from). */
export function productMatchesSynonymRule(rule: SearchSynonymRule, product: SynonymMatchableProduct): boolean {
  const normalizeSquished = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const combined = [normalizeSquished(product.name), normalizeSquished(product.brand), normalizeSquished(product.category)].join("|");
  if (rule.excludeTerms?.some((t) => combined.includes(t))) return false;
  if (rule.categoryTerms && tokenSubstringMatch(product.category, rule.categoryTerms)) return true;
  if (rule.nameTerms) {
    const gateOk = !rule.nameTermCategoryPrefixes || rule.nameTermCategoryPrefixes.some((p) => (product.category || "").startsWith(p));
    if (gateOk && tokenSubstringMatch(product.name, rule.nameTerms)) return true;
  }
  return false;
}
