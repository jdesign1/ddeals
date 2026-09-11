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

  try {
    await initializationPromise;
  } catch (error) {
    console.error(
      "[native-google-auth] Google native initialisation failed:",
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

/**
 * Uses Google's native iOS account picker, then exchanges the returned ID
 * token directly with Supabase. No Google client secret is shipped in the app.
 */
export async function signInWithNativeGoogle(
  client: SupabaseClient
): Promise<Awaited<ReturnType<SupabaseClient["auth"]["signInWithIdToken"]>>> {
  await initializeNativeGoogleSignIn();

  // The native plugin can restore a previously authorised Google user. Refresh
  // that native token first so a repeat login cannot submit an expired token.
  try {
    await SocialLogin.refresh({
      provider: "google",
      options: { scopes: ["email", "profile"] },
    });
  } catch {
    // There may not be a cached native user on the first login. The login call
    // below will perform the interactive flow in that case.
  }

  let result;
  try {
    result = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"] },
    });
  } catch (error) {
    console.error(
      "[native-google-auth] Native Google login failed:",
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  if (result.result.responseType !== "online") {
    console.error("[native-google-auth] Google returned an offline result.");
    throw new Error("Google did not return an online sign-in result.");
  }

  const identityToken = result.result.idToken?.trim();
  const accessToken = result.result.accessToken?.token?.trim();
  console.info("[native-google-auth] Google tokens received", {
    hasIdentityToken: Boolean(identityToken),
    hasAccessToken: Boolean(accessToken),
  });
  if (!identityToken) throw new Error("Google did not return an identity token.");

  const authResult = await client.auth.signInWithIdToken({
    provider: "google",
    token: identityToken,
    ...(accessToken ? { access_token: accessToken } : {}),
  });

  if (authResult.error) {
    console.error("[native-google-auth] Supabase token exchange failed:", authResult.error.message);
  }

  return authResult;
}
