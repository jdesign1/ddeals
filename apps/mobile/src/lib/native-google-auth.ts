import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import type { SupabaseClient } from "@dodgey-deals/shared";

const IOS_GOOGLE_CLIENT_ID =
  "334485442344-akium166aleun9pvg7qbsql20l9nsjtd.apps.googleusercontent.com";

let initializationPromise: Promise<void> | null = null;

/** Native Google sign-in is used only by the iOS Capacitor shell. */
export function isNativeGoogleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

async function initializeNativeGoogleSignIn(): Promise<void> {
  if (!isNativeGoogleSignInAvailable()) {
    throw new Error("Native Google sign-in is only available in the iOS app.");
  }

  if (!initializationPromise) {
    initializationPromise = SocialLogin.initialize({
      google: {
        iOSClientId: IOS_GOOGLE_CLIENT_ID,
        mode: "online",
      },
    }).catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

/**
 * Uses Google's native iOS account picker, then exchanges the returned ID
 * token directly with Supabase. No Google client secret is shipped in the app.
 */
export async function signInWithNativeGoogle(
  client: SupabaseClient
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signInWithIdToken"]>>> {
  await initializeNativeGoogleSignIn();

  const result = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"] },
  });

  if (result.result.responseType !== "online") {
    throw new Error("Google did not return an online sign-in result.");
  }

  const identityToken = result.result.idToken?.trim();
  if (!identityToken) throw new Error("Google did not return an identity token.");

  const accessToken = result.result.accessToken?.token?.trim();
  if (!accessToken) throw new Error("Google did not return an access token.");

  const authResult = await client.auth.signInWithIdToken({
    provider: "google",
    token: identityToken,
    access_token: accessToken,
  });

  if (authResult.error) {
    console.error("[native-google-auth] Supabase token exchange failed:", authResult.error.message);
  }

  return authResult;
}
