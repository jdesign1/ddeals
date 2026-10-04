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
