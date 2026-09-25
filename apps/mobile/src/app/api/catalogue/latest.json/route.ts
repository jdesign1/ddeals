import { createHash } from "node:crypto";
import { buildCatalogueArtifact } from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUCCESS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Keep browser freshness short while allowing Vercel to serve the cached
  // response during background revalidation. The app's IndexedDB fallback,
  // rather than stale-if-error, handles an origin outage.
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Age, X-Vercel-Cache",
  "X-Content-Type-Options": "nosniff",
  "Vercel-Cache-Tag": "catalogue",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: SUCCESS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Keep the route's origin read explicit so this server-side publisher
    // cannot accidentally recurse through NEXT_PUBLIC_CATALOGUE_URL.
    const artifact = await buildCatalogueArtifact({
      url: supabaseConfig.url,
      anonKey: supabaseConfig.anonKey,
    });
    const body = JSON.stringify(artifact);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { ...SUCCESS_HEADERS, ETag: etag };

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: 200, headers });
  } catch {
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
