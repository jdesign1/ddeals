/**
 * Store logo badge colors — ported verbatim from Prototype/index.html's
 * `getStoreLogoMeta` (used by its shared `ProductCard` for the bottom-left
 * store badge and the store-filter pills). Not in packages/shared because
 * it's pure presentation (Tailwind class names), unlike
 * STORE_DISPLAY_FALLBACK/normalizeStoreKey which are real data-shape
 * helpers already ported there.
 *
 * apps/mobile's live catalogue has a 5th store (SuperValue, see
 * STORE_DISPLAY_FALLBACK in packages/shared/src/data.ts) the prototype's
 * mock data never had — falls through to the same generic 2-letter/
 * stone-600 badge the prototype already used for any unrecognised store,
 * not a fabricated color.
 */
export interface StoreLogoMeta {
  short: string;
  bg: string;
  text: string;
}

const STORE_LOGOS: Record<string, StoreLogoMeta> = {
  woolworths: { short: "WW", bg: "bg-emerald-600", text: "text-white" },
  // Darkened from bg-amber-500 -> bg-amber-600 (2026-08-11, per Jay's ask to
  // darken PAK'nSAVE's brand yellow a bit) -- kept in the same Tailwind
  // amber scale, one step down, rather than a bespoke hex, so it stays
  // consistent with how every other store here picks a plain Tailwind
  // shade. Mirrored in StoreCompareChart.tsx's STORE_TICK_COLORS and the
  // deal-assessment page's STORE_TEXT_COLOR map -- both derive their
  // PAK'nSAVE color from this same bg-amber-600 value, not a separate one.
  // `text-white` (2026-08-12, per Jay's ask, was `text-stone-950` -- dark
  // text was likely the original higher-contrast pairing for the lighter
  // pre-2026-08-11 `bg-amber-500`; white reads fine against the now-darker
  // `bg-amber-600`), matching every other store badge here (all `text-white`
  // except the generic stone-600 fallback, also white).
  paknsave: { short: "PNS", bg: "bg-amber-600", text: "text-white" },
  newworld: { short: "NW", bg: "bg-rose-600", text: "text-white" },
  foursquare: { short: "FS", bg: "bg-green-600", text: "text-white" },
};

export function getStoreLogoMeta(storeName: string): StoreLogoMeta {
  const norm = storeName.toLowerCase().replace(/[^a-z]/g, "");
  if (norm.includes("woolworth")) return STORE_LOGOS.woolworths;
  if (norm.includes("paknsave")) return STORE_LOGOS.paknsave;
  if (norm.includes("newworld")) return STORE_LOGOS.newworld;
  if (norm.includes("foursquare")) return STORE_LOGOS.foursquare;
  return { short: storeName.substring(0, 2).toUpperCase(), bg: "bg-stone-600", text: "text-white" };
}
