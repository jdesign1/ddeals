"use client";

import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import type { CurrentDeal, ProductCard as ProductCardData } from "@dodgey-deals/shared";
import { useWatchlist } from "@/lib/watchlist-context";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";

interface HistoryProductCardProps {
  product: ProductCardData;
  deal: CurrentDeal;
}

/**
 * Dense history row for All Checks. It follows the Lists page's compact item
 * proportions while retaining the historical check's supermarket, price, and
 * tap-through to the deal page. Assessment badges stay on the
 * assessment screen rather than competing with this scan-friendly history.
 */
export default function HistoryProductCard({ product, deal }: HistoryProductCardProps) {
  const router = useRouter();
  const { savedProductIds, selectedProductIds, toggleProduct } = useWatchlist();
  const isSaved = savedProductIds.has(product.id);
  const isSelected = selectedProductIds.has(product.id);
  const goToDeal = () => {
    router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);
  };

  return (
    <div className="dd-compact-product-card group relative flex min-h-20 items-stretch gap-2 overflow-hidden rounded-xl border border-stone-200/80 bg-white p-2 transition-transform duration-150">
      <button
        type="button"
        onClick={goToDeal}
        // A card tap remains available without claiming vertical swipes from
        // the page's scroll container.
        style={{ touchAction: "pan-y" }}
        className="flex min-w-0 flex-1 cursor-pointer items-stretch gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-inset active:scale-[0.985]"
      >
        <div className="product-image-frame -my-2 -ml-2 flex w-20 flex-shrink-0 self-stretch select-none items-center justify-center overflow-hidden rounded-l-xl bg-paper p-1.5">
          <ProductImage
            src={product.image}
            alt={product.name}
            width={64}
            height={64}
            sizes="64px"
            loading="lazy"
            className="product-image-content h-full w-full object-contain"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5 pr-1">
          <div className="mb-0.5 flex min-w-0 justify-start">
            <StoreLogoBadge store={deal.store} variant="compact" />
          </div>
          <h3 className="line-clamp-2 text-[15px] leading-5 font-semibold text-stone-900">{product.name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="font-display text-base font-extrabold text-stone-900">${deal.price.toFixed(2)}</span>
          </div>
        </div>
      </button>
      <div className="flex w-[6.5rem] shrink-0 flex-col items-stretch justify-center gap-1">
        {isSaved ? (
          <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-fair-50 px-2 text-[11px] font-extrabold text-fair-800">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        ) : (
          <button
            type="button"
            onClick={() => toggleProduct(product.id)}
            aria-pressed={isSelected}
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-ink-900 px-2 text-[11px] font-extrabold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            {isSelected ? "Selected" : "Add to Watchlist"}
          </button>
        )}
      </div>
    </div>
  );
}
