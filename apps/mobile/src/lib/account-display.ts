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

type UserSignInInfo = Pick<User, "app_metadata" | "identities">;

function providerLabel(provider: string): string {
  if (provider === "apple") return "Apple";
  if (provider === "google") return "Google";
  if (provider === "email") return "Email";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Returns a user-facing summary of the sign-in methods on an account. */
export function getAccountSignInMethodDisplay(user: UserSignInInfo | null | undefined): string {
  const providers = new Set<string>();
  const primaryProvider = user?.app_metadata?.provider;
  if (typeof primaryProvider === "string" && primaryProvider) providers.add(primaryProvider);

  const metadataProviders = user?.app_metadata?.providers;
  if (Array.isArray(metadataProviders)) {
    for (const provider of metadataProviders) {
      if (typeof provider === "string" && provider) providers.add(provider);
    }
  }

  for (const identity of user?.identities ?? []) {
    if (identity.provider) providers.add(identity.provider);
  }

  const orderedProviders = ["apple", "google", "email"];
  const knownProviders = orderedProviders.filter((provider) => providers.has(provider));
  const otherProviders = [...providers].filter((provider) => !orderedProviders.includes(provider)).sort();
  const labels = [...knownProviders, ...otherProviders].map(providerLabel);

  if (labels.length === 0) return "Sign-in method unavailable";
  if (labels.length === 1) return `${labels[0]} sign-in`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} sign-in`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} sign-in`;
}
