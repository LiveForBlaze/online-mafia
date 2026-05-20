// Google OAuth helpers.
//
// We use the `arctic` library — it is small, well-typed, and avoids the rough edges of
// generic OAuth libraries. The flow is the standard authorization code with PKCE:
//
//  1. /api/v1/auth/google             generate state + code_verifier, redirect to Google
//  2. /api/v1/auth/google/callback    validate state, exchange code, fetch user info,
//                                     find-or-create local user, set session cookie

import { Google, generateState, generateCodeVerifier } from 'arctic';

import { env } from '../../config/env.js';

// OpenID Connect scopes needed to obtain a user's email, profile picture, and stable subject ID.
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

// User info endpoint returns these fields. Documented at:
// https://developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo
export interface GoogleUserInfo {
  sub: string; // stable, unique Google user ID — primary key for linking accounts
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI,
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

  return (await response.json()) as GoogleUserInfo;
}

export { generateState, generateCodeVerifier };
