import assert from "node:assert/strict";
import { test } from "node:test";
import { createTop20Snapshot, getTop20DealKey, resolveTop20Snapshot } from "./top20-freshness.ts";

function snapshot(keys: Array<[string, string]>, publishedAt: string) {
  return createTop20Snapshot(
    keys.map(([productId, store]) => ({ productId, store })),
    publishedAt,
  )!;
}

test("the first published Top 20 snapshot has no New badges", () => {
  const current = snapshot([["p1", "Woolworths"], ["p2", "New World"]], "2026-10-08T00:00:00Z");

  assert.deepEqual(resolveTop20Snapshot(current, null).newKeys, []);
});

test("newly entered items are marked when the published snapshot changes", () => {
  const previous = snapshot([["p1", "Woolworths"]], "2026-10-07T00:00:00Z");
  const current = snapshot([["p2", "New World"], ["p1", "Woolworths"]], "2026-10-08T00:00:00Z");

  assert.deepEqual(resolveTop20Snapshot(current, previous).newKeys, [getTop20DealKey("p2", "New World")]);
});

test("the active New state survives re-reading the same publication", () => {
  const previous = snapshot([["p1", "Woolworths"]], "2026-10-07T00:00:00Z");
  const current = resolveTop20Snapshot(
    snapshot([["p2", "New World"], ["p1", "Woolworths"]], "2026-10-08T00:00:00Z"),
    previous,
  );

  assert.deepEqual(resolveTop20Snapshot(current, current).newKeys, current.newKeys);
});
