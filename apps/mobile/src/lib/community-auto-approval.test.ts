import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCompletePriceEvidence,
  isAccountOldEnoughForCommunityAutoApproval,
  parseCommunityAutoApprovalMode,
  shouldAutoApproveCommunityNote,
} from "./community-auto-approval.ts";

test("auto approval defaults to shadow mode", () => {
  assert.equal(parseCommunityAutoApprovalMode(undefined), "shadow");
  assert.equal(parseCommunityAutoApprovalMode("unexpected"), "shadow");
  assert.equal(parseCommunityAutoApprovalMode("ACTIVE"), "active");
  assert.equal(parseCommunityAutoApprovalMode("off"), "off");
});

test("only trusted clean notes can be auto approved", () => {
  const completePriceTip = {
    mode: "active" as const,
    decision: "allow" as const,
    trustedAccount: true,
    hasCompletePriceEvidence: true,
  };
  assert.equal(shouldAutoApproveCommunityNote(completePriceTip), true);
  assert.equal(shouldAutoApproveCommunityNote({ ...completePriceTip, trustedAccount: false }), false);
  assert.equal(shouldAutoApproveCommunityNote({ ...completePriceTip, mode: "shadow" }), false);
  assert.equal(shouldAutoApproveCommunityNote({ ...completePriceTip, decision: "review" }), false);
  assert.equal(shouldAutoApproveCommunityNote({ ...completePriceTip, decision: "block" }), false);
  assert.equal(shouldAutoApproveCommunityNote({ ...completePriceTip, hasCompletePriceEvidence: false }), false);
});

test("complete price evidence requires a supermarket, positive price, and date", () => {
  assert.equal(hasCompletePriceEvidence("newworld", 4.99, "2026-10-24"), true);
  assert.equal(hasCompletePriceEvidence(null, 4.99, "2026-10-24"), false);
  assert.equal(hasCompletePriceEvidence("newworld", null, "2026-10-24"), false);
  assert.equal(hasCompletePriceEvidence("newworld", 0, "2026-10-24"), false);
  assert.equal(hasCompletePriceEvidence("newworld", 4.99, null), false);
});

test("trust ramp requires a seven-day-old account", () => {
  const now = new Date("2026-10-24T00:00:00.000Z");
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("2026-10-16T00:00:00.000Z", now), true);
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("2026-10-17T00:00:01.000Z", now), false);
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("not-a-date", now), false);
});
