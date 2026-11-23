import type { Profile } from '../types';

export const BRAND_LOGO_URL = '/assets/aistudio/QwHMpg7yEQCosZA2vOSghaO2lyc1KFYxFoS7RbHW_cb9caa0f.png';

const PIN_ACCOUNT_KEY = 'mq_saved_pin_account';
const PIN_LOCKED_KEY = 'mq_app_locked';

export interface SavedPinAccount {
  uid: string;
  fullName: string;
  role: Profile['role'];
  identifier: string;
}

export function readSavedPinAccount(): SavedPinAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PIN_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPinAccount>;
    if (!parsed?.uid || !parsed?.fullName) return null;
    return {
      uid: String(parsed.uid),
      fullName: String(parsed.fullName),
      role: (parsed.role as Profile['role']) || 'worker',
      identifier: String(parsed.identifier || ''),
    };
  } catch {
    return null;
  }
}

export function savePinAccount(profile: Pick<Profile, 'uid' | 'fullName' | 'role' | 'phoneNumber' | 'email'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedPinAccount = {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
      identifier: profile.phoneNumber || profile.email || '',
    };
    window.localStorage.setItem(PIN_ACCOUNT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage errors */
  }
}

export function clearSavedPinAccount(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PIN_ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

export function isAppPinLocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PIN_LOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAppPinLocked(locked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (locked) {
      window.sessionStorage.setItem(PIN_LOCKED_KEY, '1');
    } else {
      window.sessionStorage.removeItem(PIN_LOCKED_KEY);
    }
  } catch {
    /* ignore */
  }
}
