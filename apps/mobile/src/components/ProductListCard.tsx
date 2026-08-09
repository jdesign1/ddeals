"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ProductCard as ProductCardData, CurrentDeal } from "@dodgey-deals/shared";
import { STORE_DISPLAY_FALLBACK, normalizeStoreKey } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import { getStoreLogoMeta } from "@/lib/store-meta";

/**
 * Single-column product card — ported from Prototype/index.html's shared
 * `ProductCard` (see project.md, "Restyled the prototype to the new 'Dodgy
 * Deal · Mobile UI Kit' design system", 2026-08-04: "five rows: ... image +
 * brand/name/size; price; a factual one-line callout about the store ...;
 * and a badges row"). Used by Home's search results, Trending, and My List
 * sections (page.tsx) — kept separate from DealCard.tsx, which is the
 * 2-column grid card /specials still uses (a different, still-current
 * Stitch-designed screen this session wasn't asked to touch).
 *
 * Deliberate differences from the prototype's version, flagged rather than
 * silently dropped:
 *  - No "Deal ends {date}" row -- re-checked the prototype source itself:
 *    `dealEndsText` is accepted as a prop but never actually rendered
 *    anywhere in its current `ProductCard` body (dead prop, likely left
 *    over from before the 2026-08-04 restyle), so there's nothing to port.
 *  - Save/track action reuses this app's real `AddToListButton` (multi-list
 *    picker backed by real Supabase lists) in the prototype's top-right
 *    slot, instead of porting the prototype's own Plus/Check toggle, which
 *    is bound to a single implicit localStorage "tracked" set that has no
 *    real equivalent here -- /specials already established this as the
 *    app's one real "save" affordance, so this reuses it rather than
 *    inventing a second, different-looking save interaction on Home.
 *  - Tap-to-open *is* wired now (added 2026-08-09): the whole card
 *    navigates to `/deal/[id]/[store]`, the real-route port of the
 *    prototype's Check Deal / DealModal screen (see that route's own doc
 *    comment). Matches the prototype's "cards tappable as a whole" pattern
 *    (`handleCardKeyActivate` in index.html) -- `role="button"`/
 *    `tabIndex={0}`/Enter-or-Space activation, same as a real button gets
 *    for free. `AddToListButton`'s own trigger already calls
 *    `stopPropagation()`, so tapping it opens the list picker instead of
 *    also navigating.
 */

export interface ProductListCardProps {
  product: ProductCardData;
  deal: CurrentDeal;
  /** Text before the store name, e.g. "Lowest at" / "On special at". */
  storeLinePrefix?: string;
  /** Other stores (raw store names) also running a special on this product right now. */
  alsoSpecialStores?: string[];
}

export default function ProductListCard({
  product,
  deal,
  storeLinePrefix = "Lowest at",
  alsoSpecialStores = [],
}: ProductListCardProps) {
  const router = useRouter();
  const isDodgy = deal.dealType === "Dodgy Deal";
  const isRealSaver = deal.dealType === "Real Deal";
  const isFairDeal = deal.dealType === "Fair Price";
  const storeLabel = STORE_DISPLAY_FALLBACK[normalizeStoreKey(deal.store)] || deal.store;
  const storeMeta = getStoreLogoMeta(deal.store);

  const goToDeal = () => router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);

  return (
    <div
      onClick={goToDeal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDeal();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
        isDodgy ? "border-alert-300" : isRealSaver ? "border-fair-300" : isFairDeal ? "border-dodgy-300" : "border-stone-200"
      }`}
    >
      <AddToListButton productId={product.id} />

      {/* Row: product image + brand/name/size/price/store line. */}
      <div className="flex gap-4 px-5 pt-5">
        <div className="flex h-24 w-24 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
          <Image
            src={product.image}
            alt={product.name}
            width={96}
            height={96}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center pr-9">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{product.brand}</span>
          <h3 className="mt-0.5 line-clamp-2 font-display text-base font-bold leading-snug text-stone-900">
            {product.name}
          </h3>
          {product.unit && <span className="mt-0.5 text-xs font-medium text-stone-500">{product.unit}</span>}
          <span className="mt-1.5 font-display text-2xl font-black text-stone-900">${deal.price.toFixed(2)}</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-xs font-bold text-stone-600">
              {storeLinePrefix} {storeLabel}.
            </span>
          </div>
          {alsoSpecialStores.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider text-stone-600">Also on special at:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {alsoSpecialStores.map((store) => {
                  const meta = getStoreLogoMeta(store);
                  return (
                    <div
                      key={store}
                      title={STORE_DISPLAY_FALLBACK[normalizeStoreKey(store)] || store}
                      className={`select-none rounded-md px-2 py-1 text-[9px] font-black ${meta.bg} ${meta.text}`}
                    >
                      {meta.short}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pb-5" />

      {isDodgy && (
        <span className="absolute bottom-5 right-3 z-10 select-none rounded-md bg-alert-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          Dodgy
        </span>
      )}
      {isRealSaver && (
        <span className="absolute bottom-5 right-3 z-10 select-none rounded-md bg-fair-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          Real
        </span>
      )}
      {isFairDeal && (
        <span className="absolute bottom-5 right-3 z-10 select-none rounded-md bg-dodgy-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
          Fair
        </span>
      )}
      <span
        className={`absolute bottom-5 left-3 z-10 select-none rounded-md px-2 py-1 text-[9px] font-black shadow-xs ${storeMeta.bg} ${storeMeta.text}`}
      >
        {storeMeta.short}
      </span>
    </div>
  );
}
