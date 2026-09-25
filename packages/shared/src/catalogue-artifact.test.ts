import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE_ARTIFACT_SCHEMA_VERSION,
  createCatalogueArtifact,
  parseCatalogueArtifact,
} from "./catalogue-artifact.ts";
import type { ProductCard } from "./data.ts";

const PRODUCT: ProductCard = {
  id: "p1",
  brand: "Anchor",
  name: "Butter",
  category: "Fridge",
  image: "https://example.com/butter.jpg",
  standardPrice: 7,
  unit: "500g",
  currentDeals: [],
  priceHistory: [],
  description: "",
};

test("catalogue artifact round-trips its version and source marker", () => {
  const artifact = createCatalogueArtifact([PRODUCT], 1_757_000_000_000, "2026-09-25T00:00:00.000Z");
  assert.equal(artifact.schemaVersion, CATALOGUE_ARTIFACT_SCHEMA_VERSION);
  assert.deepEqual(parseCatalogueArtifact(JSON.parse(JSON.stringify(artifact))), artifact);
});

test("catalogue artifact parser rejects incompatible or malformed public data", () => {
  assert.throws(
    () => parseCatalogueArtifact({ schemaVersion: 2, generatedAt: new Date().toISOString(), sourceUpdatedAt: null, products: [] }),
    /schema is not supported/
  );
  assert.throws(
    () => parseCatalogueArtifact({ schemaVersion: 1, generatedAt: "not-a-date", sourceUpdatedAt: null, products: [] }),
    /timestamp is invalid/
  );
  assert.throws(
    () => parseCatalogueArtifact({ schemaVersion: 1, generatedAt: new Date().toISOString(), sourceUpdatedAt: null, products: [{}] }),
    /products are invalid/
  );
});
