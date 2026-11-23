import { debugLogger } from '../lib/debugLogger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle,
  Loader,
  Eye,
  EyeOff,
  Briefcase,
  User,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import { authService } from '../lib/authService';
import type { AuthProvidersResponse } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { getRoleRedirectPath } from '../lib/roleRedirect';
import { CATEGORIES, EDUCATION_LEVELS } from '../constants/categories';
import { validateFullName, validateIdentifier } from '../lib/validation';
import SafeSelect from '../components/SafeSelect';

const debugError = (label: string, error?: unknown) => {
  if (import.meta.env.DEV) {
    debugLogger.error(`[${label}]`, error);
  }
};

type AuthMode = 'login' | 'register';
type AuthMethod = 'telegram' | 'password';

function TelegramIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M21.94 4.35a1.25 1.25 0 0 0-1.32-.2L2.76 11.2a1.15 1.15 0 0 0 .08 2.16l4.47 1.46 1.72 5.36a1.1 1.1 0 0 0 1.8.46l2.53-2.42 4.65 3.43a1.25 1.25 0 0 0 1.96-.76l2.58-15.17a1.25 1.25 0 0 0-.61-1.37ZM9.73 14.37l8.2-6.16-6.28 7.56-.32 3.12-1.36-4.24-3.65-1.2 12.14-4.8-8.73 5.72Z" />
    </svg>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, userRole, setAuthProfile } = useAuth();
  const { t } = useTranslation();

  const mode = useMemo<AuthMode>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('mode') === 'register' ? 'register' : 'login';
  }, [location.search]);

  const [method, setMethod] = useState<AuthMethod>('telegram');
  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);

  // Registration profile fields (Ism, Familiya, role, specialty — passwordless via Telegram)
  const [selectedRole, setSelectedRole] = useState<'worker' | 'employer'>('worker');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profession, setProfession] = useState('');
  const [educationLevel, setEducationLevel] = useState('');

  // Legacy password login fields (optional for previously registered accounts)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    identifier?: string;
    password?: string;
  }>({});

  useEffect(() => {
    let active = true;
    authService.getProviders().then((data) => {
      if (active && data) setProviders(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile || !profile.role) return;
    navigate(getRoleRedirectPath(userRole), { replace: true });
  }, [authLoading, user, profile, userRole, navigate]);

  useEffect(() => {
    setError('');
    setSuccess('');
    setFieldErrors({});
    if (mode === 'register' && method === 'password') {
      setMethod('telegram');
    }
  }, [mode, method]);

  useEffect(() => {
    const flash = (location.state as { success?: string } | null)?.success;
    if (!flash) return;
    setSuccess(flash);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  const clearMessages = useCallback(() => {
    setError('');
    setSuccess('');
  }, []);

  const validateRegisterProfileFields = useCallback((): boolean => {
    if (mode !== 'register') return true;
    const nextErrors: typeof fieldErrors = {};

    const firstCheck = validateFullName(firstName);
    if (!firstCheck.isValid) {
      nextErrors.firstName = firstCheck.error || 'Ismingizni kiriting';
    }
    const lastCheck = validateFullName(lastName);
    if (!lastCheck.isValid) {
      nextErrors.lastName = lastCheck.error || 'Familiyangizni kiriting';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError(Object.values(nextErrors)[0] || 'Ism va familiyangizni kiriting');
      return false;
    }
    return true;
  }, [mode, firstName, lastName]);

  const buildRegistrationMeta = useCallback(() => {
    if (mode !== 'register') return undefined;
    const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName,
      role: selectedRole,
      profession: selectedRole === 'worker' ? profession || undefined : undefined,
      educationLevel: selectedRole === 'worker' ? educationLevel || undefined : undefined,
    };
  }, [mode, firstName, lastName, selectedRole, profession, educationLevel]);

  const handleTelegramAuth = useCallback(async () => {
    clearMessages();
    if (!validateRegisterProfileFields()) return;

    setLoading(true);
    setFieldErrors({});
    try {
      const result = await authService.loginWithTelegram(buildRegistrationMeta());
      if (!result.success || !result.profile) {
        setLoading(false);
        setError(result.error || 'Telegram orqali kirishda xatolik yuz berdi.');
        return;
      }

      setAuthProfile(result.profile);
      setLoading(false);
      setSuccess(
        result.isNew
          ? 'Telegram orqali ro‘yxatdan muvaffaqiyatli o‘tdingiz!'
          : 'Telegram orqali muvaffaqiyatli kirdingiz!',
      );
      navigate(getRoleRedirectPath(result.profile.role), { replace: true });
    } catch (err) {
      debugError('Telegram auth error', err);
      setLoading(false);
      setError(t('auth.unexpected_error', { defaultValue: 'Kutilmagan xatolik yuz berdi.' }));
    }
  }, [clearMessages, validateRegisterProfileFields, buildRegistrationMeta, setAuthProfile, navigate, t]);

  const handleLegacyPasswordLogin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      clearMessages();

      const nextErrors: typeof fieldErrors = {};
      const idCheck = validateIdentifier(identifier);
      if (!idCheck.isValid) nextErrors.identifier = idCheck.error;
      if (!password) nextErrors.password = 'Parolni kiriting';

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setError(Object.values(nextErrors)[0] || 'Formani to‘ldiring');
        return;
      }

      setLoading(true);
      setFieldErrors({});
      try {
        const result = await authService.loginWithPassword(identifier, password);
        if (!result.success || !result.profile) {
          setLoading(false);
          setError(result.error || 'Email/telefon yoki parol noto‘g‘ri.');
          return;
        }
        setAuthProfile(result.profile);
        setLoading(false);
        setSuccess('Muvaffaqiyatli kirdingiz!');
        navigate(getRoleRedirectPath(result.profile.role), { replace: true });
      } catch (err) {
        debugError('Legacy login error', err);
        setLoading(false);
        setError(t('auth.unexpected_error', { defaultValue: 'Kutilmagan xatolik yuz berdi.' }));
      }
    },
    [clearMessages, identifier, password, setAuthProfile, navigate, t],
  );

  const title =
    mode === 'login'
      ? t('nav.login', { defaultValue: 'Kirish' })
      : t('auth.register_title', { defaultValue: 'Ro‘yxatdan o‘tish' });

  const subtitle =
    mode === 'login'
      ? 'Telegram orqali hisobingizga kiring'
      : 'Ma’lumotlaringizni kiriting va Telegram orqali tasdiqlang';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-7 sm:p-8 space-y-6 border border-gray-100">
          {/* Login / Register Switcher */}
          <div
            className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl"
            role="tablist"
            aria-label="Autentifikatsiya rejimi"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => navigate('/auth?mode=login')}
              className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                mode === 'login'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kirish
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => navigate('/auth?mode=register')}
              className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                mode === 'register'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ro‘yxatdan o‘tish
            </button>
          </div>

          <div className="text-center space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>

          {/* REGISTER PROFILE FIELDS (NO PASSWORD) */}
          {mode === 'register' && (
            <div className="space-y-4">
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1.5">Hisob turi</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('worker')}
                    disabled={loading}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      selectedRole === 'worker'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <User size={16} /> Ishchi
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('employer')}
                    disabled={loading}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      selectedRole === 'employer'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Briefcase size={16} /> Ish beruvchi
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    Ism <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="auth-firstName"
                    type="text"
                    autoComplete="given-name"
                    maxLength={60}
                    value={firstName}
                    onChange={(e) => {
                      clearMessages();
                      setFirstName(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, firstName: undefined }));
                    }}
                    placeholder="Masalan: Dilnoza"
                    className="w-full min-h-[44px] px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    required
                  />
                  {fieldErrors.firstName && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="auth-lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Familiya <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="auth-lastName"
                    type="text"
                    autoComplete="family-name"
                    maxLength={60}
                    value={lastName}
                    onChange={(e) => {
                      clearMessages();
                      setLastName(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, lastName: undefined }));
                    }}
                    placeholder="Masalan: Karimova"
                    className="w-full min-h-[44px] px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    required
                  />
                  {fieldErrors.lastName && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              {selectedRole === 'worker' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="auth-education" className="block text-sm font-medium text-gray-700 mb-1">
                      {t('auth.education_level', { defaultValue: "Ta'lim darajasi" })}
                    </label>
                    <SafeSelect
                      id="auth-education"
                      value={educationLevel}
                      onChange={(e) => {
                        clearMessages();
                        setEducationLevel(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900 text-sm"
                      disabled={loading}
                    >
                      <option value="">{t('auth.education_placeholder', { defaultValue: 'Tanlang' })}</option>
                      {EDUCATION_LEVELS.map((level) => (
                        <option key={level.id} value={level.id}>
                          {t(`education_levels.${level.id}`, { defaultValue: level.name })}
                        </option>
                      ))}
                    </SafeSelect>
                  </div>

                  <div>
                    <label htmlFor="auth-profession" className="block text-sm font-medium text-gray-700 mb-1">
                      {t('auth.profession', { defaultValue: 'Mutaxassislik' })}
                    </label>
                    <SafeSelect
                      id="auth-profession"
                      value={profession}
                      onChange={(e) => {
                        clearMessages();
                        setProfession(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900 text-sm"
                      disabled={loading}
                    >
                      <option value="">{t('auth.profession_placeholder', { defaultValue: 'Tanlang' })}</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t(`categories.${c.id}`, { defaultValue: c.name })}
                        </option>
                      ))}
                    </SafeSelect>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TELEGRAM LOGIN */}
          {method === 'telegram' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleTelegramAuth}
                disabled={loading}
                className="w-full bg-[#229ED9] hover:bg-[#1b8cc2] disabled:bg-gray-400 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-200 shadow-md shadow-sky-500/20 flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <Loader size={18} className="animate-spin" aria-hidden /> Telegram tasdiqlanmoqda...
                  </>
                ) : (
                  <>
                    <TelegramIcon className="w-5 h-5" />
                    {mode === 'register'
                      ? 'Telegram orqali ro‘yxatdan o‘tish'
                      : 'Telegram orqali kirish'}
                  </>
                )}
              </button>

              {providers && !providers.telegram.enabled && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                  Telegram bot hali ulanmagan. @BotFather orqali olingan Client ID va Client Secret ni
                  sozlamalarga kiriting.
                </p>
              )}

              {mode === 'login' && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setFieldErrors({});
                      setMethod('password');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-700 transition"
                  >
                    <KeyRound size={13} /> Avvalgi email/parol hisobi bilan kirish
                  </button>
                </div>
              )}
            </div>
          )}

          {/* LEGACY PASSWORD LOGIN (FOR PREVIOUSLY REGISTERED ACCOUNTS) */}
          {mode === 'login' && method === 'password' && (
            <form onSubmit={handleLegacyPasswordLogin} className="space-y-4" noValidate>
              <div>
                <label htmlFor="auth-login-identifier" className="block text-sm font-medium text-gray-700 mb-1">
                  Email yoki telefon raqami
                </label>
                <input
                  id="auth-login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => {
                    clearMessages();
                    setIdentifier(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
                  }}
                  placeholder="email@example.uz yoki +998 90 123 45 67"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.identifier)}
                  required
                />
                {fieldErrors.identifier && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.identifier}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="auth-login-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Parol
                </label>
                <div className="relative">
                  <input
                    id="auth-login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      clearMessages();
                      setPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Parolingizni kiriting"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 p-1 rounded-lg"
                    aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={18} className="animate-spin" aria-hidden /> Tekshirilmoqda...
                  </span>
                ) : (
                  'Parol bilan kirish'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setFieldErrors({});
                  setMethod('telegram');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 py-1"
              >
                <ArrowLeft size={15} /> Telegram orqali kirishga qaytish
              </button>
            </form>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3" role="alert">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3" role="status">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
