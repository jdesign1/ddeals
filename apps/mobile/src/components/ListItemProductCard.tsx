"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import { getAssessmentVerdict, type CheaperAlternative, type ProductCard as ProductCardData, type CurrentDeal } from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CheaperOptionsCarousel from "@/components/CheaperOptionsCarousel";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import PriceChangeBadge from "@/components/PriceChangeBadge";
import StoreLogoBadge from "@/components/StoreLogoBadge";

/**
 * Compact product row for a list's own item list on `apps/mobile/src/app/
 * lists/page.tsx` -- added 2026-08-20, Lists-page UX audit (Jay: "Ok
 * proceed with these" on the finding that item rows were bare
 * `<span>{name}</span>` text, no image/price/verdict, unlike every other
 * product surface in this app).
 *
 * Deliberately a SEPARATE component from `ProductListCard.tsx`, not that
 * component reused/extended with a bunch of new optional props -- 3 real
 * differences that don't retrofit cleanly onto a component already used in
 * 3 other contexts (Home, Specials, search results):
 *  - This card needs a REMOVE action (`onRemove`), not `ProductListCard`'s
 *    `AddToListButton` (add TO a list) -- the item is already in this list,
 *    removing it is the relevant action here, not re-adding it somewhere
 *    else. `ProductListCard`'s top-right corner is already spoken for by
 *    that button; bolting a second, different-purpose icon into the same
 *    corner on top of it would have been the actual retrofit risk.
 *  - This card needs a `quantity` chip (`list_items.quantity` -- Jay's
 *    "×N" convention the old plain-text row already showed) --
 *    `ProductListCard` has no concept of "how many of this you have," since
 *    every other context it's used in is browsing, not an owned list.
 *  - Sits nested one level deeper (inside a `ListCard`, itself inside the
 *    page's own list-of-lists column), so it uses smaller image/type scale
 *    than `ProductListCard`'s own full-size card -- not just a restyle,
 *    genuinely a different information density for a different slot in the
 *    page.
 * Verdict-badge color mapping (`.dd-badge-fair`/`-dodgy`/`-alert`) and the
 * store badge treatment (`StoreLogoBadge`) is shared with `ProductListCard`
 * verbatim, though, not reinvented -- same meaning, same colors, just a
 * compact inline pill row here instead of that card's floating corner
 * badges (there isn't room for 2 floating corner badges plus the remove
 * button on a card this small).
 *
 * Tap-to-navigate (whole row -> `/deal/[id]/[store]`) matches
 * `ProductListCard`'s own "cards tappable as a whole" pattern exactly, incl.
 * `role="button"`/`tabIndex={0}`/Enter-or-Space activation and the same
 * `onNavigate`-before-`router.push` shape (renamed `onBeforeNavigate` here
 * since this component has its own, differently-named `onRemove` callback
 * already and two `on*`-prefixed-but-different-meaning props felt worth
 * disambiguating) -- `ProductListCard`'s own doc comment has the full
 * "why" for that pattern (closing an always-mounted overlay before
 * navigating out from under it); `ListCard`/`lists/page.tsx` don't render
 * inside any such overlay today, so this component's own callers can leave
 * it unset, but the hook is here for the same reason it is on
 * `ProductListCard`.
 *
 * Remove confirmation added 2026-08-20 (per Jay: "When selecting an X on a
 * product on a list, there should be a remove confirmation") -- the X
 * button used to call `onRemove` directly, one tap, no way back. Flips
 * `confirmingRemove` on and swaps this card's content for a "Remove
 * {name}?" prompt + tick/cross pair, rather than a second, separate
 * confirm popover/dialog.
 *
 * Trigger switched from a tap on a top-right X icon to a swipe-left
 * gesture, same day (cont., per Jay: "to remove an item from a list, use
 * the swipe left gesture, then give the remove warning, keep the card the
 * same size in the warning"). The X icon is gone outright -- this is now
 * the ONLY entry point into `confirmingRemove` on this card. Implemented
 * with `motion.div`'s own `drag="x"` (this app already leans on `motion/
 * react` everywhere else for animation, not a new dependency): `drag`
 * constrained to a single point (`dragConstraints={{ left: 0, right: 0
 * }}`) with `dragElastic` gives the classic rubber-band "swipe, feel
 * resistance, let go" feel WITHOUT actually repositioning the card
 * permanently -- on release, motion springs it straight back to `x: 0`
 * itself (no manual reset code needed), and `onDragEnd` just reads
 * `info.offset.x` to decide whether the swipe went far enough
 * (`SWIPE_THRESHOLD`) to flip `confirmingRemove`. Drag is disabled outright
 * once `confirmingRemove` is true (`drag={confirmingRemove ? false : "x"}`)
 * so the tick/cross buttons aren't fighting a live drag gesture. Also
 * works with a mouse/trackpad drag, not touch-only -- framer-motion's drag
 * gesture isn't touch-gated -- but there is NO non-drag (keyboard/screen-
 * reader/switch-access) path left to trigger removal any more, the same
 * way there was one via the old focusable X button. Flagged here rather
 * than silently dropped: this is a direct, literal read of Jay's ask ("use
 * the swipe left gesture" to remove, not "add a swipe gesture alongside
 * the X"), but it's a real accessibility regression for anyone who can't
 * perform a drag gesture, worth a fast-follow if Jay wants a non-gesture
 * fallback restored.
 *
 * "keep the card the same size in the warning" -- the OLD confirm branch
 * was a separate `return` with its own smaller `p-2` box (no image, no
 * `pr-9`), which visibly shrank the row's height compared to its normal
 * state (losing the 56px image block). Fixed by no longer branching into a
 * second, differently-shaped `return` at all: there is now ONE outer box
 * (identical classes, identical `h-14 w-14` image, always rendered) and
 * only the right-hand content column's CHILDREN swap between the normal
 * brand/name/price/badges block and the "Remove {name}?" + tick/cross
 * block -- so the box's own footprint literally cannot differ between the
 * two states, by construction, not by keeping two class strings in sync
 * by hand.
 *
 * Not-on-special state added 2026-08-21, per Jay: "For items in lists, that
 * are not on special currently (grey them out) if the user selects this
 * item display a bottom sheet explaining that the item is not currently on
 * special and we will notify you when it is." `deal.isOnSpecial` (real
 * field, `!!cheapest.is_special` in `buildListItemProductCard`, lists.ts --
 * not derived here) drives both halves: the whole row gets `grayscale
 * opacity-60` instead of its normal full-color rendering, and a tap/Enter/
 * Space activation opens `NotOnSpecialSheet` (below) instead of navigating
 * to the deal page, via `handleActivate` replacing the old direct
 * `goToDeal` call on the row itself. Swipe-to-remove is untouched either
 * way -- removing a list item you own doesn't depend on whether it happens
 * to be on special right now, and the remove-confirm state already has its
 * own distinct (alert-colored) look, so it's explicitly excluded from the
 * grey treatment (`isNotOnSpecial && !confirmingRemove`) rather than
 * stacking a second dimmed look on top of it.
 *
 * The sheet's "we will notify you when it is" line is copy Jay asked for
 * verbatim, flagged rather than silently softened: this app has no real
 * notifications/price-alerts system yet (see `how-it-works/page.tsx`'s own
 * doc comment, which describes deliberately NOT porting the prototype's
 * "get deal warnings" copy for exactly that reason -- "rather than promise
 * a feature this app doesn't have"). This is a direct, explicit ask from
 * Jay this time rather than stray ported copy, so it's implemented as
 * asked -- but there's no real subscribe/alert action behind the sheet's
 * text, only a "Got it" dismiss. Worth flagging back to Jay before this
 * ships broadly: either build a real per-item notify flag, or soften the
 * copy to match what the app can actually do today.
 */
