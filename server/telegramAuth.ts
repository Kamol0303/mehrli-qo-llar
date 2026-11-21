/**
 * Telegram OpenID Connect (OIDC) Authentication & ID Token Verifier
 *
 * Uses Node.js built-in `node:crypto` to verify JWT signatures against Telegram's
 * official JWKS (`https://oauth.telegram.org/.well-known/jwks.json`) with strict
 * `iss`, `aud`, `exp`, and single-use `nonce` validation.
 */

import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { normalizePhone } from './db';

export const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org';
export const TELEGRAM_AUTH_URL = 'https://oauth.telegram.org/auth';
export const TELEGRAM_TOKEN_URL = 'https://oauth.telegram.org/token';
export const TELEGRAM_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';

export interface TelegramVerifiedUser {
  telegramId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  phoneNumber: string | null;
  nonce: string | null;
}

interface JwkEntry extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

let jwksCache: { keys: JwkEntry[]; fetchedAt: number } | null = null;
let testJwksOverride: JwkEntry[] | null = null;
const JWKS_CACHE_TTL_MS = 15 * 60_000;

/** Test-only hook for automated integration tests (never exposed to HTTP). */
export function setTelegramJwksForTest(keys: JwkEntry[] | null) {
  testJwksOverride = keys;
  jwksCache = null;
}

export function getTelegramConfig() {
  const clientId = String(process.env.TELEGRAM_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TELEGRAM_CLIENT_SECRET || '').trim();
  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  return {
    clientId,
    clientSecret,
    botUsername,
    enabled: Boolean(clientId && clientSecret),
    widgetOnlyEnabled: Boolean(clientId),
  };
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildTelegramAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const url = new URL(TELEGRAM_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope || 'openid profile phone');
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeTelegramCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
  clientId: string;
  clientSecret: string;
}): Promise<{ id_token: string; access_token?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });
  if (params.codeVerifier) {
    body.set('code_verifier', params.codeVerifier);
  }

  const basicAuth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64');
  const res = await fetch(TELEGRAM_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.id_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Telegram token almashishda xatolik: ${reason}`);
  }

  return { id_token: data.id_token, access_token: data.access_token };
}

async function fetchTelegramJwks(forceRefresh = false): Promise<JwkEntry[]> {
  if (testJwksOverride) {
    return testJwksOverride;
  }
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(TELEGRAM_JWKS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Telegram JWKS yuklab bo‘lmadi (${res.status})`);
  }
  const json = (await res.json()) as { keys?: JwkEntry[] };
  const keys = Array.isArray(json.keys) ? json.keys : [];
  if (keys.length === 0) {
    throw new Error('Telegram JWKS bo‘sh qaytdi');
  }
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const jsonStr = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(jsonStr) as T;
}

function verifyJwtSignatureWithJwk(
  signingInput: string,
  signatureB64Url: string,
  alg: string,
  jwk: JwkEntry,
): boolean {
  const pubKey = createPublicKey({ key: jwk, format: 'jwk' });
  const sigBuf = Buffer.from(signatureB64Url, 'base64url');
  const dataBuf = Buffer.from(signingInput, 'utf8');

  if (alg === 'RS256') {
    return cryptoVerify('RSA-SHA256', dataBuf, pubKey, sigBuf);
  }
  if (alg === 'RS384') {
    return cryptoVerify('RSA-SHA384', dataBuf, pubKey, sigBuf);
  }
  if (alg === 'RS512') {
    return cryptoVerify('RSA-SHA512', dataBuf, pubKey, sigBuf);
  }
  if (alg === 'ES256') {
    return cryptoVerify('sha256', dataBuf, { key: pubKey, dsaEncoding: 'ieee-p1363' }, sigBuf);
  }
  if (alg === 'EdDSA') {
    return cryptoVerify(null, dataBuf, pubKey, sigBuf);
  }
  return false;
}

