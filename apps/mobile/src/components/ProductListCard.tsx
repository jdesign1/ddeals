"use client";

import { useRouter } from "next/navigation";
import { useRef, type PointerEvent } from "react";
import type {
  DealSnapshotKind,
  ProductCard as ProductCardData,
  CurrentDeal,
} from "@dodgey-deals/shared";
import { STORE_DISPLAY_FALLBACK, formatUnitPrice, getSpecialPriceRange, normalizeStoreKey } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import ProductImage from "@/components/ProductImage";
import PriceChangeBadge from "@/components/PriceChangeBadge";
import ResponsivePriceRange from "@/components/ResponsivePriceRange";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { useCardLayout } from "@/lib/card-layout-context";
import { hasMixedStoreVerdicts } from "@/lib/product-card-badges";

/**
 * Product card — ported from Prototype/index.html's shared
 * `ProductCard` (see project.md, "Restyled the prototype to the new 'Dodgy
 * Deal · Mobile UI Kit' design system", 2026-08-04: "five rows: ... image +
 * brand/name/size; price; a factual one-line callout about the store ...;
 * and a badges row"). Used by Home's search results, Trending, and My List
 * sections (page.tsx), with a stacked grid variant — kept separate from DealCard.tsx, which is the
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
 *  - `onNavigate` (added 2026-08-09, fixing a real bug: cards were
 *    unselectable from inside FullScreenSearch) fires right before the
 *    `router.push` above -- see its own doc comment on the prop.
 */

export interface ProductListCardProps {
  product: ProductCardData;
  deal: CurrentDeal;
  /** The first visible card in a route/list can opt into eager loading. */
  imageLoading?: "eager" | "lazy";
  /** Text before the store name, e.g. "Lowest at" / "Special at". Pass
   * `null` when the store name should stand alone. */
  storeLinePrefix?: string | null;
  /** Other stores (raw store names) also running a special on this product right now. */
  alsoSpecialStores?: string[];
  /** Called right before navigating to the deal page -- lets a caller that
   * renders this card inside its own always-mounted fixed overlay (e.g.
   * FullScreenSearch, 2026-08-09) close itself first. Without this, tapping
   * a card while the overlay is open still navigates underneath it, but the
   * overlay (z-50, `fixed inset-0`) keeps covering the whole viewport, so
   * the screen never visibly changes -- looks exactly like the tap did
   * nothing. Optional and a no-op for callers with nothing covering the
   * page (Home's own Trending/My List sections, /specials). */
  onNavigate?: () => void;
  /** Snapshot rails use a ranked, fixed-width card and dollar-first callout. */
  snapshot?: {
    rank: number;
    kind: DealSnapshotKind;
    amount: number;
  };
  /** Optional onboarding anchor for the first useful card/action in a view. */
  dataOnboarding?: string;
}

