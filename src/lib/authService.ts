import { ApiError } from './api/client';
import { api } from './api';
import { isEmailIdentifier } from './validation';
import type { Profile } from '../types';

export interface AuthResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  profile?: Profile;
  user?: Profile;
  uid?: string;
}

function mapApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message || 'Bu email yoki telefon raqami bilan hisob allaqachon mavjud.';
    }
    if (error.status === 401) {
      return error.message || 'Email/telefon yoki parol noto‘g‘ri.';
    }
    if (error.status === 429) {
      return error.message || 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.';
    }
    if (!error.status || error.message.toLowerCase().includes('failed to fetch')) {
      return 'Serverga ulanib bo‘lmadi. Internetni tekshiring.';
    }
    return error.message;
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return 'Serverga ulanib bo‘lmadi. Internetni tekshiring.';
    }
    return error.message;
  }
  return "Noma'lum xatolik";
}

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('998') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return '';
  if (isEmailIdentifier(trimmed)) {
    return trimmed.toLowerCase();
  }
  return normalizePhoneNumber(trimmed);
}

export const authService = {
  normalizePhoneNumber,
  normalizeIdentifier,

  async loginWithPassword(identifier: string, password: string): Promise<AuthResult> {
    try {
      const normalized = normalizeIdentifier(identifier);
      const res = await api.auth.login(normalized, password);
      return {
        success: true,
        accessToken: res.accessToken,
        profile: res.user,
        user: res.user,
        uid: res.user.uid,
      };
    } catch (e) {
      return { success: false, error: mapApiError(e) };
    }
  },

  async registerWithPassword(params: {
    identifier: string;
    password: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    role?: 'worker' | 'employer';
    profession?: string;
    educationLevel?: string;
    district?: string;
  }): Promise<AuthResult> {
    try {
      const normalized = normalizeIdentifier(params.identifier);
      const isEmail = isEmailIdentifier(normalized);
      const fullName =
        params.fullName?.trim() ||
        `${params.firstName || ''} ${params.lastName || ''}`.trim() ||
        undefined;

      const res = await api.auth.register({
        identifier: normalized,
        email: isEmail ? normalized : undefined,
        phone: !isEmail ? normalized : undefined,
        password: params.password,
        fullName,
        firstName: params.firstName?.trim() || undefined,
        lastName: params.lastName?.trim() || undefined,
        role: params.role === 'employer' ? 'employer' : 'worker',
        profession: params.profession || undefined,
        educationLevel: params.educationLevel || undefined,
        district: params.district || undefined,
      });
      return {
        success: true,
        accessToken: res.accessToken,
        profile: res.user,
        user: res.user,
        uid: res.user.uid,
      };
    } catch (e) {
      return { success: false, error: mapApiError(e) };
    }
  },

  async superAdminSignIn(login: string, password: string): Promise<AuthResult> {
    try {
      const res = await api.auth.superAdminLogin(login.trim(), password);
      return { success: true, profile: res.user, user: res.user, uid: res.user.uid };
    } catch (e) {
      return { success: false, error: mapApiError(e) };
    }
  },

  async superAdminSetup(login: string, password: string): Promise<AuthResult> {
    try {
      const res = await api.auth.superAdminSetup(login.trim(), password);
      return { success: true, profile: res.user, user: res.user, uid: res.user.uid };
    } catch (e) {
      return { success: false, error: mapApiError(e) };
    }
  },
};
