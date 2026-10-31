import { createHmac, timingSafeEqual } from "node:crypto";
import { buildCatalogueArtifact, normalizeStoreKey, type CatalogueArtifact, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";
import { getCommunityDetectiveRank } from "@/lib/community-reputation";
import { getAuthenticatedAccount, requireAccountsAdmin } from "@/lib/accounts-server";
import { supabaseConfig } from "@/lib/config";
import { DEAL_DETECTIVE_QUIZ_VERSION, type DealDetectiveQuestionKind } from "@/lib/deal-detective-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 12_000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type QuizSide = "left" | "right";
type QuizKind = "real" | "dodgy";

interface QuizChallenge {
  version: number;
  publicationKey: string;
  leftDealKey: string;
  rightDealKey: string;
  questionKind: DealDetectiveQuestionKind;
  correctSide: QuizSide;
  expiresAt: number;
}

let catalogueCache: { artifact: CatalogueArtifact; expiresAt: number } | null = null;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

function challengeSecret(): string {
  const secret = process.env.DEAL_DETECTIVE_CHALLENGE_SECRET || process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Deal Detective challenge signing is not configured");
  return secret;
}

function signChallenge(encodedPayload: string): string {
  return createHmac("sha256", challengeSecret()).update(encodedPayload).digest("base64url");
}

function createChallengeToken(challenge: QuizChallenge): string {
  const encodedPayload = Buffer.from(JSON.stringify(challenge), "utf8").toString("base64url");
  return `${encodedPayload}.${signChallenge(encodedPayload)}`;
}

function readChallengeToken(value: unknown): QuizChallenge | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return null;
  const encodedPayload = value.slice(0, separatorIndex);
  const suppliedSignature = Buffer.from(value.slice(separatorIndex + 1), "base64url");
  const expectedSignature = Buffer.from(signChallenge(encodedPayload), "base64url");
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<QuizChallenge>;
    if (
      parsed.version !== DEAL_DETECTIVE_QUIZ_VERSION
      || typeof parsed.publicationKey !== "string"
      || typeof parsed.leftDealKey !== "string"
      || typeof parsed.rightDealKey !== "string"
      || !isQuestionKind(parsed.questionKind)
      || !isQuizSide(parsed.correctSide)
      || typeof parsed.expiresAt !== "number"
      || parsed.expiresAt <= Date.now()
    ) return null;
    return {
      version: parsed.version,
      publicationKey: parsed.publicationKey,
      leftDealKey: parsed.leftDealKey,
      rightDealKey: parsed.rightDealKey,
      questionKind: parsed.questionKind,
      correctSide: parsed.correctSide,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function isQuizSide(value: unknown): value is QuizSide {
  return value === "left" || value === "right";
}

function isQuestionKind(value: unknown): value is DealDetectiveQuestionKind {
  return value === "real" || value === "dodgy";
}

function parseDealKey(value: unknown): { productId: string; storeKey: string } | null {
  if (typeof value !== "string" || value.length < 3 || value.length > 300) return null;
  const separatorIndex = value.lastIndexOf("::");
  if (separatorIndex <= 0 || separatorIndex >= value.length - 2) return null;
  return {
    productId: value.slice(0, separatorIndex),
    storeKey: value.slice(separatorIndex + 2),
  };
}

function dealKind(deal: CurrentDeal): QuizKind | null {
  if (deal.dealType === "Real Deal") return "real";
  if (deal.dealType === "Dodgy Deal") return "dodgy";
  return null;
}

function findCurrentDeal(artifact: CatalogueArtifact, dealKey: unknown): { product: ProductCard; deal: CurrentDeal; kind: QuizKind } | null {
  const parsed = parseDealKey(dealKey);
  if (!parsed) return null;
  const product = artifact.products.find((candidate) => candidate.id === parsed.productId);
  if (!product) return null;
  const deal = product.currentDeals.find((candidate) => (
    candidate.isOnSpecial && normalizeStoreKey(candidate.store) === parsed.storeKey
  ));
  const kind = deal ? dealKind(deal) : null;
  return deal && kind ? { product, deal, kind } : null;
}

async function getCurrentCatalogue(): Promise<CatalogueArtifact> {
  if (catalogueCache && catalogueCache.expiresAt > Date.now()) return catalogueCache.artifact;
  const artifact = await buildCatalogueArtifact(supabaseConfig);
  catalogueCache = { artifact, expiresAt: Date.now() + 60_000 };
  return artifact;
}

async function getCommunityTipStats(accounts: ReturnType<typeof requireAccountsAdmin>, userId: string) {
  const { data, error } = await accounts
    .from("community_price_notes")
    .select("helpful_count")
    .eq("author_id", userId)
    .eq("status", "approved")
    .not("published_at", "is", null);
  if (error) throw error;
  return {
    tipsShared: data?.length ?? 0,
    helpfulReceived: (data ?? []).reduce((total, note) => total + Math.max(0, Number(note.helpful_count ?? 0)), 0),
  };
}

function validateCurrentPair(artifact: CatalogueArtifact, leftDealKey: unknown, rightDealKey: unknown) {
  const left = findCurrentDeal(artifact, leftDealKey);
  const right = findCurrentDeal(artifact, rightDealKey);
  if (!left || !right || left.product.id === right.product.id || left.kind === right.kind) return null;
  return {
    left,
    right,
    correctSide: (left.kind === "real" ? "left" : "right") as QuizSide,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const leftDealKey = url.searchParams.get("leftDealKey");
  const rightDealKey = url.searchParams.get("rightDealKey");
  const questionKind = url.searchParams.get("questionKind");
  if (!parseDealKey(leftDealKey) || !parseDealKey(rightDealKey) || !isQuestionKind(questionKind)) {
    return jsonError("That case could not be opened.", 400);
  }

  try {
    const artifact = await getCurrentCatalogue();
    if (artifact.sourceUpdatedAt === null) return jsonError("The current case is not ready yet. Please try again.", 503);
    const pair = validateCurrentPair(artifact, leftDealKey, rightDealKey);
    if (!pair) return jsonError("That case has changed. Please try the next one.", 409);

    const challenge: QuizChallenge = {
      version: DEAL_DETECTIVE_QUIZ_VERSION,
      publicationKey: String(artifact.sourceUpdatedAt),
      leftDealKey: String(leftDealKey),
      rightDealKey: String(rightDealKey),
      questionKind,
      correctSide: (pair.left.kind === questionKind ? "left" : "right") as QuizSide,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    };
    return Response.json({ challenge_token: createChallengeToken(challenge) }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/challenge signing|not configured|catalogue/i.test(message)) return jsonError("The Deal Detective case is unavailable right now. Please try again later.", 503);
    console.error("Deal Detective challenge request failed.", message || "Unknown error");
    return jsonError("That case could not be opened. Please try again.", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonError("That case could not be scored.", 413);
  }

  const token = getBearerToken(request);
  if (!token) return jsonError("Sign in to save your Deal Detective score.", 401);

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonError("That case could not be scored.", 400);
  }

  const selectedSide = payload.selectedSide;
  const leftDealKey = payload.leftDealKey;
  const rightDealKey = payload.rightDealKey;
  const challengeToken = payload.challengeToken;
  if (!isQuizSide(selectedSide) || !parseDealKey(leftDealKey) || !parseDealKey(rightDealKey) || typeof challengeToken !== "string") {
    return jsonError("That case could not be scored.", 400);
  }

  try {
    const account = await getAuthenticatedAccount(token);
    if (!account || account.is_anonymous) return jsonError("Sign in to save your Deal Detective score.", 401);

    const challenge = readChallengeToken(challengeToken);
    if (!challenge || challenge.leftDealKey !== leftDealKey || challenge.rightDealKey !== rightDealKey) {
      return jsonError("That case has changed. Please try the next one.", 409);
    }

    const artifact = await getCurrentCatalogue();
    if (artifact.sourceUpdatedAt === null || String(artifact.sourceUpdatedAt) !== challenge.publicationKey) {
      return jsonError("That case has changed. Please try the next one.", 409);
    }
    const pair = validateCurrentPair(artifact, challenge.leftDealKey, challenge.rightDealKey);
    const expectedCorrectSide = pair && (pair.left.kind === challenge.questionKind ? "left" : "right");
    if (!pair || expectedCorrectSide !== challenge.correctSide) {
      return jsonError("That case has changed. Please try the next one.", 409);
    }
    const accounts = requireAccountsAdmin();
    const { data, error } = await accounts.rpc("record_deal_detective_quiz_attempt", {
      p_user_id: account.id,
      p_publication_key: String(artifact.sourceUpdatedAt),
      p_quiz_version: DEAL_DETECTIVE_QUIZ_VERSION,
      p_left_deal_key: challenge.leftDealKey,
      p_right_deal_key: challenge.rightDealKey,
      p_selected_side: selectedSide,
      p_correct_side: challenge.correctSide,
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.is_correct !== "boolean") throw new Error("Quiz result was not returned");

    const quizCorrect = Math.max(0, Number(result.quiz_correct ?? 0));
    const quizAttempts = Math.max(0, Number(result.quiz_attempts ?? 0));
    const communityStats = await getCommunityTipStats(accounts, account.id);
    const detectiveRank = getCommunityDetectiveRank(communityStats.tipsShared, communityStats.helpfulReceived, quizCorrect);

    return Response.json({
      ok: true,
      already_recorded: result.already_recorded === true,
      correct: result.is_correct,
      points_awarded: Math.max(0, Number(result.points_awarded ?? 0)),
      quiz_correct: quizCorrect,
      quiz_attempts: quizAttempts,
      detective_rank: detectiveRank.label,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/deal_detective_quiz_attempts|record_deal_detective_quiz_attempt|not configured|PGRST202|42P01/i.test(message)) {
      return jsonError("The Deal Detective case is unavailable right now. Please try again later.", 503);
    }
    console.error("Deal Detective quiz request failed.", message || "Unknown error");
    return jsonError("We couldn't save your Deal Detective score right now.", 503);
  }
}
