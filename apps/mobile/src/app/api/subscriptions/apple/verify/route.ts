import { accountsConfig } from "@/lib/accounts-config";
import {
  AppleSubscriptionConfigurationError,
  createAppleSignedDataVerifier,
  entitlementStatusForTransaction,
  getAuthenticatedAccountId,
  getEntitlementKeys,
  getAppleSubscriptionConfig,
  isValidJws,
  recordAppleEvent,
  requireAccountsAdmin,
  safeTransactionPayload,
  upsertAppleEntitlements,
} from "@/lib/apple-subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!accessToken) return Response.json({ error: "Sign in before syncing a subscription." }, { status: 401, headers: NO_STORE_HEADERS });
    if (!accountsConfig.anonKey) return Response.json({ error: "Account subscriptions are not configured." }, { status: 503, headers: NO_STORE_HEADERS });

    const body = await request.json().catch(() => null) as { signedTransaction?: unknown } | null;
    if (!body || !isValidJws(body.signedTransaction)) {
      return Response.json({ error: "A valid signed Apple transaction is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const accountId = await getAuthenticatedAccountId(accessToken);
    if (!accountId) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401, headers: NO_STORE_HEADERS });

    const config = getAppleSubscriptionConfig();
    const verifier = createAppleSignedDataVerifier(config);
    let transaction;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(body.signedTransaction);
    } catch (verificationError) {
      console.error("Apple transaction signature verification failed.", verificationError instanceof Error ? verificationError.message : "Unknown error");
      return Response.json({ error: "We could not verify this Apple purchase." }, { status: 422, headers: NO_STORE_HEADERS });
    }
    if (!transaction.productId) {
      return Response.json({ code: "APPLE_PRODUCT_MISSING", error: "This Apple purchase does not contain a supported product." }, { status: 422, headers: NO_STORE_HEADERS });
    }
    if (!transaction.appAccountToken) {
      return Response.json(
        { code: "APPLE_PURCHASE_UNLINKED", error: "This Apple purchase is not linked to a Dodgy Deal account." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    if (transaction.appAccountToken !== accountId) {
      return Response.json(
        { code: "APPLE_PURCHASE_LINKED_TO_OTHER_ACCOUNT", error: "This Apple purchase is linked to another Dodgy Deal account." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const entitlementKeys = getEntitlementKeys(config, transaction.productId);
    const status = entitlementStatusForTransaction(transaction);
    try {
      const accounts = requireAccountsAdmin();
      await upsertAppleEntitlements({ accounts, accountId, transaction, entitlementKeys, status });
      await recordAppleEvent({
        accounts,
        eventId: `device:${config.environment}:${transaction.transactionId}`,
        eventType: "DEVICE_TRANSACTION_VERIFIED",
        transaction,
        payload: safeTransactionPayload(transaction),
        processedAt: new Date().toISOString(),
      });
    } catch (persistenceError) {
      // Apple has already accepted the payment at this point. A 503 tells the
      // native client to retry the same unfinished transaction instead of
      // presenting a misleading generic purchase failure or asking the user
      // to buy the subscription again.
      console.error("Apple entitlement persistence failed.", persistenceError instanceof Error ? persistenceError.message : "Unknown error");
      return Response.json(
        { error: "Your payment was received, but your subscription is still being activated. Please try again in a moment." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    return Response.json({ ok: true, entitlementKeys, status, productId: transaction.productId }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AppleSubscriptionConfigurationError) {
      console.error("Apple subscription configuration is incomplete.", { message: error.message });
      return Response.json({ error: "Apple subscriptions are not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
    }
    console.error("Apple transaction verification failed.");
    return Response.json({ error: "We could not verify this Apple purchase." }, { status: 422, headers: NO_STORE_HEADERS });
  }
}
