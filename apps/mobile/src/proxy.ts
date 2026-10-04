import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = "dodgydeal.co.nz";
const MARKETING_DOMAIN = "www.dodgydeal.co.nz";
const ASSOCIATION_PATHS = new Set([
  "/.well-known/apple-app-site-association",
  "/apple-app-site-association",
]);

/**
 * The root domain belongs to the marketing site. The app is served from its
 * separate app domain, so keep requests that arrive at the old/root mobile
 * deployment on the marketing surface instead of rendering the app there.
 */
export function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (hostname !== ROOT_DOMAIN || ASSOCIATION_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const marketingUrl = request.nextUrl.clone();
  marketingUrl.hostname = MARKETING_DOMAIN;
  marketingUrl.protocol = "https:";
  return NextResponse.redirect(marketingUrl, 308);
}

export const config = {
  matcher: ["/:path*"],
};
