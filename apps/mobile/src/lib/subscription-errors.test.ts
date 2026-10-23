import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionErrorMessage } from "./subscription-errors.ts";

test("explains when an Apple subscription belongs to another Dodgy Deal account", () => {
  assert.match(
    subscriptionErrorMessage(new Error("This Apple purchase is not linked to the signed-in account.")),
    /linked to another Dodgy Deal account/i,
  );
});

test("explains when an older Apple subscription has no Dodgy Deal account link", () => {
  const error = Object.assign(new Error("This Apple purchase is not linked to a Dodgy Deal account."), {
    code: "APPLE_PURCHASE_UNLINKED",
  });
  assert.match(subscriptionErrorMessage(error), /not linked to a Dodgy Deal account yet/i);
});

test("explains an activation delay after Apple accepts payment", () => {
  assert.match(
    subscriptionErrorMessage(new Error("Your payment was received, but your subscription is still being activated.")),
    /payment was received/i,
  );
});

test("explains when restore finds no active subscription", () => {
  assert.match(
    subscriptionErrorMessage(new Error("No active Apple subscription was found.")),
    /couldn't find an active Apple subscription/i,
  );
});
