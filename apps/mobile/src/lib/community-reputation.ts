export interface CommunityAuthorContribution {
  authorId: string;
  tipsShared: number;
  helpfulReceived: number;
}

export interface CommunityReputation {
  tipsShared: number;
  helpfulReceived: number;
  rank: number | null;
  contributorCount: number;
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
    }))
    .filter((contribution) => contribution.tipsShared > 0);

  normalized.sort((left, right) => {
    if (right.helpfulReceived !== left.helpfulReceived) return right.helpfulReceived - left.helpfulReceived;
    if (right.tipsShared !== left.tipsShared) return right.tipsShared - left.tipsShared;
    return left.authorId < right.authorId ? -1 : left.authorId > right.authorId ? 1 : 0;
  });

  const current = normalized.find((contribution) => contribution.authorId === authorId);
  if (!current) {
    return { tipsShared: 0, helpfulReceived: 0, rank: null, contributorCount: normalized.length };
  }

  const currentIndex = normalized.indexOf(current);
  return {
    tipsShared: current.tipsShared,
    helpfulReceived: current.helpfulReceived,
    rank: currentIndex + 1,
    contributorCount: normalized.length,
  };
}
