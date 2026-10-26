export const PUBLIC_PROFILE_FIELD_LIMITS = {
  city: 60,
  favorite_store_branch: 80,
  profile_quote: 160,
} as const;

export const PUBLIC_PROFILE_QUOTE_CONTACT_ERROR = "Quotes cannot include links or contact details.";

export function cleanPublicProfileField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
  return cleaned || null;
}

export function normalizePublicProfileDraft(value: string, maxLength: number): string {
  return cleanPublicProfileField(value, maxLength) ?? "";
}

export function containsPublicProfileContactDetails(value: string): boolean {
  return /(?:https?:\/\/|www\.|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(value)
    || /(?:\+?\d[\d\s().-]{7,}\d)/.test(value);
}
