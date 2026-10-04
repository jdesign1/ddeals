/**
 * Keep the marketing domain from authorizing the native shell as a universal
 * link. The iOS app has no associated-domains entitlement for this domain.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { applinks: { details: [] } },
    {
      headers: {
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    },
  );
}
