"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, ListChecks, User } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Bottom nav: Home / Lists / All Checks / Me. Originally Home / Lists /
 * Specials / Me per the Stitch screen inventory (project.md, "Stitch UI
 * Design — Screen Inventory"), with Specials (S8) in the third slot.
 * Swapped 2026-08-11, per Jay's ask to match the prototype's own bottom
 * nav (Check deals / My List / All Checks / Deal stats) more closely, now
 * that "All Checks" (`/history`) is a real screen here too (2026-08-11
 * session above) rather than only reachable as a link from `/me`. Icon is
 * `History`, matching the prototype's own bottom-nav icon for this exact
 * tab (`Prototype/index.html` line ~7291).
 *
 * `/specials` (S8) still exists as a real route and still has a real
 * Stitch mockup behind it — it's just no longer linked from anywhere in
 * the app's own UI now that this slot points at `/history` instead (a
 * plain grep of `apps/mobile/src` confirms `BottomNav.tsx` was the only
 * in-app link to it). Flagged rather than silently orphaned: worth a
 * deliberate call on whether that's fine (its own functionality --
 * store-filterable specials grid -- overlaps a fair bit with the
 * full-screen search overlay's own "Popular specials"/"Dodgy" browse view)
 * or whether it needs linking back in from somewhere, e.g. Home.
 */
const TABS: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/lists", label: "Lists", icon: ListChecks },
  { href: "/history", label: "All Checks", icon: History },
  { href: "/me", label: "Me", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-40 flex items-stretch justify-around border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium"
            style={{ color: isActive ? "var(--color-brand-primary)" : "#6b6b6b" }}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
