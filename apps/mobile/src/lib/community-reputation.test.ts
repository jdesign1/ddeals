import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityReputation } from "./community-reputation.ts";

test("community reputation ranks helpful contributors with a deterministic tie-break", () => {
  assert.deepEqual(
    buildCommunityReputation("author-b", [
      { authorId: "author-a", tipsShared: 3, helpfulReceived: 4 },
      { authorId: "author-b", tipsShared: 5, helpfulReceived: 4 },
      { authorId: "author-c", tipsShared: 2, helpfulReceived: 6 },
    ]),
    { tipsShared: 5, helpfulReceived: 4, rank: 2, contributorCount: 3 },
  );
});

test("community reputation does not rank an author without published tips", () => {
  assert.deepEqual(
    buildCommunityReputation("author-new", [
      { authorId: "author-a", tipsShared: 1, helpfulReceived: 0 },
      { authorId: "author-new", tipsShared: 0, helpfulReceived: 10 },
    ]),
    { tipsShared: 0, helpfulReceived: 0, rank: null, contributorCount: 1 },
  );
});
