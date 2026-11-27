import { Capacitor } from '@capacitor/core';
import {
  syncProfileToNativePreferences,
  syncTokenToNativePreferences,
} from '../../native/tokenPreferences';

function extractApiMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const msg = record.message;
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.map(String).join(', ');
  return null;
}

const AUTH_TOKEN_KEY = 'mq_auth_token';
const AUTH_PROFILE_KEY = 'mq_auth_profile';
const LEGACY_TOKEN_KEY = 'qulay_ish_access_token';
const LEGACY_SESSION_PROFILE_KEY = 'qulay_ish_session_profile';

let accessTokenMemory: string | null = null;
let cachedProfileMemory: unknown = null;

function scrubLegacyWebStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_PROFILE_KEY);
  } catch {
    /* ignore restricted storage */
  }
}

scrubLegacyWebStorage();

export function getAccessToken(): string | null {
  if (accessTokenMemory) return accessTokenMemory;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (stored && isAccessTokenValid(stored)) {
        accessTokenMemory = stored;
        return stored;
      }
    } catch {
      /* ignore restricted storage */
    }
  }
  return null;
}

export function setAccessToken(token: string): void {
  accessTokenMemory = token;
  scrubLegacyWebStorage();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }
  if (Capacitor.isNativePlatform()) {
    void syncTokenToNativePreferences(token);
  }
}

export function clearAccessToken(): void {
  accessTokenMemory = null;
  cachedProfileMemory = null;
  scrubLegacyWebStorage();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_PROFILE_KEY);
    } catch {
      /* ignore */
    }
  }
  if (Capacitor.isNativePlatform()) {
    void syncTokenToNativePreferences(null);
  }
}

/** JWT `exp` in ms, or null if missing/invalid */
export function getAccessTokenExpiryMs(token?: string | null): number | null {
  const value = token ?? getAccessToken();
  if (!value) return null;
  try {
    const part = value.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenValid(token?: string | null): boolean {
  const exp = getAccessTokenExpiryMs(token);
  if (!exp) return false;
  // 30s clock skew buffer
  return Date.now() < exp - 30_000;
}

export function cacheSessionProfile(profile: unknown): void {
  cachedProfileMemory = profile;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const raw = JSON.stringify({ profile, savedAt: Date.now() });
      void syncProfileToNativePreferences(raw);
    } catch {
      /* ignore */
    }
  }
}

export function hydrateSessionProfileJson(rawJson: string | null): void {
  if (!rawJson) return;
  try {
    const parsed = JSON.parse(rawJson) as { profile?: unknown };
    if (parsed.profile) cachedProfileMemory = parsed.profile;
  } catch {
    /* ignore */
  }
}

export function readCachedSessionProfile<T = unknown>(): T | null {
  if (cachedProfileMemory) return cachedProfileMemory as T;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(AUTH_PROFILE_KEY);
      if (raw) {
        cachedProfileMemory = JSON.parse(raw);
        return cachedProfileMemory as T;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function resolveApiBase(): string {
  // Web origins always talk to this app's own same-origin Express backend at /api.
  if (!Capacitor.isNativePlatform()) {
    return '/api';
  }
  const raw = String(
    (import.meta.env as Record<string, string | undefined>).PUBLIC_API_URL || '/api',
  ).trim();
  if (!raw || raw.startsWith('/')) {
    return (raw || '/api').replace(/\/$/, '') || '/api';
  }
  const withoutTrailing = raw.replace(/\/$/, '');
  return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`;
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isHtmlPayload(raw: string): boolean {
  const trimmed = raw.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

const TRANSIENT_RETRY_DELAYS_MS = [400, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isGetLike = method === 'GET' || method === 'HEAD';
  const isMutation = !isGetLike && method !== 'OPTIONS';

  const headers: Record<string, string> = {};
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (isMutation) {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  Object.assign(headers, options.headers as Record<string, string>);

  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;
  const credentials: RequestCredentials = API_BASE.startsWith('/') ? 'same-origin' : 'include';

  const maxAttempts = isGetLike ? TRANSIENT_RETRY_DELAYS_MS.length + 1 : 1;
  let res: Response | null = null;
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const candidate = await fetch(url, {
        ...options,
        headers,
        credentials,
      });
      if (isGetLike && (candidate.status === 502 || candidate.status === 503 || candidate.status === 504) && attempt < maxAttempts - 1) {
        await sleep(TRANSIENT_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      res = candidate;
      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(TRANSIENT_RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }

  if (!res) {
    const detail = lastNetworkError instanceof Error ? lastNetworkError.message : String(lastNetworkError);
    const hint =
      detail.toLowerCase().includes('failed to fetch') || detail.toLowerCase().includes('network')
        ? 'Serverga ulanib bo‘lmadi. Internetni tekshiring yoki birozdan keyin qayta urinib ko‘ring.'
        : detail;
    throw new ApiError(hint, 0, { url, cause: detail });
  }

  const raw = await res.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!res.ok) {
    const extracted = extractApiMessage(body);
    const message =
      extracted ??
      (typeof body === 'string' && body && !isHtmlPayload(body)
        ? body
        : res.status === 404
          ? 'So‘ralgan API manzili topilmadi (404).'
          : `API xatosi (${res.status})`);
    throw new ApiError(message, res.status, body);
  }

  if (res.status === 204 || raw === '') return undefined as T;
  if (typeof body === 'string' && isHtmlPayload(body)) {
    throw new ApiError('Server noto‘g‘ri javob qaytardi. Sahifani yangilab qayta urinib ko‘ring.', 502, body);
  }
  return body as T;
}

export function toQuery(params?: Record<string, string | undefined> | null): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
