import { debugLogger } from '../lib/debugLogger';
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Profile } from '../types';
import { api } from '../lib/api';
import {
  ApiError,
  cacheSessionProfile,
  clearAccessToken,
  getAccessToken,
  isAccessTokenValid,
  readCachedSessionProfile,
} from '../lib/api/client';
import { clearLegacyDemoStorage } from '../lib/demoMode';

type UserRole = 'worker' | 'employer' | 'admin' | 'super_admin';

export interface AppUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  userRole: UserRole | null;
  /** Always false — demo/local-only auth is disabled (shared backend requirement). */
  isDemo: boolean;
  refreshProfile: () => Promise<void>;
  setAuthProfile: (profile: Profile) => void;
  checkDemoSession: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const userRole = useMemo(() => (profile?.role as UserRole | null) || null, [profile]);
  const isDemo = false;

  const setSession = useCallback((p: Profile) => {
    setProfile(p);
    setUser({
      uid: p.uid,
      email: p.email,
      displayName: p.fullName,
      phoneNumber: p.phoneNumber,
    });
    cacheSessionProfile(p);
  }, []);

  const checkDemoSession = useCallback(() => {
    clearLegacyDemoStorage();
  }, []);

  const setAuthProfile = useCallback(
    (p: Profile) => {
      setSession(p);
      setLoading(false);
    },
    [setSession],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.auth.me();
      setSession(p);
    } catch (err) {
      if (import.meta.env.DEV) debugLogger.error('[AuthContext] refreshProfile', err);
    }
  }, [setSession]);

  /**
   * Slide the login forward using the active HttpOnly cookie or native token.
   */
  const slideSession = useCallback(async () => {
    try {
      const p = await api.auth.refresh();
      if (p) setSession(p);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAccessToken();
        setUser(null);
        setProfile(null);
      }
    }
  }, [setSession]);

  useEffect(() => {
    clearLegacyDemoStorage();
    let active = true;
    const token = getAccessToken();

    // If a stale token was restored on native, drop it before checking server session.
    if (token && !isAccessTokenValid(token)) {
      clearAccessToken();
    }

    // Check/restore session cleanly without throwing 401 for unauthenticated visitors.
    api.auth
      .session()
      .then((p) => {
        if (!active) return;
        if (p) {
          setSession(p);
        } else {
          clearAccessToken();
          setUser(null);
          setProfile(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          clearAccessToken();
          setUser(null);
          setProfile(null);
          return;
        }
        const cached = readCachedSessionProfile<Profile>();
        if (cached?.uid && token && isAccessTokenValid(token)) {
          setSession(cached);
          if (import.meta.env.DEV) {
            debugLogger.warn('[AuthContext] /auth/session failed; using cached session until API is back');
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [setSession]);

  // Re-validate and slide the session each time the native app returns to foreground.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | undefined;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void slideSession();
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [slideSession]);

  const signOut = useCallback(async () => {
    clearLegacyDemoStorage();
    await api.auth.logout();
    setUser(null);
    setProfile(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      signOut,
      userRole,
      isDemo,
      refreshProfile,
      setAuthProfile,
      checkDemoSession,
    }),
    [user, profile, loading, signOut, userRole, isDemo, refreshProfile, setAuthProfile, checkDemoSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
