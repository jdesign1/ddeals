import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountSignInMethodDisplay } from "./account-display.ts";

test("Apple accounts show Apple sign-in instead of a private relay email", () => {
  assert.equal(
    getAccountSignInMethodDisplay({
      app_metadata: { provider: "apple", providers: ["apple"] },
      identities: [{ id: "apple", user_id: "user", identity_id: "apple", provider: "apple" }],
    }),
    "Apple sign-in",
  );
});

test("accounts with multiple linked methods list each method", () => {
  assert.equal(
    getAccountSignInMethodDisplay({
      app_metadata: { provider: "apple", providers: ["apple", "email"] },
      identities: [
        { id: "apple", user_id: "user", identity_id: "apple", provider: "apple" },
        { id: "email", user_id: "user", identity_id: "email", provider: "email" },
      ],
    }),
    "Apple and Email sign-in",
  );
});
