// Google OAuth helpers.
//
// We use the `arctic` library — it is small, well-typed, and avoids the rough edges of
// generic OAuth libraries. The flow is the standard authorization code with PKCE:
//
//  1. /api/v1/auth/google             generate state + code_verifier, redirect to Google
//  2. /api/v1/auth/google/callback    validate state, exchange code, fetch user info,
//                                     find-or-create local user, set session cookie

import { Google, generateState, generateCodeVerifier } from 'arctic';
import { z } from 'zod';

import { env } from '../../config/env.js';

// OpenID Connect scopes needed to obtain a user's email, profile picture, and stable subject ID.
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

// Strict shape of the userinfo response. We parse this — never blindly trust
// `(json as GoogleUserInfo)` — because `if (!profile.email_verified)` would
// treat the string `"false"` as truthy, silently accepting an unverified
// email. Google sends a real boolean today; this is defence-in-depth.
const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
  locale: z.string().optional(),
});
export type GoogleUserInfo = z.infer<typeof googleUserInfoSchema>;

const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export function createGoogleClient(): Google {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new Error(
      'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI in your environment.',
    );
  }
  return new Google(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed with status ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  const parsed = googleUserInfoSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Google userinfo response did not match expected shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export { generateState, generateCodeVerifier };
