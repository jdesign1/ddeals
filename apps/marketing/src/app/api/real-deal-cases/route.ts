import {
  createDdealsCatalogueConfig,
  canonicalStoreKey,
  productTitleCase,
  resolvePublishedDealAssessment,
  SPECIALS_VERIFICATION_TTL_MS,
  STORE_DISPLAY_FALLBACK,
  titleCase,
  type PublishedAssessmentRow,
} from "@dodgey-deals/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_HISTORY_DAYS = 14;
const MAX_CANDIDATES_PER_VERDICT = 120;
const MAX_CASES = 3;

interface PublishedGameRow extends PublishedAssessmentRow {
  product_id: string;
  store_id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  store_name: string | null;
  image_url: string | null;
  unit_size: string | null;
  sale_price: number;
  price_history_90d_avg: number | null;
  price_history_90d_low: number | null;
  price_history_90d_high: number | null;
  price_history_90d_days_tracked: number | null;
  price_history_90d_price_changes: number | null;
  price_history_90d_samples: number | null;
  price_history_90d_special_samples: number | null;
  price_history_90d_special_days: number | null;
  specials_verified_at: string | null;
}

interface GameItem {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  store: string;
  price: number;
  imageUrl: string;
  verdict: "real" | "dodgy";
  stats: {
    averagePrice: number | null;
    lowestPrice: number | null;
    daysTracked: number;
    priceChanges: number;
  };
}

interface GameCase {
  id: string;
  items: [GameItem, GameItem];
}

