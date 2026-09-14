import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { CheaperAlternative } from "@dodgey-deals/shared";
import { getStoreProductUrl, findDealForStore } from "@dodgey-deals/shared";
import { getStoreLogoMeta } from "@/lib/store-meta";
import AddToListButton from "@/components/AddToListButton";
import InsightCarousel from "@/components/InsightCarousel";
import ProductImage from "@/components/ProductImage";

interface CheaperAlternativesSectionProps {
  alternatives: CheaperAlternative[];
  isMultiStoreDeal: boolean;
  showCarousel: boolean;
  verdictButtonBorderClass: string;
  onToggle: () => void;
}

export default function CheaperAlternativesSection({
  alternatives,
  isMultiStoreDeal,
  showCarousel,
  verdictButtonBorderClass,
  onToggle,
}: CheaperAlternativesSectionProps) {
  if (alternatives.length === 0) return null;

  return (
    <div className={isMultiStoreDeal ? "dd-deal-assessment-card space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 text-left shadow-xs" : "space-y-4"}>
      <h4 className="dd-type-section text-stone-900">Cheaper alternatives available</h4>
      <p className="mb-3 text-sm text-stone-600">
        {isMultiStoreDeal ? "See cheaper products on special" : "See other cheaper alternatives on special"}
      </p>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={showCarousel}
        className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 px-4 text-center dd-type-control transition-all hover:bg-stone-50 ${
          isMultiStoreDeal ? "border-stone-300 bg-white text-stone-700" : `${verdictButtonBorderClass} bg-white`
        }`}
      >
        <span>See cheaper options</span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fair-600 dd-type-badge text-white">
          {alternatives.length}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${showCarousel ? "rotate-180" : ""}`}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {showCarousel && (
          <motion.div
            key="cheaper-carousel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="-mx-5 overflow-hidden"
          >
            <div className="pt-3">
              <InsightCarousel slideWidthClassName="w-[92%]" trackPaddingClassName="px-5">
                {alternatives.map(({ product: alternativeProduct, store, price, saving }) => {
                  const meta = getStoreLogoMeta(store);
                  return (
                    <div key={`${alternativeProduct.id}-${store}`}>
                      <div className="dd-deal-assessment-card relative flex min-h-72 flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white px-5 pb-5 pt-7 shadow-xs">
                        <AddToListButton productId={alternativeProduct.id} productName={alternativeProduct.name} />
                        <div className="flex items-start gap-4">
                          <div className="product-image-frame deal-assessment-image flex h-24 w-24 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
                            <ProductImage
                              src={alternativeProduct.image}
                              alt={alternativeProduct.name}
                              width={96}
                              height={96}
                              className="product-image-content h-full w-full object-contain mix-blend-multiply"
                            />
                          </div>
                          <div className="min-w-0 flex-grow py-1">
                            <div className="space-y-1">
                              <p className="dd-type-secondary dd-type-secondary-strong text-ink-600">
                                {alternativeProduct.brand
                                  ? alternativeProduct.brand.charAt(0).toUpperCase() + alternativeProduct.brand.slice(1).toLowerCase()
                                  : alternativeProduct.brand}{" "}
                                {alternativeProduct.unit}
                              </p>
                              <h3 className="mt-1 line-clamp-2 font-display text-base font-bold leading-snug text-stone-900">{alternativeProduct.name}</h3>
                              <div className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
                                <span className="font-display text-base font-extrabold text-stone-900">${price.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <span className="dd-cheaper-saving-badge block w-full rounded-md border border-fair-800 bg-fair-800 px-2.5 py-2 dd-type-secondary dd-type-secondary-strong text-white">
                          Save <strong className="font-extrabold">${saving.toFixed(2)}</strong> compared to original item checked
                        </span>
                        <a
                          href={findDealForStore(alternativeProduct.currentDeals, store)?.productUrl || getStoreProductUrl(store, alternativeProduct.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-2.5 text-center text-sm font-semibold text-stone-700 transition-all hover:bg-stone-50"
                        >
                          <span className={`select-none rounded-md px-1.5 py-0.5 dd-type-badge ${meta.bg} ${meta.text}`}>{meta.short}</span>
                          Go to {store}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </InsightCarousel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
