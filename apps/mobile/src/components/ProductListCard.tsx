"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, type PointerEvent } from "react";
import type { ProductCard as ProductCardData, CurrentDeal } from "@dodgey-deals/shared";
import { STORE_DISPLAY_FALLBACK, normalizeStoreKey } from "@dodgey-deals/shared";
import AddToListButton from "@/components/AddToListButton";
import { getStoreLogoMeta } from "@/lib/store-meta";
import { useCardLayout } from "@/lib/card-layout-context";

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
}

export default function ProductListCard({
  product,
  deal,
  storeLinePrefix = "Lowest at",
  alsoSpecialStores = [],
  onNavigate,
}: ProductListCardProps) {
  const router = useRouter();
  const isDodgy = deal.dealType === "Dodgy Deal";
  const isRealSaver = deal.dealType === "Real Deal";
  const isFairDeal = deal.dealType === "Fair Price";
  const storeLabel = STORE_DISPLAY_FALLBACK[normalizeStoreKey(deal.store)] || deal.store;
  const storeMeta = getStoreLogoMeta(deal.store);
  const { isGridLayout } = useCardLayout();
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
      // No border, `shadow-sm` instead (2026-08-15, Jay: "Make all product
      // item cards have no border, and the same tight drop shadow used on
      // the Lists page saved lists cards" -- same `shadow-sm` `ListCard`
      // itself switched to the same day, see lists/page.tsx's own doc
      // comment). This drops the per-verdict border color
      // (alert/fair/dodgy-300 depending on `isDodgy`/`isRealSaver`/
      // `isFairDeal`) that used to ring the whole card -- flagged as an
      // intentional loss, not an oversight: the bottom-right verdict badge
      // (Dodgy/Real/Fair, below) already carries the same information
      // explicitly in text, so the border was a redundant, secondary cue
      // rather than the only place a user could read the verdict from.
      // Product cards remain tappable, but vertical swipes must stay with the
      // page's scroll container even when the gesture starts on this card.
      style={{ touchAction: "pan-y", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl bg-white shadow-sm transition-transform duration-150 ease-out active:scale-[0.985] active:opacity-95 ${
        isGridLayout ? "flex flex-col" : "flex"
      }`}
    >
      <AddToListButton productId={product.id} />

      {/* Single layout keeps the horizontal image-and-text card currently
          used by the app. Grid layout switches this same card to a stacked,
          image-first card: the grey image panel fills the card width and all
          text sits underneath it. */}
      <div
        className={`flex flex-shrink-0 select-none items-center justify-center bg-stone-50 ${
          isGridLayout ? "aspect-[5/3] w-full p-3" : "h-[115px] w-36 p-3"
        }`}
      >
        <div className={`flex items-center justify-center overflow-hidden rounded-xl ${isGridLayout ? "h-full w-full" : "h-[90px] w-[90px]"}`}>
          <Image
            src={product.image}
            alt={product.name}
            width={112}
            height={112}
            sizes={isGridLayout ? "(max-width: 480px) 45vw, 256px" : "96px"}
            className="h-full w-full object-contain mix-blend-multiply"
          />
        </div>
      </div>
      <div
        className={`flex min-w-0 flex-1 flex-col justify-center bg-white ${
          isGridLayout
            ? `px-3 pb-9 ${alsoSpecialStores.length > 0 ? "pt-4" : "pt-3"}`
            : `pl-4 pr-9 ${alsoSpecialStores.length > 0 ? "py-8" : "py-5"}`
        }`}
      >
        <div className={`flex flex-col justify-center gap-0.5 ${alsoSpecialStores.length > 0 ? "flex-1" : ""}`}>
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
        <span className="dd-type-meta text-stone-600">{brandSentenceCase}</span>
        <h3 className="line-clamp-2 font-display text-base font-bold leading-snug text-stone-900">
          {product.name}
        </h3>
        {product.unit && <span className="dd-type-meta text-stone-500">{product.unit}</span>}
        <span className="mt-1 font-display text-2xl font-extrabold text-stone-900">${deal.price.toFixed(2)}</span>
        <div className="flex items-center gap-1.5">
            <span className="dd-type-meta dd-type-meta-strong text-stone-600">
            {storeLinePrefix == null
              ? storeLabel
              : storeLinePrefix === "Lowest at"
                ? storeLabel
                : `${storeLinePrefix} ${storeLabel}.`}
          </span>
        </div>
        </div>
        {alsoSpecialStores.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-[10px]">
            <span className="shrink-0 dd-type-meta text-stone-600">Also at:</span>
            {alsoSpecialStores.map((store) => {
              const meta = getStoreLogoMeta(store);
              return (
                <div
                  key={store}
                  title={STORE_DISPLAY_FALLBACK[normalizeStoreKey(store)] || store}
                  className={`select-none rounded-md px-2 py-1 dd-type-badge ${meta.bg} ${meta.text}`}
                >
                  {meta.short}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`absolute bottom-2 z-10 flex min-w-0 items-center justify-end gap-2 ${isGridLayout ? "left-3 right-3" : "left-40 right-3"}`}>
        {isDodgy && (
          <span className="shrink-0 select-none rounded-md bg-alert-600 px-2 py-1 dd-type-badge text-white shadow-xs">
            Dodgy
          </span>
        )}
        {isRealSaver && (
          <span className="shrink-0 select-none rounded-md bg-fair-600 px-2 py-1 dd-type-badge text-white shadow-xs">
            Real
          </span>
        )}
        {isFairDeal && (
          <span className="shrink-0 select-none rounded-md bg-dodgy-600 px-2 py-1 dd-type-badge text-white shadow-xs">
            Fair
          </span>
        )}
      </div>
      {/* Supermarket badge -- moved top-left (2026-08-12, per Jay's ask; was
          bottom-left, alongside the dodgy/real/fair verdict badge which
          stays bottom-right, unchanged). Sits opposite `AddToListButton`
          (top-2 right-2), over the product image's top-left corner the
          same way DealCard.tsx's own verdict badge already sits over its
          image. */}
      <span
        className={`absolute left-3 top-2 z-10 select-none rounded-md px-2 py-1 dd-type-badge shadow-xs ${storeMeta.bg} ${storeMeta.text}`}
      >
        {storeMeta.short}
      </span>
    </div>
  );
}
