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
  paknsave: { short: "PNS", bg: "bg-amber-500", text: "text-stone-950" },
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
