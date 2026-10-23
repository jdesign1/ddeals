import assert from "node:assert/strict";
import test from "node:test";
import { appleTransactionVerificationKey } from "./subscription-verification.ts";

test("scopes Apple transaction verification to the signed-in account", () => {
  const accountA = appleTransactionVerificationKey("transaction-1", "jws", "account-a");
  const accountB = appleTransactionVerificationKey("transaction-1", "jws", "account-b");

  assert.notEqual(accountA, accountB);
  assert.equal(accountA, appleTransactionVerificationKey("transaction-1", "different-jws", "account-a"));
});
