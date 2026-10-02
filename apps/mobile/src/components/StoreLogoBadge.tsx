import Image from "next/image";
import { STORE_DISPLAY_FALLBACK, normalizeStoreKey } from "@dodgey-deals/shared";
import { getStoreLogoMeta } from "@/lib/store-meta";

export type StoreLogoBadgeVariant = "compact" | "card" | "ranking";

const SIZE_CLASS: Record<StoreLogoBadgeVariant, string> = {
  compact: "h-5 w-7",
  card: "h-6 w-8",
  ranking: "h-8 w-8",
};

interface StoreLogoBadgeProps {
  store: string;
  variant?: StoreLogoBadgeVariant;
  className?: string;
}

/**
 * A fixed-footprint supermarket mark. Unknown retailers deliberately retain
 * the former letter badge so incomplete catalogue data never produces a
 * broken image or an unlabeled tile.
 */
export default function StoreLogoBadge({ store, variant = "card", className = "" }: StoreLogoBadgeProps) {
  const meta = getStoreLogoMeta(store);
  const storeLabel = STORE_DISPLAY_FALLBACK[normalizeStoreKey(store)] || store;
  const sizeClass = SIZE_CLASS[variant];

  if (!meta.logoSrc || !meta.logoBackground) {
    return (
      <span
        aria-label={storeLabel}
        title={storeLabel}
        className={`flex ${sizeClass} shrink-0 select-none items-center justify-center rounded-md dd-type-badge shadow-xs ${meta.bg} ${meta.text} ${className}`}
      >
        {meta.short}
      </span>
    );
  }

  return (
    <span
      aria-label={storeLabel}
      title={storeLabel}
      className={`relative flex ${sizeClass} shrink-0 select-none items-center justify-center overflow-hidden rounded-md shadow-xs ring-1 ring-black/10 ${className}`}
      style={{ backgroundColor: meta.logoBackground }}
    >
      <Image
        src={meta.logoSrc}
        alt=""
        aria-hidden="true"
        width={meta.logoWidth ?? 30}
        height={meta.logoHeight ?? 30}
        className={
          meta.logoShape === "tile"
            ? "h-full w-full object-contain"
            : meta.logoShape === "wordmark"
              ? "h-auto max-h-[58%] w-[88%] object-contain"
              : "h-[76%] w-[76%] object-contain"
        }
      />
    </span>
  );
}
