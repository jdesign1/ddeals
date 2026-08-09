"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { ProductCard, CurrentDeal } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";

/**
 * One (product, store) deal card. Extracted from specials/page.tsx
 * (2026-08-08) so Home's Trending/My List rails can reuse the exact same
 * card instead of a second hand-built copy drifting from it — this project
 * already has a documented history of card layouts drifting across screens
 * (see Prototype/index.html's own shared ProductCard component comment).
 *
 * Tappable as a whole (2026-08-09) -- navigates to `/deal/[id]/[store]`,
 * same as ProductListCard.tsx; see that component's doc comment.
 */
export default function DealCard({ product, deal }: { product: ProductCard; deal: CurrentDeal }) {
  const router = useRouter();
  const isTrueSpecial = deal.dealType === "Real Deal";
  const isDodgy = deal.dealType === "Dodgy Deal";
  const showWasPrice = deal.originalPrice > deal.price;

  const goToDeal = () => router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);

  return (
    <article
      onClick={goToDeal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDeal();
        }
      }}
      role="button"
      tabIndex={0}
      className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white"
    >
      <div className="relative aspect-square w-full bg-stone-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 480px) 50vw, 240px"
          className="object-contain p-3"
          unoptimized
        />
        {(isTrueSpecial || isDodgy) && (
          <span
            className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{
              backgroundColor: isTrueSpecial ? "var(--color-verdict-real-saver)" : "var(--color-verdict-dodgy)",
            }}
          >
            {isTrueSpecial ? (
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            )}
            {isTrueSpecial ? "True Special" : "Dodgy Deal"}
          </span>
        )}
        <AddToListButton productId={product.id} />
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-[11px] font-semibold text-stone-500">{deal.store}</span>
        <span className="line-clamp-2 text-sm font-semibold text-stone-900">{product.name}</span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-extrabold text-stone-900">${deal.price.toFixed(2)}</span>
          {showWasPrice && (
            <span className="text-xs text-stone-400 line-through">${deal.originalPrice.toFixed(2)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
