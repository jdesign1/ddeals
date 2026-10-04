"use client";

import { useRouter } from "next/navigation";
import type { CurrentDeal, ProductCard as ProductCardData } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";

interface HistoryProductCardProps {
  product: ProductCardData;
  deal: CurrentDeal;
}

/**
 * Dense history row for All Checks. It follows the Lists page's compact item
 * proportions while retaining the historical check's supermarket, price, save
 * action, and tap-through to the deal page. Assessment badges stay on the
 * assessment screen rather than competing with this scan-friendly history.
 */
export default function HistoryProductCard({ product, deal }: HistoryProductCardProps) {
  const router = useRouter();
  const goToDeal = () => {
    router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);
  };

  return (
    <div
      onClick={goToDeal}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goToDeal();
        }
      }}
      role="button"
      tabIndex={0}
      // A card tap remains available without claiming vertical swipes from
      // the page's scroll container.
      style={{ touchAction: "pan-y" }}
      className="dd-compact-product-card group relative flex min-h-20 cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border border-stone-200/80 bg-white p-2 transition-transform duration-150 active:scale-[0.985]"
    >
      <AddToListButton
        productId={product.id}
        productName={product.name}
        containerClassName="absolute right-0 top-0 z-10"
      />
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
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5 pr-2">
        <div className="mb-0.5 flex min-w-0 justify-start pr-12">
          <StoreLogoBadge store={deal.store} variant="compact" />
        </div>
        <h3 className="line-clamp-2 pr-12 text-[15px] leading-5 font-semibold text-stone-900">{product.name}</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="font-display text-base font-extrabold text-stone-900">${deal.price.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