export interface ListItemProductCardProps {
  product: ProductCardData;
  deal: CurrentDeal;
  /** Other supermarkets with a verified active special for this product. */
  otherSpecialCount?: number;
  /** `list_items.quantity` -- only rendered as a "×N" chip when > 1, same
   * threshold the plain-text row this replaces already used. */
  quantity: number;
  onRemove: () => void;
  /** Full accessible label for the remove button, e.g. `Remove ${name} from
   * ${listName}` -- same string the old plain-text row's own X button
   * already built, passed through rather than reconstructed here since
   * this component doesn't know the list's own name. */
  removeLabel: string;
  onBeforeNavigate?: () => void;
  /** Refresh the list data after the not-on-special sheet is dismissed. */
  onAfterNotOnSpecial?: () => void;
  /** The Cheaper Options tab supplies ranked alternatives for this saved item. */
  cheaperAlternatives?: CheaperAlternative[];
  /** Shows the expand affordance only on the Watchlist page's Cheaper Options tab. */
  showCheaperOptions?: boolean;
  cheaperOptionsExpanded?: boolean;
  onToggleCheaperOptions?: () => void;
  cheaperOptionsLoading?: boolean;
  cheaperOptionsError?: string | null;
}

// How far left (px) a swipe must travel before it counts as "remove this"
// rather than an accidental/small drag -- see this file's own top-of-file
// doc comment for the full swipe-gesture design.
const SWIPE_THRESHOLD = 70;