const catalogueConfig = createDdealsCatalogueConfig({
  url: process.env.DDEALS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.DDEALS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

const SELECT = [
  "product_id", "store_id", "product_name", "brand", "category", "store_name", "verdict",
  "sale_price", "normal_price", "saving_pct", "inflate_pct", "was_price", "reason", "sale_started_at",
  "unit_price_change_pct", "unit_price_samples", "regular_price_samples", "regular_history_days",
  "evidence_status", "evidence_strength", "store_history_ready", "classifier_version",
  "image_url", "unit_size", "price_history_90d_low", "price_history_90d_high", "price_history_90d_avg",
  "price_history_90d_days_tracked", "price_history_90d_price_changes", "price_history_90d_samples",
  "price_history_90d_special_samples", "price_history_90d_special_days", "specials_verified_at",
].join(",");

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

async function fetchCandidates(verdict: "GENUINE" | "DODGY"): Promise<PublishedGameRow[]> {
  const freshAfter = new Date(Date.now() - SPECIALS_VERIFICATION_TTL_MS).toISOString();
  const query = new URLSearchParams({
    select: SELECT,
    verdict: `eq.${verdict}`,
    evidence_status: "eq.SUFFICIENT",
    store_history_ready: "eq.true",
    image_url: "not.is.null",
    sale_price: "gt.0",
    price_history_90d_days_tracked: `gte.${MIN_HISTORY_DAYS}`,
    price_history_90d_samples: "gte.2",
    specials_verified_at: `gte.${freshAfter}`,
    order: "specials_verified_at.desc",
    limit: String(MAX_CANDIDATES_PER_VERDICT),
  });
  const response = await fetch(`${catalogueConfig.url}/rest/v1/published_dodgy_deals_cache?${query}`, {
    headers: {
      apikey: catalogueConfig.anonKey,
      Authorization: `Bearer ${catalogueConfig.anonKey}`,
    },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Published deal lookup returned ${response.status}`);

  const rows = await response.json() as PublishedGameRow[];
  const now = Date.now();
  return rows.filter((row) => {
    if (!row.product_id || !row.store_id || !row.product_name || !row.store_name || !row.image_url) return false;
    if (!Number.isFinite(Number(row.sale_price)) || Number(row.sale_price) <= 0) return false;
    if (!Number.isFinite(Number(row.price_history_90d_days_tracked)) || Number(row.price_history_90d_days_tracked) < MIN_HISTORY_DAYS) return false;
    if (!Number.isFinite(Number(row.price_history_90d_samples)) || Number(row.price_history_90d_samples) < 2) return false;
    if (!row.specials_verified_at) return false;
    const verifiedAt = Date.parse(row.specials_verified_at);
    if (!Number.isFinite(verifiedAt) || verifiedAt > now + 5 * 60_000 || now - verifiedAt >= SPECIALS_VERIFICATION_TTL_MS) return false;
    return resolvePublishedDealAssessment(row).verdict === verdict;
  });
}

function toGameItem(row: PublishedGameRow, verdict: "real" | "dodgy"): GameItem {
  const sourceStore = row.store_name || row.store_id;
  const storeKey = canonicalStoreKey(sourceStore);
  return {
    id: `${row.product_id}:${row.store_id}`,
    productId: row.product_id,
    storeId: row.store_id,
    name: productTitleCase(row.product_name),
    brand: productTitleCase(row.brand),
    category: titleCase(row.category) || "Grocery",
    unit: row.unit_size || "",
    store: STORE_DISPLAY_FALLBACK[storeKey] || titleCase(sourceStore),
    price: Number(row.sale_price),
    imageUrl: row.image_url!,
    verdict,
    stats: {
      averagePrice: row.price_history_90d_avg == null ? null : Number(row.price_history_90d_avg),
      lowestPrice: row.price_history_90d_low == null ? null : Number(row.price_history_90d_low),
      daysTracked: Number(row.price_history_90d_days_tracked),
      priceChanges: Number(row.price_history_90d_price_changes ?? 0),
    },
  };
}

function buildCases(realRows: PublishedGameRow[], dodgyRows: PublishedGameRow[]): GameCase[] {
  const real = shuffle(realRows);
  const dodgy = shuffle(dodgyRows);
  const usedIds = new Set<string>();
  const cases: GameCase[] = [];
  const pairCandidates: { real: PublishedGameRow; dodgy: PublishedGameRow; categoryScore: number }[] = [];

  for (const realRow of real) {
    const realCategory = (realRow.category || "").trim().toLowerCase();
    const realRootCategory = realCategory.split(/\s*>\s*/, 1)[0];
    for (const dodgyRow of dodgy) {
      if (realRow.product_id === dodgyRow.product_id) continue;
      const dodgyCategory = (dodgyRow.category || "").trim().toLowerCase();
      const dodgyRootCategory = dodgyCategory.split(/\s*>\s*/, 1)[0];
      const categoryScore = realCategory && realCategory === dodgyCategory
        ? 2
        : realRootCategory && realRootCategory === dodgyRootCategory ? 1 : 0;
      pairCandidates.push({ real: realRow, dodgy: dodgyRow, categoryScore });
    }
  }

  // Prioritize comparable products across the whole candidate pool before
  // filling any remaining cases with unrelated categories. The candidate
  // arrays are shuffled first, so ties still produce varied daily pairs.
  pairCandidates.sort((left, right) => right.categoryScore - left.categoryScore);
  for (const { real: realRow, dodgy: dodgyRow } of pairCandidates) {
    if (cases.length >= MAX_CASES) break;
    if (usedIds.has(realRow.product_id) || usedIds.has(dodgyRow.product_id)) continue;
    usedIds.add(realRow.product_id);
    usedIds.add(dodgyRow.product_id);
    cases.push({
      id: `${realRow.product_id}-${dodgyRow.product_id}`,
      items: [toGameItem(realRow, "real"), toGameItem(dodgyRow, "dodgy")],
    });
  }
  return shuffle(cases);
}

export async function GET(): Promise<Response> {
  try {
    const [realRows, dodgyRows] = await Promise.all([
      fetchCandidates("GENUINE"),
      fetchCandidates("DODGY"),
    ]);
    const cases = buildCases(realRows, dodgyRows);
    return Response.json(
      { cases, source: "published-specials" },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Unable to load real deal demo cases:", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "live-deals-unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
}
