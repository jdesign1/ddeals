"use client";

import { type CheaperAlternative, type CurrentDeal, type ProductCard as ProductCardData } from "@dodgey-deals/shared";
import ProductImage from "@/components/ProductImage";

const MAX_CHEAPER_OPTIONS = 5;

export default function CheaperOptionsCarousel({
  alternatives,
  originalProduct,
  originalDeal,
  originalProductName,
  selectedAlternative,
  onSelectAlternative,
  loading = false,
  error,
}: {
  alternatives: CheaperAlternative[];
  originalProduct: ProductCardData;
  originalDeal: CurrentDeal;
  originalProductName: string;
  selectedAlternative: CheaperAlternative | null;
  onSelectAlternative: (alternative: CheaperAlternative | null) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const visibleAlternatives = alternatives.slice(0, MAX_CHEAPER_OPTIONS);

  return (
    <div
      className="mt-2 bg-fair-50/60 pb-3 pt-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {loading ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-stone-500">
          Finding cheaper options…
        </p>
      ) : error ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-alert-700">
          We couldn&apos;t load cheaper options right now.
        </p>
      ) : visibleAlternatives.length === 0 ? (
        <p className="rounded-xl bg-white px-3 py-3 text-center text-xs font-semibold text-stone-500">
          No cheaper options found for {originalProductName} right now.
        </p>
      ) : (
        <CheaperOptionsThumbnailBelt
          key={`${originalProduct.id}-${originalDeal.store}-${visibleAlternatives.map(({ product, store }) => `${product.id}-${store}`).join("|")}`}
          alternatives={visibleAlternatives}
          selectedAlternative={selectedAlternative}
          onSelectAlternative={onSelectAlternative}
        />
      )}
    </div>
  );
}

function CheaperOptionsThumbnailBelt({
  alternatives,
  selectedAlternative,
  onSelectAlternative,
}: {
  alternatives: CheaperAlternative[];
  selectedAlternative: CheaperAlternative | null;
  onSelectAlternative: (alternative: CheaperAlternative | null) => void;
}) {
  return (
    <div className="px-3">
      <div className="mt-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-fair-700">Cheaper options</p>
          <span className="text-[11px] font-semibold text-stone-500">Tap to compare</span>
        </div>
        <div
          className="hide-scrollbar flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Cheaper options"
          onScroll={() => {
            if (selectedAlternative) onSelectAlternative(null);
          }}
        >
          {alternatives.map((alternative) => {
            const { product, store, price, saving, savingUnit } = alternative;
            const isSelected = selectedAlternative?.product.id === alternative.product.id && selectedAlternative.store === alternative.store;
            return (
              <button
                key={[product.id, store].join("-")}
                type="button"
                onClick={() => onSelectAlternative(alternative)}
                aria-label={`Comparable cheaper option: ${product.name} at ${store}, $${price.toFixed(2)}, lower unit price by $${saving.toFixed(2)} per ${savingUnit}`}
                aria-pressed={isSelected}
                className={`relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-white p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${isSelected ? "border-2 border-stone-900" : "border-stone-200"}`}
              >
                <ProductImage
                  src={product.image}
                  alt=""
                  width={56}
                  height={56}
                  className="product-image-content h-full w-full object-contain"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
