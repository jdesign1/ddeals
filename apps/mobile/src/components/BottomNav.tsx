"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, Tag, User } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Bottom nav per the Stitch screen inventory (project.md, "Stitch UI
 * Design — Screen Inventory"): Home / Lists / Specials / Me. Note: only
 * Lists (S1), Specials (S8), and Me (S9) have an actual Stitch mockup —
 * "Home" has no design spec, see the placeholder note on that route.
 */
const TABS: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/lists", label: "Lists", icon: ListChecks },
  { href: "/specials", label: "Specials", icon: Tag },
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
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
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
