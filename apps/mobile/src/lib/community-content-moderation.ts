export type CommunityContentDecision = "allow" | "review" | "block";

export interface CommunityContentModerationResult {
  decision: CommunityContentDecision;
  labels: string[];
  provider: "rules_v1";
}
const BLOCK_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "contact_details", pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i },
  { label: "contact_details", pattern: /(?:^|\s)\+?\d[\d\s().-]{7,}\d(?:\s|$)/ },
  { label: "contact_details", pattern: /\b\d{1,4}\s+[A-Za-z][\w-]{2,}\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|way|place|pl)\b/i },
  { label: "contact_details", pattern: /(?:^|\s)@[a-z0-9_.]{3,}/i },
  { label: "external_link", pattern: /\b(?:https?:\/\/|www\.)\S+/i },
  { label: "abusive_language", pattern: /\b(?:fuck(?:ing|ed|er)?|shit(?:ty)?|cunt|bitch|asshole|bastard)\b/i },
  { label: "explicit_content", pattern: /\b(?:porn(?:ography)?|nudes?|xxx|onlyfans|blowjob|handjob|dick|cock|pussy|slut|whore)\b/i },
  { label: "violent_threat", pattern: /\b(?:kill|hurt|attack|shoot|stab|bomb|burn)\s+(?:you|them|him|her|staff|someone|the\s+store)\b/i },
  { label: "violent_threat", pattern: /\b(?:i|we)\s+(?:will|shall|am\s+going\s+to|are\s+going\s+to)\s+(?:kill|hurt|attack|shoot|stab|bomb|burn)\b/i },
  { label: "self_harm", pattern: /\b(?:kill\s+myself|end\s+my\s+life|suicid(?:e|al))\b/i },
  { label: "repeated_content", pattern: /(\S+)(?:\s+\1){3,}/i },
  { label: "repeated_characters", pattern: /(.)\1{8,}/ },
];

const REVIEW_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "accusation", pattern: /\b(?:scam|fraud(?:ulent)?|thief|stole|stealing|criminal|illegal|lawsuit|sue|police|liar|fake)\b/i },
  { label: "discrimination", pattern: /\b(?:racist|sexist|homophob(?:ic|ia)|discriminat(?:e|ion)|hate\s+group)\b/i },
  { label: "promotion", pattern: /\b(?:buy\s+now|click\s+here|visit\s+my|promo(?:tion)?\s+code|affiliate|sponsored|dm\s+me)\b/i },
  { label: "excessive_punctuation", pattern: /[!?]{4,}/ },
];

function normalizeBody(body: string): string {
  return body
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function moderationMatchText(body: string): string {
  return body.toLowerCase().replace(/[013457]/g, (character) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[character] ?? character);
}

function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)];
}

export function moderateCommunityNoteBody(body: string | null): CommunityContentModerationResult {
  const normalized = body ? normalizeBody(body) : "";
  if (!normalized) return { decision: "allow", labels: [], provider: "rules_v1" };
  const matchText = moderationMatchText(normalized);

  const blockLabels = BLOCK_RULES.filter(({ pattern }) => pattern.test(normalized) || pattern.test(matchText)).map(({ label }) => label);
  if (blockLabels.length > 0) {
    return { decision: "block", labels: uniqueLabels(blockLabels), provider: "rules_v1" };
  }

  const reviewLabels = REVIEW_RULES.filter(({ pattern }) => pattern.test(normalized) || pattern.test(matchText)).map(({ label }) => label);
  if (normalized.length >= 24) {
    const letters = [...normalized].filter((character) => /[A-Za-z]/.test(character));
    const uppercaseLetters = letters.filter((character) => character === character.toUpperCase());
    if (letters.length >= 12 && uppercaseLetters.length / letters.length >= 0.8) reviewLabels.push("excessive_caps");
  }

  const labels = uniqueLabels(reviewLabels);
  return {
    decision: labels.length > 0 ? "review" : "allow",
    labels,
    provider: "rules_v1",
  };
}
