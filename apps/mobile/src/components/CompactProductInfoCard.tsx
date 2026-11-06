import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { memo } from "react";

interface CompactProductInfoCardProps {
  productName: string;
  productBrand?: string | null;
  productImage?: string | null;
  productUnit?: string | null;
  currentStore?: string | null;
  currentPrice?: number | null;
}

/** Compact product context shared by shopper-tip and evidence sheets. */
function CompactProductInfoCard({
  productName,
  productBrand,
  productImage,
  productUnit,
  currentStore,
  currentPrice,
}: CompactProductInfoCardProps) {
  const productMeta = [productBrand, productUnit].filter(Boolean).join(" · ");

  return (
    <div role="group" aria-label="Item details" className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-stone-100 bg-stone-50 px-5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
          <ProductImage src={productImage} alt="" width={48} height={48} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-extrabold leading-4 text-stone-900">{productName}</p>
          {productMeta && <p className="mt-1 truncate dd-type-meta text-stone-500">{productMeta}</p>}
          {((currentPrice !== null && currentPrice !== undefined) || currentStore) && (
            <div className="mt-1 flex min-w-0 items-center gap-2">
              {currentPrice !== null && currentPrice !== undefined && (
                <span className="font-display text-lg font-extrabold leading-5 text-stone-900">${currentPrice.toFixed(2)}</span>
              )}
              {currentStore && <StoreLogoBadge store={currentStore} variant="compact" className="shadow-none" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(CompactProductInfoCard);
