import { createSign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";

interface ApnsResult {
  ok: boolean;
  status: number;
  reason?: string;
}

interface ApnsCredentials {
  key: string;
  keyId: string;
  teamId: string;
  topic: string;
}

let cachedProviderToken: { value: string; createdAt: number } | null = null;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function createProviderToken(credentials: ApnsCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedProviderToken && now - cachedProviderToken.createdAt < 45 * 60) {
    return cachedProviderToken.value;
  }

  const header = base64Url(JSON.stringify({ alg: "ES256", kid: credentials.keyId }));
  const claims = base64Url(JSON.stringify({ iss: credentials.teamId, iat: now }));
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign({ key: credentials.key, dsaEncoding: "ieee-p1363" });
  const value = `${unsignedToken}.${base64Url(signature)}`;
  cachedProviderToken = { value, createdAt: now };
  return value;
}

function sendRequest(
  session: ClientHttp2Session,
  token: string,
  credentials: ApnsCredentials,
  providerToken: string,
  payload: Record<string, unknown>
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let status = 0;
    let body = "";
    let finished = false;
    const finish = (result: ApnsResult) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };

    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(token)}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": credentials.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    const timeout = setTimeout(() => {
      request.close();
      finish({ ok: false, status: 0, reason: "RequestTimeout" });
    }, 12_000);

    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      clearTimeout(timeout);
      let reason: string | undefined;
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason;
      } catch {
        // Successful APNs responses have no body.
      }
      finish({ ok: status >= 200 && status < 300, status, reason });
    });
    request.on("error", () => {
      clearTimeout(timeout);
      finish({ ok: false, status, reason: "ConnectionError" });
    });
    request.end(JSON.stringify(payload));
  });
}

async function sendToHost(
  host: string,
  token: string,
  credentials: ApnsCredentials,
  providerToken: string,
  payload: Record<string, unknown>
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const session = connect(`https://${host}`);
    const timeout = setTimeout(() => {
      session.destroy();
      resolve({ ok: false, status: 0, reason: "ConnectionTimeout" });
    }, 15_000);
    session.once("error", () => {
      clearTimeout(timeout);
      resolve({ ok: false, status: 0, reason: "ConnectionError" });
    });
    session.once("connect", () => {
      void sendRequest(session, token, credentials, providerToken, payload).then((result) => {
        clearTimeout(timeout);
        session.close();
        resolve(result);
      });
    });
  });
}

export function isApnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_AUTH_KEY_P8?.trim() &&
    process.env.APNS_KEY_ID?.trim() &&
    process.env.APNS_TEAM_ID?.trim()
  );
}

export async function sendApnsAlert(
  deviceToken: string,
  payload: Record<string, unknown>
): Promise<ApnsResult> {
  const rawKey = process.env.APNS_AUTH_KEY_P8?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  if (!rawKey || !keyId || !teamId) {
    return { ok: false, status: 0, reason: "APNsNotConfigured" };
  }

  const credentials: ApnsCredentials = {
    key: rawKey.replaceAll("\\n", "\n"),
    keyId,
    teamId,
    topic: process.env.APNS_TOPIC?.trim() || "nz.dodgydeals.app",
  };
  const providerToken = createProviderToken(credentials);
  let result = await sendToHost("api.push.apple.com", deviceToken, credentials, providerToken, payload);
  // Development-signed builds use Apple's sandbox. A production endpoint
  // reports BadDeviceToken for those tokens, so try the sandbox once before
  // treating the device token as invalid.
  if (result.reason === "BadDeviceToken") {
    result = await sendToHost("api.sandbox.push.apple.com", deviceToken, credentials, providerToken, payload);
  }
  return result;
}