function freshnessLabel(verifiedAt: string | null | undefined): string | null {
  if (!verifiedAt) return null;
  const ageHours = Math.max(0, (Date.now() - new Date(verifiedAt).getTime()) / 3_600_000);
  if (!Number.isFinite(ageHours)) return null;
  if (ageHours < 1) return "just now";
  if (ageHours < 24) return `${Math.floor(ageHours)}h ago`;
  if (ageHours < 48) return "yesterday";
  return null;
}

export default function ListItemProductCard({
  product,
  deal,
  otherSpecialCount = 0,
  quantity,
  onRemove,
  removeLabel,
  onBeforeNavigate,
  onAfterNotOnSpecial,
  cheaperAlternatives = [],
  showCheaperOptions = false,
  cheaperOptionsExpanded = false,
  onToggleCheaperOptions,
  cheaperOptionsLoading = false,
  cheaperOptionsError = null,
}: ListItemProductCardProps) {
  const router = useRouter();
  // Same sentence-case transform ProductListCard.tsx applies to `brand`
  // (that file's own doc comment has the full "why": Title Case from
  // data.ts isn't the same thing as real sentence case, and there's no CSS
  // text-transform that produces it).
  const brandSentenceCase = product.brand
    ? product.brand.charAt(0).toUpperCase() + product.brand.slice(1).toLowerCase()
    : product.brand;

  // Inline "are you sure?" state (2026-08-20, see this file's own doc
  // comment above) -- local to this one card, not lifted, same as
  // `ListCard`'s own `confirmingDelete` (only one row at a time needs it,
  // nothing outside this card cares whether it's showing).
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [removeCardHeight, setRemoveCardHeight] = useState<number | null>(null);

  // 2026-08-21, see this file's own top-of-file doc comment for the full
  // "why" -- local to this one card, same reasoning as `confirmingRemove`
  // just above (only one row's sheet is ever open at a time, nothing
  // outside this card needs to know).
  const isNotOnSpecial = deal.isOnSpecial === false;
  // Use the same public assessment resolver as the deal page. Watchlist copy
  // stays compact, but its state must not diverge (especially for near-low
  // historical reads and unconfirmed Dodgy review candidates).
  const assessmentVerdict = isNotOnSpecial ? "Fair Price" : getAssessmentVerdict(deal);
  const isRealSaver = assessmentVerdict === "Real Saver";
  const isDodgyDeal = assessmentVerdict === "Dodgy Deal";
  const isFairPrice = assessmentVerdict === "Fair Price";
  const isAssessmentPending = assessmentVerdict === "Early read" || assessmentVerdict === "Limited history";
  const dealFreshnessLabel = deal.isOnSpecial ? freshnessLabel(deal.specialsVerifiedAt) : null;
  const [showNotOnSpecialSheet, setShowNotOnSpecialSheet] = useState(false);
  const isCheaperOptionsExpanded = showCheaperOptions && cheaperOptionsExpanded;

  const goToDeal = () => {
    onBeforeNavigate?.();
    router.push(`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(deal.store)}`);
  };

  // Tap/Enter/Space activation on the row itself -- replaces the old direct
  // `goToDeal` call so a not-on-special item opens the explanation sheet
  // instead of navigating to a deal page for a deal that isn't really
  // "on" right now.
  const handleActivate = () => {
    if (isNotOnSpecial) {
      setShowNotOnSpecialSheet(true);
      return;
    }
    goToDeal();
  };

  const handleNotOnSpecialClose = () => {
    setShowNotOnSpecialSheet(false);
    onAfterNotOnSpecial?.();
  };

  return (
    <>
    <motion.div
      // Locked to a single point rather than a real range -- `dragElastic`
      // still lets the card visibly travel left under a finger/cursor, but
      // on release motion springs it straight back to `x: 0` on its own
      // (no manual reset needed). Disabled entirely once `confirmingRemove`
      // is true, so the tick/cross buttons below aren't fighting a live
      // drag gesture. See this file's own top-of-file doc comment for the
      // full "why swipe, not a tap-to-reveal X" design.
      drag={confirmingRemove || isCheaperOptionsExpanded ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={(_event, info) => {
        if (info.offset.x < -SWIPE_THRESHOLD) {
          setRemoveCardHeight(cardRef.current?.getBoundingClientRect().height ?? null);
          setConfirmingRemove(true);
        }
      }}
      // Same box, always -- normal state and the remove-warning state are
      // ONE element with the SAME classes/image, only the right-hand
      // column's children differ below. That's what makes "keep the card
      // the same size in the warning" true by construction rather than by
      // hand-matching two separate class strings (see this file's own
      // top-of-file doc comment).
      //
      // Keep inactive products visibly grey without lowering text contrast;
      // the retained current price still needs to be easy to scan. This is
      // excluded during remove confirmation, which has its own alert state.
      className="dd-compact-product-card group relative flex min-h-[76px] flex-col"
      ref={cardRef}
      style={{
        cursor: confirmingRemove ? "default" : "pointer",
        touchAction: isCheaperOptionsExpanded ? "auto" : "pan-y",
      }}
      >
      <div
        className={[
          "relative flex min-h-[76px] items-stretch overflow-hidden rounded-xl border bg-white transition-colors hover:bg-stone-50",
          isNotOnSpecial && !confirmingRemove
            ? "border-stone-200/80 grayscale bg-stone-50"
            : isRealSaver
              ? "border-fair-600"
              : isDodgyDeal
                ? "border-alert-600"
                : "border-stone-200/80",
        ].join(" ")}
        style={confirmingRemove && removeCardHeight ? { minHeight: removeCardHeight } : undefined}
      >
      {!confirmingRemove && (
        <button
          type="button"
          onClick={handleActivate}
          aria-label={isNotOnSpecial ? `${product.name}: not currently on special` : `Open ${product.name} deal at ${deal.store}`}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-inset"
        />
      )}
      {showCheaperOptions && onToggleCheaperOptions && !confirmingRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCheaperOptions();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-expanded={isCheaperOptionsExpanded}
          aria-label={(isCheaperOptionsExpanded ? "Hide" : "Show") + " cheaper options for " + product.name}
          className="absolute right-0 top-0 z-20 flex h-12 w-12 touch-manipulation items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <ChevronDown
            className={["h-5 w-5 transition-transform duration-200", isCheaperOptionsExpanded ? "rotate-180" : ""].join(" ")}
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </button>
      )}
      <div
        className={[
          "product-image-frame flex min-h-[76px] w-24 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-l-xl rounded-r-none bg-stone-50",
          "self-stretch",
          "pointer-events-none",
        ].join(" ")}
      >
        <ProductImage
          src={product.image}
          alt={product.name}
          width={96}
          height={96}
          sizes="96px"
          loading="lazy"
          className="product-image-content h-3/4 w-3/4 object-contain"
        />
      </div>
      {confirmingRemove ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 p-2">
          <span className="min-w-0 flex-1 break-words text-left text-[13px] leading-4 font-bold text-alert-700">
            Remove {product.name}?
          </span>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Confirm ${removeLabel}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-alert-600 text-white transition-colors hover:bg-alert-700"
            >
              <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              aria-label="Cancel remove"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-xs transition-colors hover:text-stone-700"
            >
              <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={[
            "flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2",
            showCheaperOptions ? "pr-12" : "",
            "pointer-events-none",
          ].join(" ")}
        >
          {(isRealSaver || isDodgyDeal || isFairPrice || isAssessmentPending) && (
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              {isRealSaver && <span className="dd-badge dd-badge-compact dd-badge-fair whitespace-nowrap">Safe to buy</span>}
              {isDodgyDeal && <span className="dd-badge dd-badge-compact dd-badge-alert whitespace-nowrap">Dodgy, don&apos;t buy</span>}
              {isFairPrice && <span className="dd-badge dd-badge-compact dd-badge-dodgy whitespace-nowrap">It&apos;s been cheaper</span>}
              {isAssessmentPending && <span className="dd-badge dd-badge-compact dd-badge-neutral whitespace-nowrap">Checking deal</span>}
            </div>
          )}
          <span className="truncate dd-type-meta text-stone-600">{brandSentenceCase}</span>
          <h4 className="line-clamp-2 text-[15px] leading-5 font-semibold text-stone-900">{product.name}</h4>
          <div className="mt-1 flex flex-wrap items-end gap-1.5">
            <span className="font-display text-base font-extrabold text-stone-900">
              {isNotOnSpecial && <span className="font-sans text-[11px] font-bold uppercase tracking-wide text-stone-500">Current </span>}
              ${deal.price.toFixed(2)}
            </span>
            {!isNotOnSpecial && <PriceChangeBadge currentPrice={deal.price} comparisonPrice={deal.originalPrice} format="amount" compact bare />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StoreLogoBadge store={deal.store} variant="compact" />
            {dealFreshnessLabel && (
              <span className="text-[10px] font-bold text-stone-500">
                {dealFreshnessLabel}
              </span>
            )}
            {otherSpecialCount > 0 && (
              <span
                className="dd-badge dd-badge-compact dd-badge-neutral"
                aria-label={`Also on special at ${otherSpecialCount} other ${otherSpecialCount === 1 ? "supermarket" : "supermarkets"}`}
              >
                +{otherSpecialCount} {otherSpecialCount === 1 ? "store" : "stores"}
              </span>
            )}
            {quantity > 1 && <span className="dd-badge dd-badge-compact dd-badge-neutral">×{quantity}</span>}
          </div>
        </div>
      )}
      </div>
      <AnimatePresence initial={false}>
        {isCheaperOptionsExpanded && (
          <motion.div
            key="watchlist-cheaper-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="overflow-hidden"
          >
            <CheaperOptionsCarousel
              alternatives={cheaperAlternatives}
              originalProductName={product.name}
              watchlistProductId={product.id}
              loading={cheaperOptionsLoading}
              error={cheaperOptionsError}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    <NotOnSpecialSheet
      open={showNotOnSpecialSheet}
      productName={product.name}
      onClose={handleNotOnSpecialClose}
    />
    </>
  );
}

/**
 * Explanation sheet for tapping a greyed-out, not-on-special list item --
 * 2026-08-21, see this file's own top-of-file doc comment for the full
 * "why" (including the Watchlist alert copy). Same bottom-sheet chrome
 * every other sheet in this app already uses (scrim + spring slide-up,
 * `rounded-t-3xl`/`shadow-2xl`, `text-lg font-black tracking-tight` title +
 * top-right close X -- see `app/page.tsx`'s `SortDropdown` or
 * `FullScreenSearch.tsx`'s Categories/Sort sheets for the same pattern) --
 * this is the first PURELY INFORMATIONAL sheet in the app (every existing
 * one is a list of selectable options), so it gets a single "Got it"
 * dismiss button instead of an options list + separate close affordance.
 * Kept as its own small component (not inlined into the card above) since
 * `AnimatePresence`/`motion.div` scrim+sheet pairs are already a
 * multi-line unit at every other call site in this app; splitting it out
 * keeps the card's own return statement focused on the row itself.
 */
function NotOnSpecialSheet({
  open,
  productName,
  onClose,
}: {
  open: boolean;
  productName: string;
  onClose: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            role="dialog"
            aria-modal="true"
            aria-label="Not currently on special"
            className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl pb-safe-sm"
          >
            <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
              <h3 className="dd-type-sheet-title text-stone-900">
                Not currently on special
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-5 text-center">
              <MascotImage
                src="/lists-login.webp"
                darkSrc="/lists-login-dark.webp"
                alt="Dodgy Deal mascot waiting for a special"
                width={288}
                height={306}
                sizes="112px"
                unoptimized
                className="mascot-wave h-auto w-28"
              />
              <p className="max-w-sm text-sm leading-relaxed text-stone-600">
                <span className="font-bold text-stone-900">{productName}</span> isn&apos;t on special right now.
                We&apos;ll let you know as soon as it is.
              </p>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={onClose}
                className="dd-sheet-cta w-full cursor-pointer rounded-xl bg-stone-900 py-3 dd-type-control text-white transition-colors hover:bg-ink-600"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
