import { createHash } from "node:crypto";
import { createCatalogueVersion, fetchCataloguePublicationTimestamp } from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUCCESS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Age, X-Vercel-Cache",
  "Vercel-Cache-Tag": "catalogue-version",
  "X-Content-Type-Options": "nosniff",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: SUCCESS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const sourceUpdatedAt = await fetchCataloguePublicationTimestamp(supabaseConfig);
    if (sourceUpdatedAt === null) {
      return Response.json(
        { error: "catalogue-version-unavailable" },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const body = JSON.stringify(createCatalogueVersion(sourceUpdatedAt));
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { ...SUCCESS_HEADERS, ETag: etag };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: 200, headers });
  } catch {
    return Response.json(
      { error: "catalogue-version-unavailable" },
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
