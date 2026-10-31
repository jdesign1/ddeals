import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import {
  buildDealDetectiveQuizCase,
  clearStoredDealDetectiveCase,
  clearStoredDealDetectivePlayedState,
  createStoredDealDetectiveCase,
  readStoredDealDetectiveCase,
  readStoredDealDetectivePlayedState,
  writeStoredDealDetectiveCase,
  writeStoredDealDetectivePlayedState,
} from "./deal-detective-quiz.ts";

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "New World",
    price: 4,
    originalPrice: 6,
    discountPercentage: 33,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "test",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: "2026-10-28T00:00:00.000Z",
    specialEndDate: null,
    scrapedAt: "2026-10-28T00:00:00.000Z",
    specialsVerifiedAt: "2026-10-28T00:00:00.000Z",
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
    ...overrides,
  };
}

function product(id: string, name: string, category: string, currentDeals: CurrentDeal[]): ProductCard {
  return {
    id,
    brand: "Test brand",
    name,
    category,
    image: "",
    standardPrice: 6,
    unit: "each",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

test("the case uses the first selected category with both verdicts", () => {
  const products = [
    product("pantry-real", "Pantry real", "Pantry", [deal({ dealType: "Real Deal" })]),
    product("pantry-dodgy", "Pantry dodgy", "Pantry", [deal({ store: "Woolworths", dealType: "Dodgy Deal" })]),
    product("dairy-real", "Dairy real", "Dairy & Eggs", [deal({ dealType: "Real Deal" })]),
    product("dairy-dodgy", "Dairy dodgy", "Dairy & Eggs", [deal({ store: "Woolworths", dealType: "Dodgy Deal" })]),
  ];

  const result = buildDealDetectiveQuizCase(products, {
    realDealKeys: ["dairy-real::newworld", "pantry-real::newworld"],
    dodgyDealKeys: ["dairy-dodgy::woolworths", "pantry-dodgy::woolworths"],
  }, ["Dairy & Eggs", "Pantry"]);

  assert.equal(result?.category, "Dairy & Eggs");
  assert.equal(result?.left.kind, "real");
  assert.equal(result?.right.kind, "dodgy");
  assert.equal(result?.left.product.id, "dairy-real");
  assert.equal(result?.right.product.id, "dairy-dodgy");
});

test("the case falls back to a valid category when preferences have no pair", () => {
  const products = [
    product("pantry-real", "Pantry real", "Pantry", [deal({ dealType: "Real Deal" })]),
    product("dairy-dodgy", "Dairy dodgy", "Dairy & Eggs", [deal({ store: "Woolworths", dealType: "Dodgy Deal" })]),
  ];

  const result = buildDealDetectiveQuizCase(products, {
    realDealKeys: ["pantry-real::newworld"],
    dodgyDealKeys: ["dairy-dodgy::woolworths"],
  }, ["Fruit & Veg"]);

  assert.equal(result?.category, null);
  assert.equal(result?.left.product.id, "pantry-real");
  assert.equal(result?.right.product.id, "dairy-dodgy");
});

test("stale, regular-price, and same-verdict keys cannot create a case", () => {
  const products = [
    product("real", "Real", "Pantry", [deal({ dealType: "Real Deal" })]),
    product("regular", "Regular", "Pantry", [deal({ isOnSpecial: false })]),
    product("dodgy", "Dodgy", "Pantry", [deal({ store: "Woolworths", dealType: "Dodgy Deal" })]),
  ];

  assert.equal(buildDealDetectiveQuizCase(products, {
    realDealKeys: ["regular::newworld"],
    dodgyDealKeys: ["dodgy::woolworths"],
  }), null);
  assert.equal(buildDealDetectiveQuizCase(products, {
    realDealKeys: ["real::newworld"],
    dodgyDealKeys: ["real::newworld"],
  }), null);
});

test("the case never pairs two verdicts from the same product", () => {
  const products = [
    product("shared", "Shared product", "Pantry", [
      deal({ dealType: "Real Deal" }),
      deal({ store: "Woolworths", dealType: "Dodgy Deal" }),
    ]),
    product("other", "Other product", "Pantry", [deal({ dealType: "Real Deal" })]),
  ];

  const result = buildDealDetectiveQuizCase(products, {
    realDealKeys: ["shared::newworld", "other::newworld"],
    dodgyDealKeys: ["shared::woolworths"],
  }, ["Pantry"]);

  assert.equal(result?.left.product.id, "other");
  assert.equal(result?.right.product.id, "shared");
});

test("a detective case is scoped, expires, and records the played publication", () => {
  const products = [
    product("real", "Real", "Pantry", [deal({ dealType: "Real Deal" })]),
    product("dodgy", "Dodgy", "Pantry", [deal({ store: "Woolworths", dealType: "Dodgy Deal" })]),
  ];
  const quizCase = buildDealDetectiveQuizCase(products, {
    realDealKeys: ["real::newworld"],
    dodgyDealKeys: ["dodgy::woolworths"],
  });
  assert.ok(quizCase);

  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });

  try {
    const storedCase = createStoredDealDetectiveCase("publication-1", quizCase, 2_000, "dodgy");
    assert.equal(storedCase.quizCase.questionKind, "dodgy");
    assert.equal(writeStoredDealDetectiveCase(storedCase, "user:user-1"), true);
    assert.equal(readStoredDealDetectiveCase("user:user-1", 1_999)?.publicationKey, "publication-1");
    assert.equal(readStoredDealDetectiveCase("user:user-1", 2_000), null);
    assert.equal(readStoredDealDetectiveCase("device", 1_000), null);

    assert.equal(writeStoredDealDetectivePlayedState("publication-1", "real", "user:user-1"), true);
    assert.equal(readStoredDealDetectivePlayedState("user:user-1")?.publicationKey, "publication-1");
    assert.equal(readStoredDealDetectivePlayedState("user:user-1")?.questionKind, "real");
    assert.equal(clearStoredDealDetectiveCase("user:user-1"), true);
    assert.equal(clearStoredDealDetectivePlayedState("user:user-1"), true);
    assert.equal(readStoredDealDetectivePlayedState("user:user-1"), null);
  } finally {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
