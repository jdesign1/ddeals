export type CommunityAutoApprovalMode = "off" | "shadow" | "active";

export const COMMUNITY_AUTO_APPROVAL_RULES_VERSION = "rules_v1";
export const COMMUNITY_AUTO_APPROVAL_MIN_ACCOUNT_AGE_DAYS = 7;

export interface CommunityAutoApprovalInput {
  mode: CommunityAutoApprovalMode;
  decision: "allow" | "review" | "block";
  trustedAccount: boolean;
  hasCompletePriceEvidence: boolean;
}

export function hasCompletePriceEvidence(
  sourceStoreId: string | null | undefined,
  price: number | null | undefined,
  observedOn: string | null | undefined,
): boolean {
  return Boolean(
    sourceStoreId?.trim()
    && Number.isFinite(price)
    && (price ?? 0) > 0
    && observedOn?.trim(),
  );
}

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
  input: CommunityAutoApprovalInput,
): boolean {
  return input.mode === "active"
    && input.decision === "allow"
    && input.trustedAccount
    && input.hasCompletePriceEvidence;
}
