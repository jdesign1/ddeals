import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFetchError } from "./error-messages.ts";

// describeFetchError always logs to console.error -- swap it out for these
// tests so the suite's own output stays clean, and restore it after.
function withSilencedConsoleError(fn: () => void) {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
}

test("describeFetchError: maps 401/403 to the same 'our end' message as 5xx, NOT a sign-in prompt", () => {
  // Peer review (2026-08-19): every HTTP-status error this function
  // actually sees comes from data.ts's anon-key PostgREST calls, never a
  // per-user JWT request -- a 401/403 here can only be a server-side
  // anon-key/RLS misconfig, and telling the user to "sign in" would be a
  // false, unfixable-by-them remedy. See error-messages.ts's own doc
  // comment for the full reasoning.
  withSilencedConsoleError(() => {
    assert.equal(
      describeFetchError(new Error("products -> HTTP 401"), "Failed to load"),
      "Something's wrong on our end -- try again shortly."
    );
    assert.equal(
      describeFetchError(new Error("products -> HTTP 403"), "Failed to load"),
      "Something's wrong on our end -- try again shortly."
    );
  });
});

test("describeFetchError: maps 404 to a not-found message", () => {
  withSilencedConsoleError(() => {
    assert.equal(describeFetchError(new Error("products -> HTTP 404"), "Failed to load"), "Couldn't find that.");
  });
});

test("describeFetchError: maps 429 to a rate-limit message", () => {
  withSilencedConsoleError(() => {
    assert.equal(
      describeFetchError(new Error("products -> HTTP 429"), "Failed to load"),
      "Too many requests right now -- try again in a moment."
    );
  });
});

test("describeFetchError: maps every 5xx to the same 'our end' message as 401/403", () => {
  withSilencedConsoleError(() => {
    for (const status of [500, 502, 503, 504]) {
      assert.equal(
        describeFetchError(new Error(`products -> HTTP ${status}`), "Failed to load"),
        "Something's wrong on our end -- try again shortly."
      );
    }
  });
});

test("describeFetchError: unmapped 4xx (e.g. the real 400 that caused this) keeps the caller's fallback wording plus the bare status", () => {
  withSilencedConsoleError(() => {
    const longPath =
      "dodgy_deals_cache?select=product_id,store_id,product_name,brand,category,store_name,sale_price,normal_price,saving_pct,special_label,was_price,special_end_date,image_url,unit_size,sale_started_at,verdict,reason,price_history_90d_low,price_history_90d_high,price_history_90d_avg,price_history_90d_samples,price_history_90d_special_samples -> HTTP 400";
    const result = describeFetchError(new Error(longPath), "Couldn't load today's specials.");
    assert.equal(result, "Couldn't load today's specials. (error 400)");
    // The raw 200+ character query string must never leak into the
    // user-facing string -- this is the exact bug being fixed.
    assert.ok(!result.includes("select="));
    assert.ok(!result.includes("dodgy_deals_cache"));
  });
});

test("describeFetchError: network-level failures (no HTTP status reached at all) get a connectivity message", () => {
  withSilencedConsoleError(() => {
    assert.equal(
      describeFetchError(new TypeError("fetch failed"), "Failed to load"),
      "Check your internet connection and try again."
    );
    assert.equal(
      describeFetchError(new Error("NetworkError when attempting to fetch resource"), "Failed to load"),
      "Check your internet connection and try again."
    );
  });
});

test("describeFetchError: unrecognized Error messages fall back to the caller's own default text, unchanged", () => {
  withSilencedConsoleError(() => {
    assert.equal(describeFetchError(new Error("something odd happened"), "Failed to load lists"), "Failed to load lists");
  });
});

test("describeFetchError: non-Error throws fall back to the caller's own default text", () => {
  withSilencedConsoleError(() => {
    assert.equal(describeFetchError("a plain string throw", "Failed to load lists"), "Failed to load lists");
    assert.equal(describeFetchError(undefined, "Failed to load lists"), "Failed to load lists");
  });
});
