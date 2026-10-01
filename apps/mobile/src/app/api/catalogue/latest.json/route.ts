import { createHash } from "node:crypto";
import { assertCatalogueArtifactHasProducts, buildCatalogueArtifact } from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHORT_LIVED_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Each publication has its own URL cache key. Once this short freshness
  // period expires, revalidate before serving so an old store mix can never
  // remain visible after a newer verified retailer snapshot is published.
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "public, s-maxage=60, must-revalidate",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, must-revalidate",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Age, X-Vercel-Cache",
  "X-Content-Type-Options": "nosniff",
  "Vercel-Cache-Tag": "catalogue",
};

function successHeaders(publication: string | null, sourceUpdatedAt: number | null) {
  const isExactPublication = sourceUpdatedAt !== null && publication === String(sourceUpdatedAt);
  if (!isExactPublication) return SHORT_LIVED_HEADERS;

  // The client requests a distinct URL for each verified publication. Unlike
  // the unversioned compatibility URL, that body cannot be replaced by a
  // later scrape, so the CDN can keep it warm for cold app launches.
  return {
    ...SHORT_LIVED_HEADERS,
    "Cache-Control": "public, max-age=300, immutable",
    "CDN-Cache-Control": "public, s-maxage=86400, immutable",
    "Vercel-CDN-Cache-Control": "public, s-maxage=86400, immutable",
  };
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: SHORT_LIVED_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const publication = new URL(request.url).searchParams.get("publication");
  try {
    // Keep the route's origin read explicit so this server-side publisher
    // cannot accidentally recurse through NEXT_PUBLIC_CATALOGUE_URL.
    const artifact = assertCatalogueArtifactHasProducts(await buildCatalogueArtifact({
      url: supabaseConfig.url,
      anonKey: supabaseConfig.anonKey,
    }));
    const body = JSON.stringify(artifact);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { ...successHeaders(publication, artifact.sourceUpdatedAt), ETag: etag };
    console.info(JSON.stringify({
      level: "info",
      message: "catalogue snapshot served",
      route: "/api/catalogue/latest.json",
      publication,
      sourceUpdatedAt: artifact.sourceUpdatedAt,
      productCount: artifact.products.length,
      durationMs: Date.now() - startedAt,
    }));

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: 200, headers });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "catalogue snapshot refused",
      route: "/api/catalogue/latest.json",
      publication,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }));
    return Response.json(
      { error: "catalogue-unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
