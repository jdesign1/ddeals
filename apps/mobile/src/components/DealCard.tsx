"use client";

import { useRouter } from "next/navigation";
import { getSpecialPriceRange, type ProductCard, type CurrentDeal } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import ProductImage from "@/components/ProductImage";
import PriceChangeBadge from "@/components/PriceChangeBadge";
import ResponsivePriceRange from "@/components/ResponsivePriceRange";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { isNewSpecial } from "@/lib/special-freshness";
import { hasMixedStoreVerdicts } from "@/lib/product-card-badges";

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
  const isFairDeal = deal.dealType === "Fair Price";
  const hideCardBadges = hasMixedStoreVerdicts(product);
  const showPriceChangeBadge = !hideCardBadges && (isTrueSpecial || isDodgy || deal.dealType === "Fair Price");
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
        <AddToListButton productId={product.id} productName={product.name} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
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
        <div className="mt-1.5 flex items-center">
          <StoreLogoBadge store={deal.store} variant="card" />
        </div>
        {!hideCardBadges && (showPriceChangeBadge || isTrueSpecial || isDodgy || isFairDeal) && (
          <div className="mt-auto flex min-w-0 items-center gap-1 pt-3">
            {showPriceChangeBadge && <PriceChangeBadge currentPrice={deal.price} comparisonPrice={deal.originalPrice} format="amount" compact />}
            {isTrueSpecial && <span aria-label="Real Saver" className="shrink-0 select-none rounded-md bg-fair-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Real</span>}
            {isDodgy && <span aria-label="Dodgy Deal" className="shrink-0 select-none rounded-md bg-alert-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Dodgy</span>}
            {isFairDeal && <span aria-label="Fair Price" className="shrink-0 select-none rounded-md bg-dodgy-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Fair</span>}
          </div>
        )}
      </div>
    </article>
  );
}
