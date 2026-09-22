"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { getSpecialPriceRange, type ProductCard, type CurrentDeal } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import ProductImage from "@/components/ProductImage";
import ResponsivePriceRange from "@/components/ResponsivePriceRange";
import { isNewSpecial } from "@/lib/special-freshness";

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
export default function DealCard({
  product,
  deal,
  showNewBadge = false,
  imageLoading = "lazy",
}: {
  product: ProductCard;
  deal: CurrentDeal;
  showNewBadge?: boolean;
  /** The first visible card in a route/list can opt into eager loading. */
  imageLoading?: "eager" | "lazy";
}) {
  const router = useRouter();
  const isTrueSpecial = deal.dealType === "Real Deal";
  const isDodgy = deal.dealType === "Dodgy Deal";
  const showWasPrice = deal.originalPrice > deal.price;
  const specialPriceRange = getSpecialPriceRange(product);

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
      // Keep vertical swipes scrolling the page when they start on a card;
      // tapping the card still navigates normally.
      style={{ touchAction: "pan-y" }}
      // Product item cards use a subtle outline rather than elevation.
      className="dd-product-card flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white transition-transform duration-150 ease-out active:scale-[0.985] active:opacity-95"
    >
      <div className="product-image-frame relative aspect-square w-full overflow-hidden bg-stone-100">
        <ProductImage
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 480px) 50vw, 256px"
          loading={imageLoading}
          fetchPriority={imageLoading === "eager" ? "high" : "auto"}
          className="product-image-content object-contain p-3"
        />
        {showNewBadge && isNewSpecial(deal) && (
          <span className="new-special-ribbon" aria-label="New special">
            <span aria-hidden="true">NEW</span>
          </span>
        )}
        {(isTrueSpecial || isDodgy) && (
          <span
            className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 dd-type-badge text-white"
            style={{
              backgroundColor: isTrueSpecial ? "var(--color-verdict-real-saver)" : "var(--color-verdict-dodgy)",
            }}
          >
            {isTrueSpecial ? (
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            )}
            {isTrueSpecial ? "True special" : "Dodgy Deal"}
          </span>
        )}
        <AddToListButton productId={product.id} productName={product.name} />
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="dd-type-meta text-stone-500">{deal.store}</span>
        <span className="line-clamp-2 text-[15px] leading-5 font-semibold text-stone-900">{product.name}</span>
        <div className="mt-1 flex items-baseline gap-2">
          {specialPriceRange ? (
            <ResponsivePriceRange
              text={`$${specialPriceRange.lowestPrice.toFixed(2)}–$${specialPriceRange.highestPrice.toFixed(2)}`}
            />
          ) : (
            <span className="text-lg leading-6 font-extrabold text-stone-900">${deal.price.toFixed(2)}</span>
          )}
          {showWasPrice && (
            <span className="text-[13px] leading-4 text-stone-500 line-through">${deal.originalPrice.toFixed(2)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
