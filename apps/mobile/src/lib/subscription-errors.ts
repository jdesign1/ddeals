export function subscriptionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code ?? "")
    : "";
  if (/DodgySubscriptions|not implemented on ios|UNIMPLEMENTED/i.test(message)) {
    return "Subscriptions need the latest version of the app. Please update and try again.";
  }
  if (/PRODUCT_NOT_FOUND|PRODUCTS_UNAVAILABLE/i.test(message)) {
    return "Subscription options are temporarily unavailable. Please try again later.";
  }
  if (/USER_CANCELLED|cancelled/i.test(message)) {
    return "Purchase cancelled.";
  }
  if (code === "APPLE_PURCHASE_UNLINKED" || /not linked to a Dodgy Deal account/i.test(message)) {
    return "This Apple subscription is not linked to a Dodgy Deal account yet. Please contact support so we can help recover access.";
  }
  if (code === "APPLE_PURCHASE_LINKED_TO_OTHER_ACCOUNT" || /not linked to the signed-in account|linked to another Dodgy Deal account/i.test(message)) {
    return "This Apple subscription is linked to another Dodgy Deal account. Sign in with that account, or contact support if you need help recovering it.";
  }
  if (/No active Apple subscription|no subscription was found/i.test(message)) {
    return "We couldn't find an active Apple subscription for this Apple account.";
  }
  if (/SUBSCRIPTION_SYNC_PENDING|still being activated|payment was received/i.test(message)) {
    return "Your payment was received. We're still activating your subscription — please wait a moment and try again.";
  }
  if (/\bPENDING\b/i.test(message)) {
    return "Your purchase is waiting for approval.";
  }
  return "We couldn't update your subscription. Please try again.";
}
