import type { ProductCard } from "./data.ts";

/** Increment when the public JSON shape changes incompatibly. */
export const CATALOGUE_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const CATALOGUE_VERSION_SCHEMA_VERSION = 1 as const;

export interface CatalogueArtifact {
  schemaVersion: typeof CATALOGUE_ARTIFACT_SCHEMA_VERSION;
  /** Stable source publication marker, not the time this response was served. */
  sourceUpdatedAt: number | null;
  generatedAt: string;
  products: ProductCard[];
}

export interface CatalogueVersion {
  schemaVersion: typeof CATALOGUE_VERSION_SCHEMA_VERSION;
  /** Stable source publication marker, not the time this response was served. */
  sourceUpdatedAt: number;
}

export function createCatalogueArtifact(
  products: ProductCard[],
  sourceUpdatedAt: number | null,
  generatedAt = new Date().toISOString()
): CatalogueArtifact {
  return {
    schemaVersion: CATALOGUE_ARTIFACT_SCHEMA_VERSION,
    sourceUpdatedAt: typeof sourceUpdatedAt === "number" && Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : null,
    generatedAt,
    products,
  };
}

export function createCatalogueVersion(sourceUpdatedAt: number): CatalogueVersion {
  if (!Number.isFinite(sourceUpdatedAt)) throw new Error("Catalogue version marker is invalid");
  return {
    schemaVersion: CATALOGUE_VERSION_SCHEMA_VERSION,
    sourceUpdatedAt,
  };
}

function isProductCard(value: unknown): value is ProductCard {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<ProductCard>;
  return (
    typeof product.id === "string"
    && typeof product.name === "string"
    && typeof product.brand === "string"
    && Array.isArray(product.currentDeals)
    && Array.isArray(product.priceHistory)
  );
}

/** Validates untrusted CDN JSON before it can replace the local catalogue. */
export function parseCatalogueArtifact(value: unknown): CatalogueArtifact {
  if (!value || typeof value !== "object") throw new Error("Catalogue artifact is not an object");
  const artifact = value as Partial<CatalogueArtifact>;
  if (artifact.schemaVersion !== CATALOGUE_ARTIFACT_SCHEMA_VERSION) {
    throw new Error("Catalogue artifact schema is not supported");
  }
  if (typeof artifact.generatedAt !== "string" || !Number.isFinite(Date.parse(artifact.generatedAt))) {
    throw new Error("Catalogue artifact timestamp is invalid");
  }
  if (
    artifact.sourceUpdatedAt !== null
    && (typeof artifact.sourceUpdatedAt !== "number" || !Number.isFinite(artifact.sourceUpdatedAt))
  ) {
    throw new Error("Catalogue artifact source marker is invalid");
  }
  if (!Array.isArray(artifact.products) || !artifact.products.every(isProductCard)) {
    throw new Error("Catalogue artifact products are invalid");
  }
  return artifact as CatalogueArtifact;
}

export function parseCatalogueVersion(value: unknown): CatalogueVersion {
  if (!value || typeof value !== "object") throw new Error("Catalogue version is not an object");
  const version = value as Partial<CatalogueVersion>;
  if (version.schemaVersion !== CATALOGUE_VERSION_SCHEMA_VERSION) {
    throw new Error("Catalogue version schema is not supported");
  }
  if (typeof version.sourceUpdatedAt !== "number" || !Number.isFinite(version.sourceUpdatedAt)) {
    throw new Error("Catalogue version marker is invalid");
  }
  return version as CatalogueVersion;
}
