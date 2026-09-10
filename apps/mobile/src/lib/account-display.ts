import type { User } from "@dodgey-deals/shared";

type ProfileName = { full_name?: string | null } | null | undefined;

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith("@privaterelay.appleid.com");
}

export function getAccountDisplayName(user: Pick<User, "email" | "user_metadata">, profile?: ProfileName): string {
  const profileName = profile?.full_name?.trim();
  if (profileName) return profileName;

  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();

  if (isApplePrivateRelayEmail(user.email)) return "Dodgy Deal shopper";
  return user.email?.split("@")[0] || "Dodgy Deal shopper";
}

export function getAccountEmailDisplay(email: string | null | undefined): string {
  if (!email || isApplePrivateRelayEmail(email)) return "-";
  return email;
}