export default function ProductListCard({
  product,
  deal,
  imageLoading = "lazy",
  storeLinePrefix = "Lowest at",
  alsoSpecialStores = [],
  onNavigate,
  snapshot,
  dataOnboarding,
}: ProductListCardProps) {
  const router = useRouter();
  const isDodgy = deal.dealType === "Dodgy Deal";
  const isRealSaver = deal.dealType === "Real Deal";
  const isFairDeal = deal.dealType === "Fair Price";
  const hideCardBadges = hasMixedStoreVerdicts(product);
  const isSnapshotLayout = snapshot != null;
  const isTourDealCard =
    dataOnboarding === "deal-card" ||
    dataOnboarding === "top-savings-deal-card" ||
    dataOnboarding === "dodgy-deal-card";
  const showPriceChangeBadge = !isSnapshotLayout && !hideCardBadges && (isDodgy || isRealSaver || isFairDeal);
  const storeLabel = STORE_DISPLAY_FALLBACK[normalizeStoreKey(deal.store)] || deal.store;
  const unitPriceLabel = formatUnitPrice(deal.saleUnitPrice, deal.saleUnitLabel);
  const specialPriceRange = isSnapshotLayout ? null : getSpecialPriceRange(product);
  const { isGridLayout, isCompactLayout } = useCardLayout();
  const pinStoreLogosToFooter = !isSnapshotLayout && !isCompactLayout && !hideCardBadges;
  const useGridCard = isSnapshotLayout || isGridLayout;
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  // `product.brand` already arrives Title Cased from `packages/shared/src/
  // data.ts` (`titleCase(meta.brand)`) -- this card used to re-render it in
  // ALL CAPS on top of that via the `uppercase` CSS class below. Per Jay's
  // "sentence case" ask (2026-08-12), converted to true sentence case here
  // (first letter capital, rest lowercase) rather than just dropping
  // `uppercase` and showing the Title Case string as-is, since Title Case
  // ("Coca Cola") isn't the same thing as sentence case ("Coca cola") --
  // there's no CSS `text-transform` that produces genuine sentence case
  // (only `capitalize`, which re-title-cases every word), so this is a
  // real JS transform, not a class swap.
  const brandSentenceCase = product.brand
    ? product.brand.charAt(0).toUpperCase() + product.brand.slice(1).toLowerCase()
    : product.brand;

  const goToDeal = () => {
    onNavigate?.();
    router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
      suppressClickRef.current = true;
    }
  };

  const handlePointerUp = () => {
    pointerStartRef.current = null;
  };

  const handleCardClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    goToDeal();
  };

  return (
    <div
      onClick={handleCardClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      draggable={false}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDeal();
        }
      }}
      role="button"
      tabIndex={0}
      data-onboarding={dataOnboarding}
      data-onboarding-deal-href={
        isTourDealCard ? `/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}` : undefined
      }
      // Product item cards use a subtle outline rather than elevation. The
      // verdict badge below still carries the deal status explicitly.
      // Product cards remain tappable, but vertical swipes must stay with the
      // page's scroll container even when the gesture starts on this card.
      style={{
        // The tour aligns its "Check a deal" target to this bottom margin so
        // the highlighted tile stays clear of the bottom safe area.
        ...(isTourDealCard ? { scrollMarginBottom: 112 } : {}),
        touchAction: isSnapshotLayout ? "pan-x pan-y" : "pan-y",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      className={`dd-product-card group relative cursor-pointer overflow-hidden rounded-2xl border border-stone-200/80 bg-white ${
        isCompactLayout
          ? "dd-compact-product-card flex min-h-28 items-stretch gap-3 p-2"
          : isSnapshotLayout
            ? "dd-snapshot-card w-[40%] min-w-[136px] max-w-[180px] shrink-0 snap-start flex flex-col rounded-[1.5rem]"
            : isGridLayout
            ? "flex flex-col"
            : "flex"
      }`}
    >
      <AddToListButton
        productId={product.id}
        productName={product.name}
        dataOnboarding={isTourDealCard ? "save-product" : undefined}
        containerClassName={isCompactLayout || isSnapshotLayout ? "absolute right-0 top-0 z-10" : undefined}
      />

      {/* Single layout keeps the horizontal image-and-text card currently
          used by the app. Grid layout switches this same card to a stacked,
          image-first card: the grey image panel fills the card width and all
          text sits underneath it. */}
      <div
        className={`product-image-frame relative flex flex-shrink-0 select-none items-center justify-center overflow-hidden ${
          isCompactLayout
            ? "-my-2 -ml-2 w-20 self-stretch rounded-l-xl bg-paper p-1.5"
          : useGridCard
              ? isSnapshotLayout
                ? "aspect-[4/3] w-full bg-stone-50 p-3"
                : "aspect-[5/2.75] w-full bg-stone-50 p-3"
              : "min-h-[112px] w-36 self-stretch bg-stone-50 p-2.5"
        }`}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
          <ProductImage
            src={product.image}
            alt={product.name}
            width={112}
            height={112}
            sizes={useGridCard ? "(max-width: 480px) 40vw, 180px" : "144px"}
            loading={imageLoading}
            fetchPriority={imageLoading === "eager" ? "high" : "auto"}
            className={`product-image-content h-full w-full object-contain mix-blend-multiply ${useGridCard ? "scale-[0.95]" : ""}`}
          />
        </div>
        {snapshot && (
          <span
            className="absolute left-0 top-0 h-14 w-14 bg-ink-600 font-display text-base font-black text-white [clip-path:polygon(0_0,100%_0,0_100%)]"
            aria-label={`Rank ${snapshot.rank}`}
          >
            <span className="absolute left-1/3 top-1/3 -translate-x-1/2 -translate-y-1/2">{snapshot.rank}</span>
          </span>
        )}
      </div>
      <div
        className={`flex min-w-0 flex-1 flex-col justify-start bg-white ${
          isCompactLayout
            ? "px-2 py-2"
            : isSnapshotLayout
              ? "px-3 pb-7 pt-2"
              : useGridCard
              ? "px-3 pb-9 pt-3"
              : "pb-9 pl-4 pr-9 pt-4"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        {/* `tracking-widest` -> `tracking-normal` + a second +1px bump
            (2026-08-17, Jay: "the top brand text, reduce the letter
            spacing to normal, and increase the font size by 1px") -- same
            move already applied to the full-screen search "N dodgy
            specials found" label earlier today, see `FullScreenSearch.tsx`'s
            own doc comment on that one (wide tracking left over from this
            label's older all-caps-micro-label styling, read as too loose).
            This span already got ONE +1px bump earlier today from the
            app-wide small-font sweep (`text-[10px]` -> `text-[11px]`, one
            pass = one bump, not cumulative) -- this is a second, separate
            +1px on top of that, specifically for this label, per this new
            ask, landing at `text-[12px]`, not evidence the earlier sweep
            missed it. */}
        {!isCompactLayout && (
          <span className={`dd-type-meta text-stone-600 ${isSnapshotLayout ? "block min-h-[1.125rem] truncate" : ""}`}>
            {brandSentenceCase}
          </span>
        )}
        <h3 className={`line-clamp-2 font-display text-base font-bold ${isSnapshotLayout ? "leading-[1.125rem] min-h-[2.25rem]" : "leading-snug"} text-stone-900 ${isCompactLayout ? "pr-12" : ""}`}>
          {product.name}
        </h3>
        {!isSnapshotLayout && product.unit ? (
          <span className="dd-type-meta text-stone-500">{product.unit}</span>
        ) : null}
        <div className={`${isSnapshotLayout ? "mt-0" : "mt-1"} flex min-w-0 ${
          isSnapshotLayout ? "w-full flex-col gap-0" : "flex-col gap-0"
        }`}>
          {specialPriceRange ? (
            <ResponsivePriceRange
              text={`$${specialPriceRange.lowestPrice.toFixed(2)}–$${specialPriceRange.highestPrice.toFixed(2)}`}
              compact={isCompactLayout}
            />
          ) : (
            <span className={`font-display font-extrabold text-stone-900 ${isCompactLayout ? "text-base" : "text-2xl"}`}>${deal.price.toFixed(2)}</span>
          )}
          {unitPriceLabel && (
            <span className="dd-type-meta text-stone-500" aria-label={`Unit price ${unitPriceLabel}`}>
              {unitPriceLabel}
            </span>
          )}
          {isSnapshotLayout && (
            <span className="truncate dd-type-meta dd-type-meta-strong text-stone-600">{storeLabel}</span>
          )}
        </div>
        {/* The retailer is visually tied to its price, not to the product
            title. This leaves the bottom row free for the saving and verdict
            pair used by the Top 20 cards. */}
        {!isSnapshotLayout && (
          <div className={`${pinStoreLogosToFooter ? "mt-auto pt-2" : "mt-1.5"} flex min-w-0 flex-wrap items-center gap-1.5 ${isCompactLayout ? "pr-12" : ""}`}>
            <StoreLogoBadge store={deal.store} variant={isCompactLayout ? "compact" : "card"} />
            {alsoSpecialStores.map((store) => (
              <StoreLogoBadge key={store} store={store} variant={isCompactLayout ? "compact" : "card"} />
            ))}
          </div>
        )}
        {!isCompactLayout && (
          <span className="sr-only">
              {specialPriceRange
                ? "Various"
                : storeLinePrefix == null
                ? storeLabel
                : storeLinePrefix === "Lowest at"
                  ? storeLabel
                  : `${storeLinePrefix} ${storeLabel}.`}
          </span>
        )}
        </div>
        {!isSnapshotLayout && !hideCardBadges && isCompactLayout && (
          <div className="mt-auto flex min-w-0 items-center gap-1 pt-1.5">
            {showPriceChangeBadge && <PriceChangeBadge currentPrice={deal.price} comparisonPrice={deal.originalPrice} format="amount" compact />}
            {isDodgy && <span aria-label="Dodgy Deal" className="shrink-0 select-none rounded-md bg-alert-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Dodgy</span>}
            {isRealSaver && <span aria-label="Real Saver" className="shrink-0 select-none rounded-md bg-fair-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Real</span>}
            {isFairDeal && <span aria-label="Fair Price" className="shrink-0 select-none rounded-md bg-dodgy-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">Fair</span>}
          </div>
        )}
      </div>

      {snapshot ? (
        <div className="absolute bottom-2 left-3 right-3 z-10 flex min-w-0 items-center justify-start gap-1">
          <span className={`shrink-0 select-none whitespace-nowrap rounded-md px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs ${snapshot.kind === "savings" ? "bg-fair-600" : "bg-alert-600"}`}>
            {snapshot.kind === "savings" ? "Save" : "Up"} ${snapshot.amount.toFixed(2)}
          </span>
          <span className={`shrink-0 select-none rounded-md px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs ${snapshot.kind === "savings" ? "bg-fair-600" : "bg-alert-600"}`}>
            {snapshot.kind === "savings" ? "Real" : "Dodgy"}
          </span>
        </div>
      ) : !hideCardBadges && !isCompactLayout && (
        <div className={`absolute bottom-2 z-10 flex min-w-0 items-center justify-start gap-1 ${useGridCard ? "left-3 right-3" : "left-40 right-3"}`}>
          {showPriceChangeBadge && <PriceChangeBadge currentPrice={deal.price} comparisonPrice={deal.originalPrice} format="amount" compact />}
          {isDodgy && (
            <span aria-label="Dodgy Deal" className="shrink-0 select-none rounded-md bg-alert-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">
              Dodgy
            </span>
          )}
          {isRealSaver && (
            <span aria-label="Real Saver" className="shrink-0 select-none rounded-md bg-fair-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">
              Real
            </span>
          )}
          {isFairDeal && (
            <span aria-label="Fair Price" className="shrink-0 select-none rounded-md bg-dodgy-600 px-1 py-0.5 text-xs leading-4 font-bold text-white shadow-xs">
              Fair
            </span>
          )}
        </div>
      )}

    </div>
  );
}
