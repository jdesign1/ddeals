"use client";

import { memo } from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { getCategoryImageSrc } from "@/lib/category-images";

export type RealSaverCategoryCount = {
  category: string;
  count: number;
};

function RealSaverCategoryRail({
  categories,
  onOpenCategory,
}: {
  categories: readonly RealSaverCategoryCount[];
  onOpenCategory: (category: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="real-savers-by-category-title">
      <div>
        <h2 id="real-savers-by-category-title" className="dd-type-section text-fair-800">Real Savers by category</h2>
        <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Browse categories with the most genuine savings</p>
      </div>

      <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1" aria-label="Real Saver deals by category">
        {categories.map(({ category, count }) => (
          <button
            key={category}
            type="button"
            onClick={() => onOpenCategory(category)}
            aria-label={`See ${count} Real Saver${count === 1 ? "" : "s"} in ${category}`}
            className="relative flex min-h-[154px] w-[142px] shrink-0 cursor-pointer flex-col items-center rounded-3xl border border-fair-100 bg-white px-3 pb-3 pt-2 text-center shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fair-700"
          >
            <span className="flex w-full items-center justify-between text-fair-800">
              <span className="font-display text-xl font-extrabold leading-6 tabular-nums">{count}</span>
              <ArrowRight className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <Image
              src={getCategoryImageSrc(category)}
              alt=""
              width={64}
              height={64}
              sizes="64px"
              className="my-1 h-16 w-16 shrink-0 object-contain"
              aria-hidden="true"
            />
            <span className="mt-auto line-clamp-2 w-full dd-type-control dd-type-control-strong text-stone-900">{category}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(RealSaverCategoryRail);
