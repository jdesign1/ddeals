import type { User } from "@dodgey-deals/shared";

type ProfileName = { full_name?: string | null } | null | undefined;

type UserMetadata = Pick<User, "user_metadata">;

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith("@privaterelay.appleid.com");
}

/** Returns the provider-supplied name without using an email prefix as a substitute. */
export function getAccountMetadataName(user: UserMetadata | null | undefined): string | null {
  const metadata = user?.user_metadata;
  if (!metadata || typeof metadata !== "object") return null;

  for (const key of ["full_name", "name", "given_name", "first_name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

export function getAccountDisplayName(user: Pick<User, "email" | "user_metadata">, profile?: ProfileName): string {
  const profileName = profile?.full_name?.trim();
  if (profileName) return profileName;

  const metadataName = getAccountMetadataName(user);
  if (metadataName) return metadataName;

  if (isApplePrivateRelayEmail(user.email)) return "Dodgy Deal shopper";
  return user.email?.split("@")[0] || "Dodgy Deal shopper";
}

export function getAccountEmailDisplay(email: string | null | undefined): string {
  if (!email || isApplePrivateRelayEmail(email)) return "-";
  return email;
}
