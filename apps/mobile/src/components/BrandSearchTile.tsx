"use client";

import { memo } from "react";
import ProductImage from "@/components/ProductImage";
import type { BrandSummary } from "@/lib/brand-browse";

function BrandSearchTile({ brand, onSelect }: { brand: BrandSummary; onSelect: (brand: BrandSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(brand)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition-colors hover:bg-fair-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700"
      aria-label={`View all current ${brand.name} specials`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-fair-50 ring-1 ring-fair-100">
        {brand.representativeImage ? (
          <ProductImage
            src={brand.representativeImage}
            alt=""
            width={48}
            height={48}
            sizes="48px"
            className="h-full w-full object-contain mix-blend-multiply"
          />
        ) : (
          <span className="font-display text-lg font-black uppercase text-fair-800" aria-hidden="true">{brand.name.slice(0, 1)}</span>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block dd-type-control font-extrabold text-stone-900">Browse all {brand.name} specials</span>
        <span className="mt-0.5 block dd-type-meta text-stone-500">
          {brand.currentSpecialCount} current special{brand.currentSpecialCount === 1 ? "" : "s"} · {brand.realSaverCount} Real Saver{brand.realSaverCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="shrink-0 text-lg text-fair-800" aria-hidden="true">→</span>
    </button>
  );
}

export default memo(BrandSearchTile);
