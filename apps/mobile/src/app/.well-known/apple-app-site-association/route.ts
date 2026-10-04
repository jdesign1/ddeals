/**
 * Explicitly revoke any previously published universal-link association for
 * this deployment. The native shell intentionally has no associated-domains
 * entitlement, so the website should remain in Safari rather than opening
 * the iOS app.
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
