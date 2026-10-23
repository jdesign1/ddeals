export type CommunityAutoApprovalMode = "off" | "shadow" | "active";

export const COMMUNITY_AUTO_APPROVAL_RULES_VERSION = "rules_v1";
export const COMMUNITY_AUTO_APPROVAL_MIN_ACCOUNT_AGE_DAYS = 7;

export function parseCommunityAutoApprovalMode(value: string | undefined): CommunityAutoApprovalMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "off" || normalized === "active") return normalized;
  return "shadow";
}

export function isAccountOldEnoughForCommunityAutoApproval(
  createdAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!createdAt) return false;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const ageMs = now.getTime() - createdAtMs;
  return ageMs >= COMMUNITY_AUTO_APPROVAL_MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export function shouldAutoApproveCommunityNote(
  mode: CommunityAutoApprovalMode,
  decision: "allow" | "review" | "block",
  trustedAccount: boolean,
): boolean {
  return mode === "active" && decision === "allow" && trustedAccount;
}
