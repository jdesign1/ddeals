import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import {
  buildDidYouKnowCards,
  createDidYouKnowSeenState,
  getDidYouKnowFingerprint,
  getDidYouKnowScope,
  hasNewDidYouKnowCardData,
  markDidYouKnowCardSeen,
  readDidYouKnowSeenState,
  writeDidYouKnowSeenState,
} from "./did-you-know.ts";

const NOW = Date.parse("2026-11-05T12:00:00.000Z");

function deal(overrides: Partial<CurrentDeal> = {}): CurrentDeal {
  return {
    store: "New World",
    price: 8,
    originalPrice: 10,
    discountPercentage: 20,
    dealType: "Real Deal",
    wasArtificiallyInflated: false,
    reason: "Genuine sale",
    explanation: null,
    isOnSpecial: true,
    saleStartedAt: "2026-11-02T12:00:00.000Z",
    specialEndDate: null,
    ninetyDayLow: 8,
    ninetyDayHigh: 12,
    ninetyDayAvg: 10,
    ninetyDaySamples: 12,
    ninetyDaySpecialSamples: 5,
    ninetyDayPriceChanges: 4,
    ninetyDayDaysTracked: 80,
    ninetyDaySpecialDays: 30,
    storeHistoryReady: true,
    ...overrides,
  };
}

function product(id: string, category: string, currentDeals: CurrentDeal[]): ProductCard {
  return {
    id,
    brand: "Test brand",
    name: `${id} item`,
    category,
    image: "",
    standardPrice: 10,
    unit: "each",
    currentDeals,
    priceHistory: [],
    description: "",
  };
}

function productsFor(category: string, count: number, overrides: Partial<CurrentDeal> = {}): ProductCard[] {
  return Array.from({ length: count }, (_, index) => product(`${category}-${index}`, category, [deal(overrides)]));
}

test("buildDidYouKnowCards creates a stable discovery set from qualified product groups", () => {
  const cards = buildDidYouKnowCards([
    ...productsFor("Pantry", 20),
    ...productsFor("Health & Body", 12, { ninetyDayAvg: 14, price: 8 }),
    ...productsFor("Household", 12, { saleStartedAt: "2026-11-04T12:00:00.000Z" }),
  ], ["all"], NOW);

  assert.ok(cards.length >= 3);
  assert.equal(cards[0].kind, "real-saver-leader");
  assert.equal(cards[0].category, "Pantry");
  assert.equal(cards[0].metric, 20);
  assert.ok(cards.some((card) => card.kind === "historical-value"));
  const freshCard = cards.find((card) => card.kind === "fresh-deal-wave");
  assert.ok(freshCard);
  assert.equal(freshCard.search.dealKeys?.length, freshCard.metric);
  assert.equal(freshCard.search.preserveSelectedStores, true);
  assert.equal(new Set(cards.map((card) => card.category)).size, cards.length);
  assert.equal(getDidYouKnowFingerprint(cards), getDidYouKnowFingerprint(cards));
});

test("Dodgy alerts are conditional and use the existing Dodgy search route", () => {
  const cards = buildDidYouKnowCards([
    ...productsFor("Pantry", 20),
    ...productsFor("Body Wash", 20, { dealType: "Dodgy Deal", ninetyDayPriceChanges: null }),
  ], ["all"], NOW, 5);

  const dodgy = cards.find((card) => card.kind === "dodgy-alert");
  assert.ok(dodgy);
  assert.equal(dodgy.category, "Health & Body");
  assert.equal(dodgy.search.filter, "dodgy");
  assert.equal(dodgy.search.sortBy, "worst-dodgy");
});

test("store scope changes card facts without counting unselected supermarkets", () => {
  const cards = buildDidYouKnowCards([
    product("new-world", "Pantry", [deal({ store: "New World" })]),
    product("woolworths", "Household", [deal({ store: "Woolworths" })]),
  ], ["woolworths"], NOW);

  assert.equal(cards.length, 0);
});

test("seen state storage is versioned and scoped", () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } },
  });

  const scope = getDidYouKnowScope("user:test", ["woolworths", "newworld"]);
  assert.equal(writeDidYouKnowSeenState({ version: 2, publicationKey: "pub-1", cardFingerprints: { pantry: "a" } }, scope), true);
  assert.deepEqual(readDidYouKnowSeenState(scope), { version: 2, publicationKey: "pub-1", cardFingerprints: { pantry: "a" } });
  assert.notEqual(getDidYouKnowScope("user:test", ["woolworths"]), scope);

  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("Did you know unread state is tracked per card until that card is selected", () => {
  const cards = buildDidYouKnowCards([
    ...productsFor("Pantry", 20),
    ...productsFor("Body Wash", 20, { dealType: "Dodgy Deal", ninetyDayPriceChanges: null }),
  ], ["all"], NOW, 2);
  assert.equal(cards.length, 2);

  const initial = createDidYouKnowSeenState(cards, "pub-1");
  const changedCards = cards.map((card, index) => index === 0 ? { ...card, metric: card.metric + 1 } : card);
  const changedState = { ...initial, publicationKey: "pub-2" };

  assert.equal(hasNewDidYouKnowCardData(changedCards[0], changedState), true);
  assert.equal(hasNewDidYouKnowCardData(changedCards[1], changedState), false);

  const afterSelection = markDidYouKnowCardSeen(changedState, changedCards[0], "pub-2");
  assert.equal(hasNewDidYouKnowCardData(changedCards[0], afterSelection), false);
  assert.equal(hasNewDidYouKnowCardData(changedCards[1], afterSelection), false);
});