export async function verifyTelegramIdToken(
  idToken: string,
  options: {
    expectedClientId: string;
    expectedNonce: string;
    requireNonceClaim?: boolean;
    jwksOverride?: JwkEntry[];
  },
): Promise<TelegramVerifiedUser> {
  const parts = String(idToken || '').trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Telegram id_token formati noto‘g‘ri');
  }

  const [headerPart, payloadPart, sigPart] = parts;
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = decodeBase64UrlJson(headerPart);
    payload = decodeBase64UrlJson(payloadPart);
  } catch {
    throw new Error('Telegram id_token dekodlanmadi');
  }

  const alg = String(header.alg || '');
  if (!['RS256', 'RS384', 'RS512', 'ES256', 'EdDSA'].includes(alg)) {
    throw new Error(`Qo‘llab-quvvatlanmaydigan imzo algoritmi: ${alg || 'noma’lum'}`);
  }

  // Locate matching JWK (with one cache-bust retry if key rotated)
  let keys = options.jwksOverride ?? (await fetchTelegramJwks(false));
  let matchingKey = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  if (!matchingKey && !options.jwksOverride) {
    keys = await fetchTelegramJwks(true);
    matchingKey = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  }
  if (!matchingKey) {
    throw new Error('Telegram JWKS kaliti topilmadi');
  }

  const signingInput = `${headerPart}.${payloadPart}`;
  const sigValid = verifyJwtSignatureWithJwk(signingInput, sigPart, alg, matchingKey);
  if (!sigValid) {
    throw new Error('Telegram id_token imzosi tasdiqlanmadi');
  }

  // Validate issuer
  const iss = String(payload.iss || '').replace(/\/+$/, '');
  if (iss !== TELEGRAM_OIDC_ISSUER) {
    throw new Error('Telegram id_token manbasi (iss) noto‘g‘ri');
  }

  // Validate audience === Telegram Bot client_id
  const aud = payload.aud;
  const audMatches = Array.isArray(aud)
    ? aud.map(String).includes(String(options.expectedClientId))
    : String(aud || '') === String(options.expectedClientId);
  if (!audMatches) {
    throw new Error('Telegram id_token auditoriyasi (aud) mos kelmadi');
  }

  // Validate expiration (allow 30s clock skew)
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  if (!exp || exp + 30 < nowSec) {
    throw new Error('Telegram id_token muddati tugagan');
  }

  // Validate single-use nonce (always verified if claim is present; required in direct id_token flow)
  const requireNonceClaim = options.requireNonceClaim !== false;
  const tokenNonce = payload.nonce == null ? '' : String(payload.nonce);
  if (tokenNonce) {
    if (!options.expectedNonce || tokenNonce !== options.expectedNonce) {
      throw new Error('Telegram xavfsizlik kodi (nonce) mos kelmadi');
    }
  } else if (requireNonceClaim) {
    throw new Error('Telegram xavfsizlik kodi (nonce) topilmadi');
  }

  const telegramId = String(payload.sub || payload.id || '').trim();
  if (!telegramId) {
    throw new Error('Telegram foydalanuvchi ID topilmadi');
  }

  const givenName = payload.given_name ? String(payload.given_name).trim() : null;
  const familyName = payload.family_name ? String(payload.family_name).trim() : null;
  const rawName = payload.name ? String(payload.name).trim() : '';
  const fullName = rawName || `${givenName || ''} ${familyName || ''}`.trim() || 'Telegram foydalanuvchi';
  const username = payload.preferred_username
    ? String(payload.preferred_username).trim().replace(/^@/, '')
    : null;
  const photoUrl = payload.picture ? String(payload.picture).trim() : null;
  const rawPhone = payload.phone_number ? String(payload.phone_number).trim() : '';
  const phoneNumber = rawPhone ? normalizePhone(rawPhone) : null;

  return {
    telegramId,
    fullName,
    firstName: givenName,
    lastName: familyName,
    username,
    photoUrl,
    phoneNumber: phoneNumber && phoneNumber.startsWith('+') ? phoneNumber : null,
    nonce: tokenNonce || null,
  };
}
