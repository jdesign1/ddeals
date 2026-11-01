import assert from "node:assert/strict";
import test from "node:test";
import { advanceDealDetectiveStreak, DEAL_DETECTIVE_STREAK_VERSION, type DealDetectiveStreakState } from "./deal-detective-streak.ts";

const empty: DealDetectiveStreakState = {
  version: DEAL_DETECTIVE_STREAK_VERSION,
  streak: 0,
  lastCaseKey: null,
  lastResult: null,
  completedCaseKeys: [],
};

test("starts a streak after the first win and increments successive wins", () => {
  const first = advanceDealDetectiveStreak(empty, "case-1", true);
  const second = advanceDealDetectiveStreak(first, "case-2", true);

  assert.equal(first.streak, 1);
  assert.equal(second.streak, 2);
  assert.equal(second.lastResult, "win");
});

test("a loss resets the streak and a later win starts a new one", () => {
  const first = advanceDealDetectiveStreak(empty, "case-1", true);
  const loss = advanceDealDetectiveStreak(first, "case-2", false);
  const nextWin = advanceDealDetectiveStreak(loss, "case-3", true);

  assert.equal(loss.streak, 0);
  assert.equal(nextWin.streak, 1);
});

test("does not count a completed case twice after another case", () => {
  const first = advanceDealDetectiveStreak(empty, "case-1", true);
  const second = advanceDealDetectiveStreak(first, "case-2", true);
  const repeated = advanceDealDetectiveStreak(second, "case-1", true);

  assert.deepEqual(repeated, second);
});
