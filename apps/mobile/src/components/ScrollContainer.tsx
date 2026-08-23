"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Extracted 2026-08-17 from `layout.tsx`'s own inline
 * `<div className="flex-1 overflow-y-auto pb-safe-nav">{children}</div>`,
 * per Jay's ask to remove `BottomNav` from the deal-assessment page
 * (`BottomNav.tsx`'s own doc comment has the full story on why the nav
 * itself hides per-route there instead of at its `layout.tsx` mount site).
 *
 * `layout.tsx` is a plain server component (it exports `metadata`, no
 * `"use client"`), so it can't call `usePathname()` itself to decide which
 * bottom padding this scroll container needs. This one-purpose wrapper is
 * the client boundary for that single route check, kept as small as
 * possible rather than converting the whole root layout to a client
 * component just for this.
 *
 * `pb-safe-nav` (globals.css, `calc(5.5rem + env(safe-area-inset-bottom))`)
 * reserves exactly enough space for `BottomNav`'s floating-pill footprint
 * so real content never sits underneath/obscured by it at rest -- see that
 * class's own comment. On the deal-assessment route, where `BottomNav` now
 * renders nothing, keeping that same 5.5rem reservation would leave a dead
 * empty gap at the bottom of the page instead of a floating nav. Swapped to
 * `pb-safe-sm` (globals.css, `calc(0.5rem + env(safe-area-inset-bottom))`)
 * on that route only -- an existing class, already in globals.css before
 * this session but unused anywhere in the app until now, sized for exactly
 * this "safe-area clearance only, no nav" case rather than a new one
 * invented here.
 */
export default function ScrollContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hasBottomNav = !pathname.startsWith("/deal/");

  return <div className={`flex-1 overflow-y-auto ${hasBottomNav ? "pb-safe-nav" : "pb-safe-sm"}`}>{children}</div>;
}
