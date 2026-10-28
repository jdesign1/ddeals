import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_INTERESTS, normalizeCategoryInterests } from "./category-interests.ts";

test("normalizes category interests to known, unique choices", () => {
  assert.deepEqual(
    normalizeCategoryInterests(["Pantry", "Pantry", "Unknown", "Dairy & Eggs"]),
    ["Pantry", "Dairy & Eggs"],
  );
});

test("keeps only the first three category interests", () => {
  assert.deepEqual(
    normalizeCategoryInterests(["Fruit & Veg", "Pantry", "Drinks", "Frozen"]),
    ["Fruit & Veg", "Pantry", "Drinks"],
  );
});

test("the account constraint stays aligned with the app category taxonomy", () => {
  const migrationSql = readFileSync(
    fileURLToPath(new URL("../../../../supabase/accounts-migrations/20261028090000_category_interests.sql", import.meta.url)),
    "utf8",
  );
  const missing = CATEGORY_INTERESTS
    .flatMap((section) => section.categories)
    .filter((category) => !migrationSql.includes(`'${category}'`));

  assert.deepEqual(missing, []);
});
