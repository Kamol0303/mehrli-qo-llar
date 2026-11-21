import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'qulay_ish_access_token';
const PROFILE_KEY = 'qulay_ish_session_profile';

/** Mirror JWT into Capacitor Preferences (native mobile only — never used on web). */
export async function syncTokenToNativePreferences(token: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (token) {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } else {
      await Preferences.remove({ key: TOKEN_KEY });
      await Preferences.remove({ key: PROFILE_KEY });
    }
  } catch {
    /* ignore */
  }
}

/** On native boot, read JWT & profile from Capacitor Preferences (never touches localStorage). */
export async function hydrateTokenFromNativePreferences(): Promise<{
  token: string | null;
  profileJson: string | null;
}> {
  if (!Capacitor.isNativePlatform()) return { token: null, profileJson: null };
  try {
    const [{ value: token }, { value: profileJson }] = await Promise.all([
      Preferences.get({ key: TOKEN_KEY }),
      Preferences.get({ key: PROFILE_KEY }),
    ]);
    return { token: token ?? null, profileJson: profileJson ?? null };
  } catch {
    return { token: null, profileJson: null };
  }
}

export async function syncProfileToNativePreferences(rawJson: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (rawJson) await Preferences.set({ key: PROFILE_KEY, value: rawJson });
    else await Preferences.remove({ key: PROFILE_KEY });
  } catch {
    /* ignore */
  }
}
