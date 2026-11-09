import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProductCard } from "./data.ts";
import {
  filterRecentlyVerifiedSpecials,
  isVerifiedLiveSpecial,
  SPECIALS_VERIFICATION_TTL_MS,
} from "./specials-freshness.ts";

function product(id: string, verifiedAt: string | null): ProductCard {
  return {
    id,
    brand: "Test Brand",
    name: `Product ${id}`,
    category: "Pantry",
    image: "https://example.com/img.jpg",
    standardPrice: 5,
    unit: "500g",
    currentDeals: [{
      store: "Woolworths",
      price: 4,
      originalPrice: 5,
      discountPercentage: 20,
      dealType: "Real Deal",
      wasArtificiallyInflated: false,
      reason: "Verified",
      explanation: null,
      isOnSpecial: true,
      saleStartedAt: null,
      specialEndDate: null,
      specialsVerifiedAt: verifiedAt,
      ninetyDayLow: null,
      ninetyDayHigh: null,
      ninetyDayAvg: null,
      ninetyDaySamples: null,
      ninetyDaySpecialSamples: null,
      ninetyDayDaysTracked: null,
      ninetyDaySpecialDays: null,
    }],
    priceHistory: [],
    description: "",
  };
}

test("keeps cached specials only while their store snapshot remains verified", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  const recent = product("recent", new Date(now - SPECIALS_VERIFICATION_TTL_MS + 1000).toISOString());
  const expired = product("expired", new Date(now - SPECIALS_VERIFICATION_TTL_MS - 1000).toISOString());
  const missing = product("missing", null);

  assert.deepEqual(filterRecentlyVerifiedSpecials([recent, expired, missing], now), [recent]);
});

test("keeps a retailer through the backend's seven-day outage grace", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  const withinGrace = product("within-grace", new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString());
  const alsoWithinGrace = product("also-within-grace", new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString());

  const products = [withinGrace, alsoWithinGrace];
  assert.deepEqual(filterRecentlyVerifiedSpecials(products, now), products);
  assert.equal(filterRecentlyVerifiedSpecials(products, now), products);
});

test("removes only the expired store deal when another verified store remains", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  const card = product("shared", new Date(now - 1000).toISOString());
  card.currentDeals.push({
    ...card.currentDeals[0],
    store: "Four Square",
    specialsVerifiedAt: new Date(now - SPECIALS_VERIFICATION_TTL_MS - 1000).toISOString(),
  });

  const result = filterRecentlyVerifiedSpecials([card], now);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].currentDeals.map((deal) => deal.store), ["Woolworths"]);
});

test("does not treat a raw special flag as live without a matching published assessment", () => {
  assert.equal(
    isVerifiedLiveSpecial(
      { price: 4, is_special: true },
      undefined,
    ),
    false,
  );
});

test("does not treat a changed sale price as the same live special", () => {
  assert.equal(
    isVerifiedLiveSpecial(
      { price: 4, is_special: true },
      { sale_price: 4.01 },
    ),
    false,
  );
});

test("does not treat an expired published snapshot as live", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(
    isVerifiedLiveSpecial(
      { price: 4, is_special: true },
      {
        sale_price: 4,
        specials_verified_at: new Date(now - SPECIALS_VERIFICATION_TTL_MS - 1).toISOString(),
      },
      now,
    ),
    false,
  );
});

test("accepts a matching fresh published snapshot", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(
    isVerifiedLiveSpecial(
      { price: 4, is_special: true },
      {
        sale_price: 4,
        specials_verified_at: new Date(now - 60_000).toISOString(),
      },
      now,
    ),
    true,
  );
});
