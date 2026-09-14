import PageLoader from "@/components/PageLoader";

/**
 * Show the themed deal loader immediately during App Router navigation.
 * Without a route-level fallback, iOS WKWebView can paint a blank/light frame
 * before the client deal page mounts its own loader.
 */
export default function Loading() {
  return <PageLoader loading />;
}
