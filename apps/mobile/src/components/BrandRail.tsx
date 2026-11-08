"use client";

import { memo } from "react";
import ProductImage from "@/components/ProductImage";
import type { BrandSummary } from "@/lib/brand-browse";

function BrandVisual({ brand }: { brand: BrandSummary }) {
  return (
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
        <span className="font-display text-lg font-black uppercase text-fair-800" aria-hidden="true">
          {brand.name.slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function BrandRail({
  brands,
  onSelectBrand,
}: {
  brands: readonly BrandSummary[];
  onSelectBrand: (brand: BrandSummary) => void;
}) {
  if (brands.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="top-brands-real-savings-title">
      <div>
        <h2 id="top-brands-real-savings-title" className="dd-type-section text-fair-800">Top brands with real savings</h2>
        <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Brands with the most current Real Savers</p>
      </div>

      <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1" aria-label="Top brands with real savings">
        {brands.map((brand) => (
          <button
            key={brand.key}
            type="button"
            onClick={() => onSelectBrand(brand)}
            className="flex min-h-[142px] w-[166px] shrink-0 cursor-pointer flex-col items-start justify-between rounded-3xl bg-white p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700"
            aria-label={`Browse ${brand.name}, ${brand.realSaverCount} Real Saver${brand.realSaverCount === 1 ? "" : "s"}`}
          >
            <BrandVisual brand={brand} />
            <span className="mt-3 line-clamp-1 w-full font-display text-base font-extrabold text-stone-900">{brand.name}</span>
            <span className="mt-1 flex items-baseline gap-1 text-fair-800">
              <span className="text-sm leading-5 font-extrabold">{brand.realSaverCount}</span>
              <span className="text-xs leading-4 font-semibold">Real Saver{brand.realSaverCount === 1 ? "" : "s"}</span>
            </span>
            <span className="flex items-baseline gap-1 text-stone-500">
              <span className="text-sm leading-5 font-bold">{brand.currentSpecialCount}</span>
              <span className="text-xs leading-4 font-semibold">current special{brand.currentSpecialCount === 1 ? "" : "s"}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(BrandRail);
