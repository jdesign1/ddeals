import { memo } from "react";
import { ArrowRight, Settings } from "lucide-react";
import Image from "next/image";
import { getCategoryImageSrc } from "@/lib/category-images";

function ForYouCategoryRail({
  categories,
  counts,
  unreadCategories,
  onOpenCategory,
  onEditCategories,
}: {
  categories: readonly string[];
  counts: ReadonlyMap<string, number>;
  unreadCategories: ReadonlySet<string>;
  onOpenCategory: (category: string) => void;
  onEditCategories: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 bg-fair-50 px-5 py-5" aria-labelledby="for-you-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="for-you-title" className="dd-type-section text-fair-800">Your saved categories</h2>
          <p className="dd-type-secondary mt-1 max-w-[19rem] text-stone-600">Real Saver deals in your favourite categories</p>
        </div>
        <button
          type="button"
          onClick={onEditCategories}
          aria-label="Edit deal categories"
          aria-haspopup="dialog"
          title="Edit deal categories"
          className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-start justify-center rounded-full pt-0.5 text-stone-900 transition-colors hover:bg-white/70 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
        >
          <Settings className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {categories.map((category) => {
          const count = counts.get(category) ?? 0;
          const hasUnreadItems = unreadCategories.has(category);
          const countLabel = `${count} ${count === 1 ? "Real Saver" : "Real Savers"}`;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onOpenCategory(category)}
              aria-label={`See ${countLabel} in ${category}${hasUnreadItems ? ", including new items" : ""}`}
              className="flex min-h-[4.25rem] w-full cursor-pointer items-center gap-3 rounded-2xl border border-fair-100 bg-white px-3 py-2.5 text-left shadow-xs transition-colors hover:bg-fair-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
            >
              <Image
                src={getCategoryImageSrc(category)}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 object-contain"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate dd-type-control dd-type-control-strong text-stone-900">{category}</span>
                  {hasUnreadItems && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-alert-600" aria-hidden="true" />
                  )}
                </span>
                <span className="mt-0.5 block dd-type-meta text-stone-600">Real Saver{count === 1 ? "" : "s"}</span>
              </span>
              <span className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-fair-600 px-2 dd-type-badge font-extrabold tabular-nums text-white">
                {count}
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-stone-600" strokeWidth={2.25} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(ForYouCategoryRail);
