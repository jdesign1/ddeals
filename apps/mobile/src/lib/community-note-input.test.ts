import assert from "node:assert/strict";
import test from "node:test";
import { parseCommunityNoteInput } from "./community-note-input.ts";

test("community note input accepts a body-only tip", () => {
  const result = parseCommunityNoteInput({ body: "Try the smaller pack for a better unit price." });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      sourceStoreId: null,
      price: null,
      observedOn: null,
      regionCode: null,
      body: "Try the smaller pack for a better unit price.",
    });
  }
});

test("community note input normalises complete price evidence", () => {
  const result = parseCommunityNoteInput({
    sourceStoreId: " WOOLWORTHS ",
    price: "4.50",
    observedOn: "2026-10-20",
    regionCode: " AUCKLAND ",
    body: "  Half-price this week.  ",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sourceStoreId, "woolworths");
    assert.equal(result.value.price, 4.5);
    assert.equal(result.value.regionCode, "auckland");
    assert.equal(result.value.body, "Half-price this week.");
  }
});

test("community note input normalises partial evidence for endpoint-level validation", () => {
  const result = parseCommunityNoteInput({
    sourceStoreId: "newworld",
    price: "4.50",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sourceStoreId, "newworld");
    assert.equal(result.value.price, 4.5);
    assert.equal(result.value.observedOn, null);
  }
});

test("community note input rejects unsupported stores and control characters", () => {
  const unsupportedStore = parseCommunityNoteInput({ sourceStoreId: "unknown", body: "A useful tip" });
  assert.equal(unsupportedStore.ok, false);

  const controlCharacter = parseCommunityNoteInput({ body: "A useful\u0007 tip" });
  assert.equal(controlCharacter.ok, false);
  if (!controlCharacter.ok) assert.equal(controlCharacter.status, 422);
});
