import { ApiError } from './api/client';
import { api, type AuthProvidersResponse, type PasswordlessRegistrationMeta } from './api';
import { isEmailIdentifier } from './validation';
import type { Profile } from '../types';

export interface AuthResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  profile?: Profile;
  user?: Profile;
  uid?: string;
  isNew?: boolean;
}

function mapApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message || 'Bu email yoki telefon raqami bilan hisob allaqachon mavjud.';
    }
    if (error.status === 401) {
      return error.message || 'Kirish ma’lumotlari noto‘g‘ri.';
    }
    if (error.status === 429) {
      return error.message || 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.';
    }
    if (error.status === 503) {
      return error.message || 'Xizmat hali sozlanmagan.';
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

  async getProviders(): Promise<AuthProvidersResponse | null> {
    try {
      return await api.auth.providers();
    } catch {
      return null;
    }
  },

  /**
   * Passwordless Telegram OIDC Login / Registration.
   * Requests a single-use nonce + PKCE state from the server, opens Telegram's
   * official authorization URL directly in a popup, and resolves via postMessage.
   */
  async loginWithTelegram(meta?: PasswordlessRegistrationMeta): Promise<AuthResult> {
    let startData: { authUrl: string; state: string; nonce: string };
    try {
      startData = await api.auth.telegramStart(meta);
    } catch (e) {
      return { success: false, error: mapApiError(e) };
    }

    const width = 520;
    const height = 660;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const popup = window.open(
      startData.authUrl,
      'mehrli_telegram_oauth',
      `width=${width},height=${height},left=${left},top=${top},noopener=no`,
    );

    if (!popup) {
      return {
        success: false,
        error: 'Brauzer pop-up oynani blokladi. Iltimos, pop-up oynalarga ruxsat berib qayta urinib ko‘ring.',
      };
    }

    return new Promise<AuthResult>((resolve) => {
      let settled = false;
      let pollId: number | null = null;
      let timeoutId: number | null = null;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (pollId !== null) window.clearInterval(pollId);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      };

      const finish = (result: AuthResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onMessage = (event: MessageEvent) => {
        const data = event.data as {
          type?: string;
          accessToken?: string;
          user?: Record<string, unknown>;
          isNew?: boolean;
          error?: string;
        } | null;

        if (!data || typeof data !== 'object') return;
        if (data.type === 'TELEGRAM_AUTH_SUCCESS' && data.accessToken && data.user) {
          try {
            const hydrated = api.auth.hydrateSessionFromPopup(data.accessToken, data.user);
            finish({
              success: true,
              accessToken: hydrated.accessToken,
              profile: hydrated.user,
              user: hydrated.user,
              uid: hydrated.user.uid,
              isNew: Boolean(data.isNew),
            });
          } catch (err) {
            finish({ success: false, error: mapApiError(err) });
          }
        } else if (data.type === 'TELEGRAM_AUTH_ERROR') {
          finish({
            success: false,
            error: data.error || 'Telegram orqali kirishda xatolik yuz berdi.',
          });
        }
      };

      window.addEventListener('message', onMessage);

      pollId = window.setInterval(() => {
        if (popup.closed && !settled) {
          finish({
            success: false,
            error: 'Telegram oynasi yopildi. Kirish yakunlanmadi.',
          });
        }
      }, 600);

      timeoutId = window.setTimeout(() => {
        if (!settled) {
          try {
            if (!popup.closed) popup.close();
          } catch {
            /* ignore */
          }
          finish({
            success: false,
            error: 'Telegram orqali tasdiqlash vaqti tugadi. Qaytadan urinib ko‘ring.',
          });
        }
      }, 5 * 60_000);
    });
  },

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
