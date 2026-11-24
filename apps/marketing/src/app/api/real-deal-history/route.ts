import { createDdealsCatalogueConfig, fetchPriceHistory90d } from "@dodgey-deals/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseConfig = createDdealsCatalogueConfig({
  url: process.env.DDEALS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.DDEALS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId") || "";
  const storeId = searchParams.get("storeId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !/^[a-z0-9_-]{1,80}$/i.test(storeId)) {
    return Response.json({ error: "invalid-product" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const points = await fetchPriceHistory90d(supabaseConfig, productId, storeId, {
      signal: AbortSignal.timeout(8_000),
    });
    return Response.json(
      { points },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    console.error("Unable to load real deal demo price history:", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "price-history-unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
