import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_SECTIONS, groupCategory } from "./deal-detail.ts";

const SCREENSHOT_CATEGORIES = [
  "Fruit & Veg",
  "Meat & Poultry",
  "Fish & Seafood",
  "Fridge & Deli",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Beer & Wine",
  "Drinks",
  "Health & Body",
  "Household & Cleaning",
  "Baby & Child",
  "Pets",
];

test("category sheet taxonomy matches the approved category list and order", () => {
  assert.deepEqual(
    CATEGORY_SECTIONS.flatMap((section) => section.categories),
    SCREENSHOT_CATEGORIES,
  );
});

test("retailer category variants resolve to the approved shopper labels", () => {
  const cases: Array<[string, string]> = [
    ["Fruit & Vegetables", "Fruit & Veg"],
    ["Meat & Poultry", "Meat & Poultry"],
    ["Fish", "Fish & Seafood"],
    ["Seafood", "Fish & Seafood"],
    ["Meat, Poultry & Seafood > Seafood > Fish Fillets", "Fish & Seafood"],
    ["Meat, Poultry & Seafood > Chicken & Poultry > Chicken Drumsticks", "Meat & Poultry"],
    ["Meat & Seafood", "Meat & Poultry"],
    ["Fridge & Deli", "Fridge & Deli"],
    ["Dairy & Eggs", "Dairy & Eggs"],
    ["Fridge, Deli & Eggs", "Fridge & Deli"],
    ["Fridge, Deli & Eggs > Dairy > Milk", "Dairy & Eggs"],
    ["Chilled", "Fridge & Deli"],
    ["Frozen & Chilled", "Frozen"],
    ["Frozen", "Frozen"],
    ["Pantry", "Pantry"],
    ["Snacks & Treats", "Pantry"],
    ["Beer, Cider & Wine", "Beer & Wine"],
    ["Cold Drinks", "Drinks"],
    ["Health & Body", "Health & Body"],
    ["Household & Cleaning", "Household & Cleaning"],
    ["Baby & Child", "Baby & Child"],
    ["Pets", "Pets"],
  ];

  for (const [rawCategory, expected] of cases) {
    assert.equal(groupCategory(rawCategory), expected, rawCategory);
  }
});

test("combined departments use product names when the category path is not specific enough", () => {
  assert.equal(groupCategory("Meat & Seafood", "Pams Sliced Smoked Salmon 100g"), "Fish & Seafood");
  assert.equal(groupCategory("Meat & Seafood", "Chicken Drumsticks Tray Pack"), "Meat & Poultry");
  assert.equal(groupCategory("Cleaning, Health & Body", "Ecostore Handwash 300ml"), "Health & Body");
  assert.equal(groupCategory("Cleaning, Health & Body", "Laundry Detergent 2L"), "Household & Cleaning");
  assert.equal(groupCategory("Fridge, Deli & Eggs", "Anchor Milk 2L"), "Dairy & Eggs");
  assert.equal(groupCategory("Fridge, Deli & Eggs", "Sliced Roast Chicken"), "Fridge & Deli");
  assert.equal(groupCategory("Dinner > Desserts > Frozen Desserts", "Sara Lee Chocolate Pudding"), "Frozen");
  assert.equal(groupCategory("Dinner > Heat & Eat > Vegan & Vegetarian", "Quorn Tenders"), "Pantry");
  assert.equal(groupCategory("Christmas > Festive Beer & Wine > Beer", "Krombacher Beer"), "Beer & Wine");
  assert.equal(groupCategory(null, "McCain Pub Style Wedges Beer Batter"), "Frozen");
  assert.equal(groupCategory(null, "Palmolive Naturals Conditioner"), "Health & Body");
});
