"use client";

import { memo } from "react";
import Image from "next/image";
import { getCategoryImageSrc } from "@/lib/category-images";

export type RealSaverCategoryCount = {
  category: string;
  count: number;
};

function RealSaverCategoryRail({
  categories,
  title,
  description,
  onOpenCategory,
}: {
  categories: readonly RealSaverCategoryCount[];
  title: string;
  description: string;
  onOpenCategory: (category: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-4" aria-labelledby="real-savers-by-category-title">
      <div>
        <h2 id="real-savers-by-category-title" className="dd-type-section text-stone-900">{title}</h2>
        <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">{description}</p>
      </div>

      <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1" aria-label="Real Saver deals by category">
        {categories.map(({ category, count }) => (
          <button
            key={category}
            type="button"
            onClick={() => onOpenCategory(category)}
            aria-label={`See ${count} Real Saver${count === 1 ? "" : "s"} in ${category}`}
            className="flex min-h-[188px] w-[142px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl border border-fair-100 bg-white px-3 py-2.5 text-center transition-colors hover:bg-fair-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700"
          >
            <span className="w-full text-center font-display text-2xl font-extrabold leading-7 tabular-nums text-fair-800">{count}</span>
            <span className="dd-type-meta leading-4 text-stone-500">Specials</span>
            <Image
              src={getCategoryImageSrc(category)}
              alt=""
              width={72}
              height={72}
              sizes="72px"
              className="h-[72px] w-[72px] shrink-0 object-contain"
              aria-hidden="true"
            />
            <span className="line-clamp-2 w-full dd-type-control dd-type-control-strong leading-5 text-stone-900">{category}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(RealSaverCategoryRail);
