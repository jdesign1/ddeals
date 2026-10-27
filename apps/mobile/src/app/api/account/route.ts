import { createSupabaseClient, isEntitlementUsable, type EntitlementStatus } from "@dodgey-deals/shared";
import { accountsConfig } from "@/lib/accounts-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

interface AppleEntitlementRow {
  entitlement_key: string;
  provider: string;
  status: EntitlementStatus;
  expires_at: string | null;
}

/** Permanently deletes the authenticated user's account and cascaded data. */
export async function DELETE(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!accessToken) {
      return Response.json({ error: "Please sign in again to delete your account." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const body = await request.json().catch(() => null) as { acknowledgeAppleSubscription?: unknown } | null;
    const acknowledgeAppleSubscription = body?.acknowledgeAppleSubscription === true;

    const serviceRoleKey = process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey || !accountsConfig.anonKey) {
      return Response.json(
        { error: "Account deletion is temporarily unavailable. Please try again later." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const verifier = createSupabaseClient(accountsConfig.url, accountsConfig.anonKey);
    const { data: { user }, error: verificationError } = await verifier.auth.getUser(accessToken);
    if (verificationError || !user) {
      return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const admin = createSupabaseClient(accountsConfig.url, serviceRoleKey);
    const { data: entitlementRows, error: entitlementError } = await admin
      .from("subscription_entitlements")
      .select("entitlement_key,provider,status,expires_at")
      .eq("account_id", user.id)
      .eq("entitlement_key", "premium_access")
      .eq("provider", "apple_app_store");
    if (entitlementError) {
      console.error("Account deletion subscription check failed.", { code: entitlementError.code ?? "unknown" });
      return Response.json(
        { error: "We couldn't confirm your Apple subscription status. Please try again." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    const hasActiveAppleSubscription = ((entitlementRows ?? []) as AppleEntitlementRow[]).some((row) => isEntitlementUsable(row));
    if (hasActiveAppleSubscription && !acknowledgeAppleSubscription) {
      return Response.json(
        {
          code: "APPLE_SUBSCRIPTION_ACK_REQUIRED",
          error: "Your Apple subscription will not be cancelled automatically. Please acknowledge this before deleting your account.",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const { error: sessionRevocationError } = await admin.auth.admin.signOut(accessToken, "global");
    if (sessionRevocationError) {
      console.error("Account session revocation failed.", { code: sessionRevocationError.code ?? "unknown" });
      return Response.json(
        { error: "We couldn't securely sign out your other sessions. Please try again." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id);
    if (deletionError) {
      // Keep account identifiers and provider details out of application logs.
      console.error("Account deletion failed.", { code: deletionError.code ?? "unknown" });
      return Response.json(
        { error: "We couldn't delete your account just now. Please try again or contact support." },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const providers = user.app_metadata?.providers;
    const appleSignInUsed =
      user.app_metadata?.provider === "apple" ||
      (Array.isArray(providers) && providers.includes("apple")) ||
      Boolean(user.identities?.some((identity) => identity.provider === "apple"));

    return Response.json({ ok: true, appleSignInUsed, hasActiveAppleSubscription }, { headers: NO_STORE_HEADERS });
  } catch {
    console.error("Account deletion request could not be completed.");
    return Response.json(
      { error: "We couldn't delete your account just now. Please try again or contact support." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
