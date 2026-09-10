import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import type { SupabaseClient } from "@dodgey-deals/shared";
import { accountsConfig } from "./accounts-config";

const IOS_BUNDLE_ID = "nz.dodgydeals.app";
const supabaseOAuthCallback = `${accountsConfig.url.replace(/\/$/, "")}/auth/v1/callback`;

/** Native Apple sign-in is only used by the iOS Capacitor shell. */
export function isNativeAppleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function createRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashNonce(rawNonce: string): Promise<string> {
  const input = new TextEncoder().encode(rawNonce);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Uses Apple's native AuthenticationServices flow and exchanges the returned
 * identity token directly with Supabase. The private Apple OAuth secret is
 * never sent to the app; it remains a Supabase dashboard setting for web OAuth.
 */
export async function signInWithNativeApple(
  client: SupabaseClient
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signInWithIdToken"]>>> {
  const rawNonce = createRawNonce();
  const hashedNonce = await hashNonce(rawNonce);

  const result = await SignInWithApple.authorize({
    // The native plugin uses Apple's AuthenticationServices API, which binds
    // the request to the installed app's Bundle ID. These values are retained
    // in the options for the plugin's cross-platform type contract.
    clientId: IOS_BUNDLE_ID,
    redirectURI: supabaseOAuthCallback,
    scopes: "email name",
    nonce: hashedNonce,
  });

  const identityToken = result.response.identityToken?.trim();
  if (!identityToken) throw new Error("Apple did not return an identity token.");

  return client.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
    nonce: rawNonce,
  });
}
