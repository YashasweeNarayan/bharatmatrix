import type { NextRequest } from "next/server";

export const GOOGLE_STATE_COOKIE = "bm_oauth";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Base URL used for the OAuth redirect URI. Set APP_URL in production so it
 *  can't be influenced by request headers. */
export function appOrigin(req: NextRequest): string {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export function redirectUri(req: NextRequest): string {
  return `${appOrigin(req)}/api/auth/google/callback`;
}

export function googleAuthUrl(req: NextRequest, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type GoogleIdentity = {
  email: string;
  name: string | null;
  picture: string | null;
};

/**
 * Exchanges the authorization code and returns the verified identity.
 * The id_token arrives directly from Google's token endpoint over TLS in
 * response to our client secret, so (per OpenID Connect Core §3.1.3.7) its
 * signature need not be re-checked; we still validate issuer, audience,
 * expiry and email_verified.
 */
export async function exchangeCode(
  req: NextRequest,
  code: string,
): Promise<GoogleIdentity | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!json?.id_token) return null;
  return identityFromIdToken(json.id_token, process.env.GOOGLE_CLIENT_ID ?? "");
}

export function identityFromIdToken(
  idToken: string,
  clientId: string,
  nowSec = Math.floor(Date.now() / 1000),
): GoogleIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const issOk =
    c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
  const audOk = c.aud === clientId;
  const expOk = typeof c.exp === "number" && c.exp > nowSec;
  const verified = c.email_verified === true || c.email_verified === "true";
  if (!issOk || !audOk || !expOk || !verified || typeof c.email !== "string") {
    return null;
  }
  return {
    email: c.email.toLowerCase(),
    name: typeof c.name === "string" ? c.name : null,
    picture: typeof c.picture === "string" ? c.picture : null,
  };
}
