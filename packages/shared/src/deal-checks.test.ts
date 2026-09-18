import test from "node:test";
import assert from "node:assert/strict";
import { collapseConsecutiveDealChecks, fetchDealCheckHistory, type DealCheckRow } from "./deal-checks.ts";
import { describeFetchError } from "./error-messages.ts";
import type { SupabaseClient } from "./supabase.ts";

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

test("fetchDealCheckHistory preserves HTTP 402 so All Checks can show the service error state", async () => {
  const response = {
    data: null,
    error: { message: "Payment Required" },
    status: 402,
  };
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lt: () => builder,
    then: (resolve: (value: typeof response) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  const client = {
    from: () => builder,
  } as unknown as SupabaseClient;

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(fetchDealCheckHistory(client), (error: Error) => {
      assert.match(error.message, /HTTP 402/);
      assert.equal(
        describeFetchError(error, "Failed to load your check history"),
        "We're having trouble on our end right now. Please try again a little later."
      );
      return true;
    });
  } finally {
    console.error = originalConsoleError;
  }
});
