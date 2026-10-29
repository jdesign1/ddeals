export interface CommunityAuthorContribution {
  authorId: string;
  tipsShared: number;
  helpfulReceived: number;
  quizCorrect?: number;
}

export interface CommunityReputation {
  tipsShared: number;
  helpfulReceived: number;
  quizCorrect: number;
  rank: number | null;
  contributorCount: number;
}

export const COMMUNITY_DETECTIVE_RANKS = [
  { key: "rookie", label: "Rookie Deal Detective", minimumScore: 0 },
  { key: "tip-scout", label: "Tip Scout", minimumScore: 1 },
  { key: "deal-sleuth", label: "Deal Sleuth", minimumScore: 10 },
  { key: "price-investigator", label: "Price Investigator", minimumScore: 25 },
  { key: "savings-detective", label: "Savings Detective", minimumScore: 50 },
  { key: "master-deal-detective", label: "Master Deal Detective", minimumScore: 100 },
] as const;

export interface CommunityDetectiveRank {
  key: (typeof COMMUNITY_DETECTIVE_RANKS)[number]["key"];
  label: (typeof COMMUNITY_DETECTIVE_RANKS)[number]["label"];
  score: number;
}

/**
 * Helpful votes are the strongest quality signal; published tips and verified
 * Deal Detective cases add smaller experience signals. Quiz answers are kept
 * separate from tip counts, but still contribute to the same rank ladder.
 */
export function getCommunityDetectiveRank(tipsShared: number, helpfulReceived: number, quizCorrect = 0): CommunityDetectiveRank {
  const normalizedTips = Math.max(0, Math.trunc(tipsShared));
  const normalizedHelpful = Math.max(0, Math.trunc(helpfulReceived));
  const normalizedQuizCorrect = Math.max(0, Math.trunc(quizCorrect));
  const score = normalizedHelpful * 3 + normalizedTips + normalizedQuizCorrect;
  const rank = COMMUNITY_DETECTIVE_RANKS.reduce(
    (current, candidate) => candidate.minimumScore <= score ? candidate : current,
    COMMUNITY_DETECTIVE_RANKS[0],
  );
  return { key: rank.key, label: rank.label, score };
}

/**
 * Rank community contributors by helpful votes received. Published tip count
 * breaks ties so a contributor with the same helpful total but more useful
 * published history ranks first; the author id keeps the result deterministic.
 */
export function buildCommunityReputation(
  authorId: string,
  contributions: CommunityAuthorContribution[],
): CommunityReputation {
  const normalized = contributions
    .map((contribution) => ({
      authorId: contribution.authorId,
      tipsShared: Math.max(0, Math.trunc(contribution.tipsShared)),
      helpfulReceived: Math.max(0, Math.trunc(contribution.helpfulReceived)),
      quizCorrect: Math.max(0, Math.trunc(contribution.quizCorrect ?? 0)),
    }))
    .filter((contribution) => contribution.tipsShared > 0);

  normalized.sort((left, right) => {
    if (right.helpfulReceived !== left.helpfulReceived) return right.helpfulReceived - left.helpfulReceived;
    if (right.tipsShared !== left.tipsShared) return right.tipsShared - left.tipsShared;
    return left.authorId < right.authorId ? -1 : left.authorId > right.authorId ? 1 : 0;
  });

  const current = normalized.find((contribution) => contribution.authorId === authorId);
  if (!current) {
    return { tipsShared: 0, helpfulReceived: 0, quizCorrect: 0, rank: null, contributorCount: normalized.length };
  }

  const currentIndex = normalized.indexOf(current);
  return {
    tipsShared: current.tipsShared,
    helpfulReceived: current.helpfulReceived,
    quizCorrect: current.quizCorrect,
    rank: currentIndex + 1,
    contributorCount: normalized.length,
  };
}
