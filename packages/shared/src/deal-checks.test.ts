import test from "node:test";
import assert from "node:assert/strict";
import { collapseConsecutiveDealChecks, type DealCheckRow } from "./deal-checks.ts";

function row(id: string, productId: string): DealCheckRow {
  return {
    id,
    user_id: "user-1",
    product_id: productId,
    store: "woolworths",
    price: 4,
    original_price: 5,
    deal_type: "Real Deal",
    checked_at: `2026-08-28T00:0${id}Z`,
  };
}

test("collapseConsecutiveDealChecks keeps the newest row in each repeated run", () => {
  const history = [row("1", "apples"), row("2", "apples"), row("3", "bread"), row("4", "apples")];

  assert.deepEqual(
    collapseConsecutiveDealChecks(history).map((check) => check.id),
    ["1", "3", "4"]
  );
});

test("collapseConsecutiveDealChecks returns a new empty list for empty history", () => {
  assert.deepEqual(collapseConsecutiveDealChecks([]), []);
});
