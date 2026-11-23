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
  Lock,
} from 'lucide-react';
import { authService } from '../lib/authService';
import type { AuthProvidersResponse } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { getRoleRedirectPath } from '../lib/roleRedirect';
import { CATEGORIES, EDUCATION_LEVELS } from '../constants/categories';
import { validateFullName, validateIdentifier } from '../lib/validation';
import SafeSelect from '../components/SafeSelect';
import PinPadScreen from '../components/auth/PinPadScreen';
import {
  BRAND_LOGO_URL,
  clearSavedPinAccount,
  readSavedPinAccount,
  savePinAccount,
  type SavedPinAccount,
} from '../lib/pinStorage';
import type { Profile } from '../types';

const debugError = (label: string, error?: unknown) => {
  if (import.meta.env.DEV) {
    debugLogger.error(`[${label}]`, error);
  }
};

type AuthMode = 'login' | 'register';
type AuthMethod = 'password' | 'telegram';

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

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = useMemo<AuthMode>(
    () => (searchParams.get('mode') === 'register' ? 'register' : 'login'),
    [searchParams],
  );

  const initialMethod = useMemo<AuthMethod>(() => {
    const requested = searchParams.get('method');
    if (requested === 'telegram') return 'telegram';
    return 'password';
  }, [searchParams]);

  const [method, setMethod] = useState<AuthMethod>(initialMethod);
  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);
  const [savedPinAccount, setSavedPinAccount] = useState<SavedPinAccount | null>(() => readSavedPinAccount());
  const [showPinPad, setShowPinPad] = useState<boolean>(() => {
    const requested = new URLSearchParams(location.search).get('method');
    if (requested === 'password' || requested === 'telegram') return false;
    return Boolean(readSavedPinAccount());
  });
  const [pendingPinProfile, setPendingPinProfile] = useState<Profile | null>(null);

  // Registration & login fields
  const [selectedRole, setSelectedRole] = useState<'worker' | 'employer'>('worker');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profession, setProfession] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
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
    if (authLoading || pendingPinProfile) return;
    if (!user || !profile || !profile.role) return;
    navigate(getRoleRedirectPath(userRole), { replace: true });
  }, [authLoading, pendingPinProfile, user, profile, userRole, navigate]);

  useEffect(() => {
    setError('');
    setSuccess('');
    setFieldErrors({});
    if (mode === 'register') {
      setShowPinPad(false);
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

  const completeAuthSuccess = useCallback(
    (authedProfile: Profile, askPinSetup = false) => {
      if (askPinSetup && !authedProfile.hasPin) {
        setAuthProfile(authedProfile);
        setPendingPinProfile(authedProfile);
        return;
      }
      if (authedProfile.hasPin) {
        savePinAccount(authedProfile);
      }
      setAuthProfile(authedProfile);
      navigate(getRoleRedirectPath(authedProfile.role), { replace: true });
    },
    [setAuthProfile, navigate],
  );

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

      setLoading(false);
      setSuccess(
        result.isNew
          ? 'Telegram orqali ro‘yxatdan muvaffaqiyatli o‘tdingiz!'
          : 'Telegram orqali muvaffaqiyatli kirdingiz!',
      );
      completeAuthSuccess(result.profile, Boolean(result.isNew || mode === 'register'));
    } catch (err) {
      debugError('Telegram auth error', err);
      setLoading(false);
      setError(t('auth.unexpected_error', { defaultValue: 'Kutilmagan xatolik yuz berdi.' }));
    }
  }, [clearMessages, validateRegisterProfileFields, buildRegistrationMeta, completeAuthSuccess, mode, t]);

  const handlePasswordSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      clearMessages();

      if (mode === 'register' && !validateRegisterProfileFields()) return;

      const nextErrors: typeof fieldErrors = {};
      const idCheck = validateIdentifier(identifier);
      if (!idCheck.isValid) {
        nextErrors.identifier = idCheck.error || 'Email yoki +998 telefon raqamini kiriting';
      }
      if (!password) {
        nextErrors.password = 'Parolni kiriting';
      } else if (mode === 'register' && password.length < 8) {
        nextErrors.password = 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak';
      }

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setError(Object.values(nextErrors)[0] || 'Formani to‘ldiring');
        return;
      }

      setLoading(true);
      setFieldErrors({});
      try {
        const result =
          mode === 'register'
            ? await authService.registerWithPassword({
                identifier,
                password,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                fullName: `${firstName} ${lastName}`.trim(),
                role: selectedRole,
                profession: selectedRole === 'worker' ? profession || undefined : undefined,
                educationLevel: selectedRole === 'worker' ? educationLevel || undefined : undefined,
              })
            : await authService.loginWithPassword(identifier, password);

        if (!result.success || !result.profile) {
          setLoading(false);
          setError(
            result.error ||
              (mode === 'register'
                ? 'Ro‘yxatdan o‘tishda xatolik yuz berdi.'
                : 'Email/telefon yoki parol noto‘g‘ri.'),
          );
          return;
        }

        setLoading(false);
        setSuccess(
          mode === 'register'
            ? 'Ro‘yxatdan muvaffaqiyatli o‘tdingiz!'
            : 'Muvaffaqiyatli kirdingiz!',
        );
        completeAuthSuccess(result.profile, mode === 'register');
      } catch (err) {
        debugError('Password auth error', err);
        setLoading(false);
        setError(t('auth.unexpected_error', { defaultValue: 'Kutilmagan xatolik yuz berdi.' }));
      }
    },
    [
      clearMessages,
      mode,
      validateRegisterProfileFields,
      identifier,
      password,
      firstName,
      lastName,
      selectedRole,
      profession,
      educationLevel,
      completeAuthSuccess,
      t,
    ],
  );

  // Step 1: Post-registration optional bank-style 4-digit PIN setup screen
  if (pendingPinProfile) {
    return (
      <PinPadScreen
        mode="setup"
        accountLabel={pendingPinProfile.fullName}
        subLabel={pendingPinProfile.phoneNumber || pendingPinProfile.email}
        onSkipSetup={() => {
          const targetRole = pendingPinProfile.role;
          setPendingPinProfile(null);
          navigate(getRoleRedirectPath(targetRole), { replace: true });
        }}
        onSetupComplete={async (pin) => {
          const res = await authService.setupPin(pin);
          if (!res.success || !res.profile) {
            return { ok: false, error: res.error || 'PIN-kod saqlanmadi' };
          }
          savePinAccount(res.profile);
          setSavedPinAccount(readSavedPinAccount());
          setAuthProfile(res.profile);
          setPendingPinProfile(null);
          navigate(getRoleRedirectPath(res.profile.role), { replace: true });
          return { ok: true };
        }}
      />
    );
  }

  // Step 2: Bank-app 4-digit PIN quick login screen for returning users
  if (mode === 'login' && showPinPad && savedPinAccount) {
    return (
      <PinPadScreen
        mode="unlock"
        accountLabel={savedPinAccount.fullName}
        subLabel={savedPinAccount.identifier}
        switchAuthLabel="Parol / Telegram"
        onVerify={async (pin) => {
          const res = await authService.loginWithPin({
            pin,
            userId: savedPinAccount.uid,
            identifier: savedPinAccount.identifier || undefined,
          });
          if (!res.success || !res.profile) {
            return { ok: false, error: res.error || 'PIN-kod noto‘g‘ri' };
          }
          setAuthProfile(res.profile);
          navigate(getRoleRedirectPath(res.profile.role), { replace: true });
          return { ok: true };
        }}
        onForgotPin={() => {
          clearSavedPinAccount();
          setSavedPinAccount(null);
          setShowPinPad(false);
          setMethod('password');
        }}
        onSwitchToFullAuth={() => {
          setShowPinPad(false);
          setMethod('password');
        }}
      />
    );
  }

  const title =
    mode === 'login'
      ? t('nav.login', { defaultValue: 'Kirish' })
      : t('auth.register_title', { defaultValue: 'Ro‘yxatdan o‘tish' });

  const subtitle =
    mode === 'login'
      ? 'Oddiy parol, 4 xonali PIN yoki Telegram orqali kiring'
      : 'Telefon/parol yoki Telegram orqali hisob yarating';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-emerald-50/40 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-slate-900/10 p-6 sm:p-8 space-y-5 border border-slate-200/80 dark:border-slate-800">
          {/* Custom Brand Logo Header */}
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-1.5 shadow-sm flex items-center justify-center">
              <img
                src={BRAND_LOGO_URL}
                alt="Mehrli qo‘llar logotipi"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              Mehrli qo‘llar
            </span>
          </div>

          {/* Login / Register Switcher */}
          <div
            className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl"
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
                  ? 'bg-white dark:bg-slate-900 text-[#1a7c78] dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                  ? 'bg-white dark:bg-slate-900 text-[#1a7c78] dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Ro‘yxatdan o‘tish
            </button>
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>

          {/* Auth Method Selector (Oddiy Parol | Telegram) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                clearMessages();
                setFieldErrors({});
                setMethod('password');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                method === 'password'
                  ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#1a7c78] dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <KeyRound size={16} /> Oddiy parol
            </button>
            <button
              type="button"
              onClick={() => {
                clearMessages();
                setFieldErrors({});
                setMethod('telegram');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                method === 'telegram'
                  ? 'border-[#229ED9] bg-[#229ED9]/10 text-[#1b8cc2] dark:text-sky-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <TelegramIcon className="w-4 h-4" /> Telegram
            </button>
          </div>

          {/* Saved 4-digit Bank PIN Quick Switch */}
          {mode === 'login' && savedPinAccount && (
            <button
              type="button"
              onClick={() => setShowPinPad(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-left transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#1a7c78] text-white flex items-center justify-center shrink-0">
                  <Lock size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {savedPinAccount.fullName}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                    4 xonali PIN-kod bilan tez kirish →
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* REGISTER SHARED PROFILE FIELDS */}
          {mode === 'register' && (
            <div className="space-y-3.5">
              <div>
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Hisob turi
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('worker')}
                    disabled={loading}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      selectedRole === 'worker'
                        ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#1a7c78] dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                        ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#1a7c78] dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Briefcase size={16} /> Ish beruvchi
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-firstName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full min-h-[44px] px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  <label htmlFor="auth-lastName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full min-h-[44px] px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                    <label htmlFor="auth-education" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('auth.education_level', { defaultValue: "Ta'lim darajasi" })}
                    </label>
                    <SafeSelect
                      id="auth-education"
                      value={educationLevel}
                      onChange={(e) => {
                        clearMessages();
                        setEducationLevel(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                    <label htmlFor="auth-profession" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('auth.profession', { defaultValue: 'Mutaxassislik' })}
                    </label>
                    <SafeSelect
                      id="auth-profession"
                      value={profession}
                      onChange={(e) => {
                        clearMessages();
                        setProfession(e.target.value);
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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

          {/* PASSWORD LOGIN / REGISTRATION FORM */}
          {method === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="auth-identifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telefon raqami yoki Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="auth-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => {
                    clearMessages();
                    setIdentifier(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
                  }}
                  placeholder="+998 90 123 45 67 yoki email@example.uz"
                  className="w-full min-h-[44px] px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Parol {mode === 'register' && '(kamida 8 ta belgi)'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => {
                      clearMessages();
                      setPassword(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Parolni kiriting"
                    className="w-full min-h-[44px] px-3.5 py-2.5 pr-11 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1a7c78] outline-none bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:hover:text-white p-1.5 rounded-lg"
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
                className="w-full bg-[#1a7c78] hover:bg-[#156461] disabled:bg-slate-400 text-white font-bold py-3.5 px-4 rounded-xl transition duration-200 shadow-md shadow-[#1a7c78]/20 focus:outline-none focus:ring-2 focus:ring-[#1a7c78] focus:ring-offset-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={18} className="animate-spin" aria-hidden /> Tekshirilmoqda...
                  </span>
                ) : mode === 'register' ? (
                  'Ro‘yxatdan o‘tish'
                ) : (
                  'Parol bilan kirish'
                )}
              </button>
            </form>
          )}

          {/* TELEGRAM LOGIN / REGISTRATION */}
          {method === 'telegram' && (
            <div className="space-y-3.5">
              <button
                type="button"
                onClick={handleTelegramAuth}
                disabled={loading}
                className="w-full bg-[#229ED9] hover:bg-[#1b8cc2] disabled:bg-slate-400 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-200 shadow-md shadow-sky-500/20 flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
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
                  Telegram bot hali ulanmagan. Oddiy parol orqali ro‘yxatdan o‘tishingiz yoki kirishingiz mumkin.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-3.5 flex gap-2.5" role="alert">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 dark:text-red-200 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3.5 flex gap-2.5" role="status">
              <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm">{success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
