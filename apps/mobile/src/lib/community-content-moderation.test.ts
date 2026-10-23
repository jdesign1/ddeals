import assert from "node:assert/strict";
import { test } from "node:test";
import { moderateCommunityNoteBody } from "./community-content-moderation.ts";

test("allows a normal price note", () => {
  assert.deepEqual(moderateCommunityNoteBody("Saw the 500g pack at the shelf price today."), {
    decision: "allow",
    labels: [],
    provider: "rules_v1",
  });
});
test("blocks contact details and links", () => {
  const result = moderateCommunityNoteBody("Email me at shopper@example.com or visit https://example.com");
  assert.equal(result.decision, "block");
  assert.deepEqual(result.labels, ["contact_details", "external_link"]);
});

test("blocks obvious abusive or threatening language", () => {
  const result = moderateCommunityNoteBody("I will hurt the staff");
  assert.equal(result.decision, "block");
  assert.deepEqual(result.labels, ["violent_threat"]);
});

test("holds accusations for human review", () => {
  const result = moderateCommunityNoteBody("This supermarket is a scam");
  assert.equal(result.decision, "review");
  assert.deepEqual(result.labels, ["accusation"]);
});
