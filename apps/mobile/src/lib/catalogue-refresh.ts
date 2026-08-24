import type { ProductCard } from "@dodgey-deals/shared";

/** Shared browser event used to update route-local catalogue consumers after a refresh. */
export const CATALOGUE_UPDATED_EVENT = "dodgey-deals:catalogue-updated";

export function publishCatalogueUpdate(products: ProductCard[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProductCard[]>(CATALOGUE_UPDATED_EVENT, { detail: products }));
}

export function subscribeToCatalogueUpdates(onUpdate: (products: ProductCard[]) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleUpdate = (event: Event) => {
    const products = (event as CustomEvent<ProductCard[]>).detail;
    if (Array.isArray(products)) onUpdate(products);
  };

  window.addEventListener(CATALOGUE_UPDATED_EVENT, handleUpdate);
  return () => window.removeEventListener(CATALOGUE_UPDATED_EVENT, handleUpdate);
}
