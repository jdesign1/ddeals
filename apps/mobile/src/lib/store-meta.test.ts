import assert from "node:assert/strict";
import { test } from "node:test";
import { getStoreLogoMeta } from "./store-meta.ts";

test("supported supermarkets resolve to official logo assets", () => {
  for (const store of ["Woolworths", "PAK'nSAVE", "New World", "Four Square", "SuperValue"]) {
    const meta = getStoreLogoMeta(store);

    assert.match(meta.logoSrc ?? "", /^(\/store-logos\/[a-z]+\.svg|https:\/\/au-images\.contentstack\.com\/)/);
    assert.ok(meta.logoBackground);
  }
});

test("unknown supermarkets keep an accessible letter fallback", () => {
  assert.deepEqual(getStoreLogoMeta("Local Grocer"), {
    short: "LO",
    bg: "bg-stone-600",
    text: "text-white",
  });
});
