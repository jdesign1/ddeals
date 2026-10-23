import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.equal(shouldAutoApproveCommunityNote("active", "allow", true), true);
  assert.equal(shouldAutoApproveCommunityNote("active", "allow", false), false);
  assert.equal(shouldAutoApproveCommunityNote("shadow", "allow", true), false);
  assert.equal(shouldAutoApproveCommunityNote("active", "review", true), false);
  assert.equal(shouldAutoApproveCommunityNote("active", "block", true), false);
});

test("trust ramp requires a seven-day-old account", () => {
  const now = new Date("2026-10-24T00:00:00.000Z");
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("2026-10-16T00:00:00.000Z", now), true);
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("2026-10-17T00:00:01.000Z", now), false);
  assert.equal(isAccountOldEnoughForCommunityAutoApproval("not-a-date", now), false);
});
