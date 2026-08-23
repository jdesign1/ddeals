import { test } from "node:test";
import assert from "node:assert/strict";
import { getSearchSynonymRule, productMatchesSynonymRule, type SynonymMatchableProduct } from "./search-synonyms.ts";

function product(overrides: Partial<SynonymMatchableProduct>): SynonymMatchableProduct {
  return { name: "", brand: "", category: "", ...overrides };
}

test("unrecognized query returns null (falls through to plain substring match)", () => {
  assert.equal(getSearchSynonymRule("milk"), null);
  assert.equal(getSearchSynonymRule("cheese"), null);
  assert.equal(getSearchSynonymRule("eggs"), null);
  assert.equal(getSearchSynonymRule("bananas"), null);
});

test("dairy: real dairy-case products match, even under the bare 'Fridge & Deli' fallback category", () => {
  const rule = getSearchSynonymRule("dairy")!;
  assert.ok(rule);
  assert.ok(productMatchesSynonymRule(rule, product({ name: "meadow fresh milk standard uht", category: "Fridge & Deli" })));
  assert.ok(productMatchesSynonymRule(rule, product({ name: "mainland cheese mild", category: "Fridge & Deli" })));
  assert.ok(productMatchesSynonymRule(rule, product({ name: "anchor butter", category: "Fridge & Deli" })));
  assert.ok(
    productMatchesSynonymRule(rule, product({ name: "Simply Apricot Yoghurt", category: "Fridge, Deli & Eggs > Yoghurt > Large Yoghurt Tubs" }))
  );
});

test("dairy: excludes dairy-free / plant-based / 'Dairy Milk' chocolate branding", () => {
  const rule = getSearchSynonymRule("dairy")!;
  assert.equal(
    productMatchesSynonymRule(rule, product({ name: "Coconut Yoghurt", category: "Fridge, Deli & Eggs > Yoghurt > Dairy Free Yoghurt" })),
    false
  );
  assert.equal(
    productMatchesSynonymRule(rule, product({ name: "Dairy Milk Chocolate Bar", category: "Snacks, Treats & Easy Meals > Chocolate, Sweets & Chewing Gum" })),
    false
  );
  assert.equal(productMatchesSynonymRule(rule, product({ name: "Organic Coconut Milk", category: "Pantry > Canned Foods & Packets > Coconut Cream & Milk" })), false);
  // A genuine dairy yoghurt that merely mentions coconut as a flavour must still match -- the exclude is the
  // two-word phrase "coconut milk"/"coconut cream", not the bare word "coconut" (see this module's own doc
  // comment on why a blanket "coconut" exclude was tried and rejected).
  assert.ok(
    productMatchesSynonymRule(
      rule,
      product({ name: "Mango & Coconut Authentic Greek Yoghurt", category: "Fridge, Deli & Eggs > Yoghurt > Large Yoghurt Tubs" })
    )
  );
});

test("dairy: does not match generic 'milk'/'cheese'/'butter' words outside the fridge aisle", () => {
  const rule = getSearchSynonymRule("dairy")!;
  assert.equal(productMatchesSynonymRule(rule, product({ name: "Smooth Peanut Butter", category: "Pantry > Jams, Honey & Spreads > Peanut & Nut Butter" })), false);
  assert.equal(productMatchesSynonymRule(rule, product({ name: "Shea Butter Beauty Cream Bar Soap", category: "Health & Body > Bath, Shower & Soap > Soap Bars" })), false);
  assert.equal(productMatchesSynonymRule(rule, product({ name: "taste of india simmer sauce butter chicken", category: "Pantry" })), false);
  assert.equal(
    productMatchesSynonymRule(rule, product({ name: "Kit Kat Milk Chocolate Block", category: "Snacks, Treats & Easy Meals > Chocolate, Sweets & Chewing Gum > Chocolate Blocks" })),
    false
  );
  assert.equal(productMatchesSynonymRule(rule, product({ name: "Milk & Honey Liquid Hand Soap", category: "Health & Body > Bath, Shower & Soap > Hand Wash & Sanitiser" })), false);
});

test("dairy: a category segment literally named Milk/Cheese/Yoghurt matches regardless of top-level bucket (e.g. flavoured milk drinks)", () => {
  const rule = getSearchSynonymRule("dairy")!;
  assert.ok(
    productMatchesSynonymRule(rule, product({ name: "Banana Blast Flavoured Milk", category: "Hot & Cold Drinks > Hot Chocolate & Milk Drinks > Flavoured Milk" }))
  );
});

test("yogurt/yogurts (American spelling) match the NZ-spelled 'yoghurt' category/name", () => {
  for (const q of ["yogurt", "yogurts"]) {
    const rule = getSearchSynonymRule(q)!;
    assert.ok(rule, q);
    assert.ok(productMatchesSynonymRule(rule, product({ name: "Simply Apricot Yoghurt", category: "Fridge, Deli & Eggs > Yoghurt > Large Yoghurt Tubs" })));
    assert.equal(productMatchesSynonymRule(rule, product({ name: "Meadow Fresh Milk", category: "Fridge & Deli" })), false);
  }
});

test("diaper/diapers match nappy/nappies products", () => {
  for (const q of ["diaper", "diapers"]) {
    const rule = getSearchSynonymRule(q)!;
    assert.ok(rule, q);
    assert.ok(
      productMatchesSynonymRule(rule, product({ name: "Nappies Newborn Size 1 Up to 5kg", category: "Baby & Toddler > Nappies & Changing > Newborn Nappies (Up to 5kg)" }))
    );
    assert.ok(productMatchesSynonymRule(rule, product({ name: "Ultra Dry Nappy Pants Girl Size 4", category: "Baby & Toddler > Nappies & Changing > Nappy Pants" })));
  }
});

test("veggie/veggies match real vegetable products, gated away from unrelated 'veg' substrings elsewhere", () => {
  for (const q of ["veggie", "veggies"]) {
    const rule = getSearchSynonymRule(q)!;
    assert.ok(rule, q);
    assert.ok(productMatchesSynonymRule(rule, product({ name: "Baby Peas", category: "Frozen > Frozen Vegetables > Frozen Peas, Corn & Beans" })));
    assert.ok(productMatchesSynonymRule(rule, product({ name: "woolworths fresh vegetable carrots", category: "Fruit & Veg" })));
    // Regression check for the exact real collision found live: normalizing "shave gel" by squishing spaces
    // out entirely creates the accidental substring "vege" ("...ha-VEG-El...") -- token-based matching must
    // not reproduce it.
    assert.equal(productMatchesSynonymRule(rule, product({ name: "schick hydro shave gel sensitive", brand: "schick hydro", category: "Health & Body" })), false);
  }
});
