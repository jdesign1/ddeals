import assert from "node:assert/strict";
import test from "node:test";
import { buildCommunityReputation, getCommunityDetectiveRank } from "./community-reputation.ts";

test("detective ranks use helpful votes as the primary signal with tips as experience", () => {
  assert.deepEqual(getCommunityDetectiveRank(0, 0), { key: "rookie", label: "Rookie Deal Detective", score: 0 });
  assert.deepEqual(getCommunityDetectiveRank(9, 0), { key: "tip-scout", label: "Tip Scout", score: 9 });
  assert.deepEqual(getCommunityDetectiveRank(10, 0), { key: "deal-sleuth", label: "Deal Sleuth", score: 10 });
  assert.deepEqual(getCommunityDetectiveRank(4, 7), { key: "price-investigator", label: "Price Investigator", score: 25 });
  assert.deepEqual(getCommunityDetectiveRank(5, 15), { key: "savings-detective", label: "Savings Detective", score: 50 });
  assert.deepEqual(getCommunityDetectiveRank(10, 30), { key: "master-deal-detective", label: "Master Deal Detective", score: 100 });
  assert.deepEqual(getCommunityDetectiveRank(9, 0, 1), { key: "deal-sleuth", label: "Deal Sleuth", score: 10 });
});

test("community reputation ranks helpful contributors with a deterministic tie-break", () => {
  assert.deepEqual(
    buildCommunityReputation("author-b", [
      { authorId: "author-a", tipsShared: 3, helpfulReceived: 4 },
      { authorId: "author-b", tipsShared: 5, helpfulReceived: 4 },
      { authorId: "author-c", tipsShared: 2, helpfulReceived: 6 },
    ]),
    { tipsShared: 5, helpfulReceived: 4, quizCorrect: 0, rank: 2, contributorCount: 3 },
  );
});

test("community reputation does not rank an author without published tips", () => {
  assert.deepEqual(
    buildCommunityReputation("author-new", [
      { authorId: "author-a", tipsShared: 1, helpfulReceived: 0 },
      { authorId: "author-new", tipsShared: 0, helpfulReceived: 10 },
    ]),
    { tipsShared: 0, helpfulReceived: 0, quizCorrect: 0, rank: null, contributorCount: 1 },
  );
});
