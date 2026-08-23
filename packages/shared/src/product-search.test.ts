import { test } from "node:test";
import assert from "node:assert/strict";
import { getProductSearchMatch, getProductSearchRelevance, productMatchesSearch } from "./product-search.ts";

const product = (overrides: Partial<{ name: string; brand: string; category: string }>) => ({
  name: "Protein Milk",
  brand: "Anchor",
  category: "Fridge, Deli & Eggs > Milk",
  ...overrides,
});

test("multi-word searches match across brand and product name fields", () => {
  assert.equal(productMatchesSearch(product({}), "Anchor Protein"), true);
  assert.equal(productMatchesSearch(product({}), "protein anchor"), true);
  assert.equal(productMatchesSearch(product({}), "Anchor Protein Milk"), true);
});

test("brand matches are ranked ahead of incidental name/category matches", () => {
  const anchor = product({ name: "Protein Milk", brand: "Anchor" });
  const anchorFlavoured = product({ name: "Anchor Flavoured Milk", brand: "Other" });
  assert.ok(getProductSearchRelevance(anchor, "Anchor") > getProductSearchRelevance(anchorFlavoured, "Anchor"));
});

test("partial words work while typing, including partial brand names", () => {
  assert.equal(productMatchesSearch(product({}), "Ancho Prot"), true);
  assert.equal(productMatchesSearch(product({}), "Prote"), true);
});

test("common mobile typos use bounded fuzzy matching", () => {
  assert.equal(productMatchesSearch(product({}), "Anchr Proten"), true);
  assert.equal(getProductSearchMatch(product({}), "Anchr Proten")?.kind, "fuzzy");
});

test("short words do not fuzzy-match unrelated products", () => {
  assert.equal(productMatchesSearch(product({ name: "Pea Protein", brand: "Other" }), "tea"), false);
});

test("natural-language synonym rules work alongside another query token", () => {
  assert.equal(productMatchesSearch(product({ name: "Plain Greek Yoghurt", brand: "Anchor" }), "Anchor yogurt"), true);
});

test("punctuation and accents do not create false misses", () => {
  assert.equal(productMatchesSearch(product({ name: "Extra Créme", brand: "Anchor" }), "creme"), true);
  assert.equal(productMatchesSearch(product({ name: "Weet-Bix", brand: "Sanitarium" }), "weetbix"), true);
});
