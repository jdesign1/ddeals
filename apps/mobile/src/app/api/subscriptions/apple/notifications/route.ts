import {
  AppleSubscriptionConfigurationError,
  createAppleSignedDataVerifier,
  entitlementStatusForTransaction,
  getAppleSubscriptionConfig,
  getEntitlementKeys,
  isValidJws,
  isUuid,
  recordAppleEvent,
  requireAccountsAdmin,
  safeNotificationPayload,
  safeTransactionPayload,
  upsertAppleEntitlements,
} from "@/lib/apple-subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { signedPayload?: unknown } | null;
    if (!body || !isValidJws(body.signedPayload)) {
      return Response.json({ error: "A valid signed Apple notification is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const config = getAppleSubscriptionConfig();
    const verifier = createAppleSignedDataVerifier(config);
    const notification = await verifier.verifyAndDecodeNotification(body.signedPayload);
    const eventId = notification.notificationUUID;
    if (!eventId) return Response.json({ error: "Apple notification ID is missing." }, { status: 400, headers: NO_STORE_HEADERS });

    const accounts = requireAccountsAdmin();
    const transactionJws = notification.data?.signedTransactionInfo;
    const transaction = transactionJws && isValidJws(transactionJws)
      ? await verifier.verifyAndDecodeTransaction(transactionJws)
      : null;
    const notificationPayload = safeNotificationPayload(notification);

    if (!transaction) {
      await recordAppleEvent({
        accounts,
        eventId: `notification:${eventId}`,
        eventType: String(notification.notificationType ?? "UNKNOWN"),
        transaction: null,
        payload: notificationPayload,
        processedAt: new Date().toISOString(),
      });
      return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    if (!transaction.productId) throw new AppleSubscriptionConfigurationError("Apple notification has no product ID");
    const entitlementKeys = getEntitlementKeys(config, transaction.productId);
    const notificationType = String(notification.notificationType ?? "");
    const subtype = notification.subtype ? String(notification.subtype) : undefined;
    const accountId = transaction.appAccountToken;
    if (!isUuid(accountId)) {
      await recordAppleEvent({
        accounts,
        eventId: `notification:${eventId}`,
        eventType: notificationType || "UNKNOWN",
        transaction,
        payload: { ...notificationPayload, transaction: safeTransactionPayload(transaction) },
        processedAt: new Date().toISOString(),
        processingError: "Transaction has no valid app account token; no entitlement was changed.",
      });
      return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
    }

    const status = entitlementStatusForTransaction(transaction, notificationType, subtype);
    await upsertAppleEntitlements({ accounts, accountId, transaction, entitlementKeys, status });
    await recordAppleEvent({
      accounts,
      eventId: `notification:${eventId}`,
      eventType: notificationType || "UNKNOWN",
      transaction,
      payload: { ...notificationPayload, transaction: safeTransactionPayload(transaction) },
      processedAt: new Date().toISOString(),
    });

    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AppleSubscriptionConfigurationError) {
      console.error("Apple notification configuration is incomplete.", { message: error.message });
      return Response.json({ error: "Apple subscriptions are not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
    }
    console.error("Apple server notification could not be processed.");
    return Response.json({ error: "Apple notification processing failed." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
