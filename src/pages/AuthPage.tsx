import { debugLogger } from '../lib/debugLogger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle, Loader, Eye, EyeOff, Briefcase, User } from 'lucide-react';
import { authService } from '../lib/authService';
import { useAuth } from '../hooks/useAuth';
import { getRoleRedirectPath } from '../lib/roleRedirect';
import { CATEGORIES, EDUCATION_LEVELS } from '../constants/categories';
import {
  validateIdentifier,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
} from '../lib/validation';
import SafeSelect from '../components/SafeSelect';

const debugError = (label: string, error?: unknown) => {
  if (import.meta.env.DEV) {
    debugLogger.error(`[${label}]`, error);
  }
};

type AuthMode = 'login' | 'register';

type AuthState = {
  identifier: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  selectedRole: 'worker' | 'employer';
  profession: string;
  educationLevel: string;
  loading: boolean;
  error: string;
  success: string;
  fieldErrors: {
    firstName?: string;
    lastName?: string;
    identifier?: string;
    password?: string;
    confirmPassword?: string;
  };
};

const initialState: AuthState = {
  identifier: '',
  firstName: '',
  lastName: '',
  password: '',
  confirmPassword: '',
  selectedRole: 'worker',
  profession: '',
  educationLevel: '',
  loading: false,
  error: '',
  success: '',
  fieldErrors: {},
};

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, userRole, setAuthProfile } = useAuth();
  const { t } = useTranslation();

  const mode = useMemo<AuthMode>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('mode') === 'register' ? 'register' : 'login';
  }, [location.search]);

  const [state, setState] = useState<AuthState>(initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const setPartialState = useCallback((patch: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Persisted session -> skip auth form and navigate to role dashboard
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile || !profile.role) return;
    const redirectPath = getRoleRedirectPath(userRole);
    navigate(redirectPath, { replace: true });
  }, [authLoading, user, profile, userRole, navigate]);

  // Reset form when switching between login and register modes
  useEffect(() => {
    setState(initialState);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  // Show one-shot success flash if navigated with state.success
  useEffect(() => {
    const flash = (location.state as { success?: string } | null)?.success;
    if (!flash) return;
    setPartialState({ success: flash });
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate, setPartialState]);

  const clearMessages = useCallback(() => {
    setPartialState({ error: '', success: '' });
  }, [setPartialState]);

  const handleLogin = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessages();

      const fieldErrors: AuthState['fieldErrors'] = {};
      const idCheck = validateIdentifier(state.identifier);
      if (!idCheck.isValid) {
        fieldErrors.identifier = idCheck.error;
      }
      if (!state.password) {
        fieldErrors.password = 'Parolni kiriting';
      }

      if (Object.keys(fieldErrors).length > 0) {
        setPartialState({
          fieldErrors,
          error: Object.values(fieldErrors)[0] || 'Formani to‘ldiring',
        });
        return;
      }

      setPartialState({ loading: true, error: '', success: '', fieldErrors: {} });
      try {
        const result = await authService.loginWithPassword(state.identifier, state.password);
        if (!result.success || !result.profile) {
          setPartialState({
            loading: false,
            error: result.error || 'Email/telefon yoki parol noto‘g‘ri.',
          });
          return;
        }
        setAuthProfile(result.profile);
        setPartialState({ loading: false, success: 'Muvaffaqiyatli kirdingiz!' });
        navigate(getRoleRedirectPath(result.profile.role), { replace: true });
      } catch (err) {
        debugError('Login error', err);
        setPartialState({ loading: false, error: t('auth.unexpected_error') });
      }
    },
    [state.identifier, state.password, clearMessages, setPartialState, setAuthProfile, navigate, t],
  );

  const handleRegister = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessages();

      const fieldErrors: AuthState['fieldErrors'] = {};
      const firstNameCheck = validateFullName(state.firstName);
      if (!firstNameCheck.isValid) {
        fieldErrors.firstName = firstNameCheck.error;
      }
      if (state.lastName.trim()) {
        const lastNameCheck = validateFullName(state.lastName);
        if (!lastNameCheck.isValid) {
          fieldErrors.lastName = lastNameCheck.error;
        }
      }
      const idCheck = validateIdentifier(state.identifier);
      if (!idCheck.isValid) {
        fieldErrors.identifier = idCheck.error;
      }
      const pwCheck = validatePassword(state.password);
      if (!pwCheck.isValid) {
        fieldErrors.password = pwCheck.error;
      }
      const confirmCheck = validatePasswordConfirm(state.password, state.confirmPassword);
      if (!confirmCheck.isValid) {
        fieldErrors.confirmPassword = confirmCheck.error;
      }

      if (Object.keys(fieldErrors).length > 0) {
        setPartialState({
          fieldErrors,
          error: Object.values(fieldErrors)[0] || 'Formani to‘ldiring',
        });
        return;
      }

      setPartialState({ loading: true, error: '', success: '', fieldErrors: {} });
      try {
        const fullName = `${state.firstName} ${state.lastName}`.trim().replace(/\s+/g, ' ');
        const result = await authService.registerWithPassword({
          identifier: state.identifier,
          password: state.password,
          fullName,
          firstName: state.firstName.trim(),
          lastName: state.lastName.trim() || undefined,
          role: state.selectedRole,
          profession: state.selectedRole === 'worker' ? state.profession || undefined : undefined,
          educationLevel: state.selectedRole === 'worker' ? state.educationLevel || undefined : undefined,
        });

        if (!result.success || !result.profile) {
          setPartialState({
            loading: false,
            error: result.error || t('auth.unexpected_error'),
          });
          return;
        }

        setAuthProfile(result.profile);
        setPartialState({
          loading: false,
          success: t('auth.register_success', { defaultValue: 'Ro‘yxatdan muvaffaqiyatli o‘tdingiz!' }),
        });
        navigate(getRoleRedirectPath(result.profile.role), { replace: true });
      } catch (err) {
        debugError('Register error', err);
        setPartialState({ loading: false, error: t('auth.unexpected_error') });
      }
    },
    [
      state.firstName,
      state.lastName,
      state.identifier,
      state.password,
      state.confirmPassword,
      state.selectedRole,
      state.profession,
      state.educationLevel,
      clearMessages,
      setPartialState,
      setAuthProfile,
      navigate,
      t,
    ],
  );

  const title = mode === 'login' ? t('nav.login', { defaultValue: 'Kirish' }) : t('auth.register_title', { defaultValue: 'Ro‘yxatdan o‘tish' });
  const subtitle =
    mode === 'login'
      ? 'Email yoki telefon raqami va parol bilan hisobingizga kiring'
      : 'Email yoki telefon raqami orqali yangi hisob yarating';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-6 border border-gray-100">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl" role="tablist" aria-label="Autentifikatsiya rejimi">
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
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5" noValidate>
              <div>
                <label htmlFor="auth-login-identifier" className="block text-sm font-medium text-gray-700 mb-1">
                  Email yoki telefon raqami
                </label>
                <input
                  id="auth-login-identifier"
                  type="text"
                  autoComplete="username"
                  value={state.identifier}
                  onChange={(e) => {
                    clearMessages();
                    const identifier = e.target.value;
                    setPartialState({
                      identifier,
                      fieldErrors: { ...state.fieldErrors, identifier: undefined },
                    });
                  }}
                  placeholder="email@example.uz yoki +998 90 123 45 67"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                  disabled={state.loading}
                  aria-invalid={Boolean(state.fieldErrors.identifier)}
                  required
                />
                {state.fieldErrors.identifier && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {state.fieldErrors.identifier}
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
                    value={state.password}
                    onChange={(e) => {
                      clearMessages();
                      setPartialState({
                        password: e.target.value,
                        fieldErrors: { ...state.fieldErrors, password: undefined },
                      });
                    }}
                    placeholder="Parolingizni kiriting"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={state.loading}
                    aria-invalid={Boolean(state.fieldErrors.password)}
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
                {state.fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {state.fieldErrors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={state.loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                {state.loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={18} className="animate-spin" aria-hidden /> Tekshirilmoqda...
                  </span>
                ) : (
                  'Kirish'
                )}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              {/* Role Selection */}
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1.5">Hisob turi</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPartialState({ selectedRole: 'worker' })}
                    disabled={state.loading}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      state.selectedRole === 'worker'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <User size={16} /> Ishchi
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialState({ selectedRole: 'employer' })}
                    disabled={state.loading}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                      state.selectedRole === 'employer'
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
                    Ism
                  </label>
                  <input
                    id="auth-firstName"
                    type="text"
                    autoComplete="given-name"
                    maxLength={60}
                    value={state.firstName}
                    onChange={(e) => {
                      clearMessages();
                      const firstName = e.target.value;
                      const v = validateFullName(firstName);
                      setPartialState({
                        firstName,
                        fieldErrors: {
                          ...state.fieldErrors,
                          firstName: firstName ? (v.isValid ? undefined : v.error) : undefined,
                        },
                      });
                    }}
                    placeholder="Ism"
                    className="w-full min-h-[44px] px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={state.loading}
                    aria-invalid={Boolean(state.fieldErrors.firstName)}
                    required
                  />
                  {state.fieldErrors.firstName && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {state.fieldErrors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="auth-lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Familiya
                  </label>
                  <input
                    id="auth-lastName"
                    type="text"
                    autoComplete="family-name"
                    maxLength={60}
                    value={state.lastName}
                    onChange={(e) => {
                      clearMessages();
                      const lastName = e.target.value;
                      const v = lastName.trim() ? validateFullName(lastName) : { isValid: true, error: undefined };
                      setPartialState({
                        lastName,
                        fieldErrors: {
                          ...state.fieldErrors,
                          lastName: v.isValid ? undefined : v.error,
                        },
                      });
                    }}
                    placeholder="Familiya"
                    className="w-full min-h-[44px] px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={state.loading}
                    aria-invalid={Boolean(state.fieldErrors.lastName)}
                  />
                  {state.fieldErrors.lastName && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {state.fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="auth-reg-identifier" className="block text-sm font-medium text-gray-700 mb-1">
                  Email yoki telefon raqami
                </label>
                <input
                  id="auth-reg-identifier"
                  type="text"
                  autoComplete="username"
                  value={state.identifier}
                  onChange={(e) => {
                    clearMessages();
                    const identifier = e.target.value;
                    const v = validateIdentifier(identifier);
                    setPartialState({
                      identifier,
                      fieldErrors: {
                        ...state.fieldErrors,
                        identifier: identifier ? (v.isValid ? undefined : v.error) : undefined,
                      },
                    });
                  }}
                  placeholder="email@example.uz yoki +998 90 123 45 67"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                  disabled={state.loading}
                  aria-invalid={Boolean(state.fieldErrors.identifier)}
                  required
                />
                {state.fieldErrors.identifier && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {state.fieldErrors.identifier}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="auth-reg-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Parol
                </label>
                <div className="relative">
                  <input
                    id="auth-reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={state.password}
                    onChange={(e) => {
                      clearMessages();
                      const password = e.target.value;
                      const v = validatePassword(password);
                      const c = validatePasswordConfirm(password, state.confirmPassword);
                      setPartialState({
                        password,
                        fieldErrors: {
                          ...state.fieldErrors,
                          password: password ? (v.isValid ? undefined : v.error) : undefined,
                          confirmPassword: state.confirmPassword
                            ? (c.isValid ? undefined : c.error)
                            : state.fieldErrors.confirmPassword,
                        },
                      });
                    }}
                    placeholder="Kamida 8 ta belgi"
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={state.loading}
                    minLength={8}
                    maxLength={128}
                    aria-invalid={Boolean(state.fieldErrors.password)}
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
                {state.fieldErrors.password ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {state.fieldErrors.password}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">Kamida 8 ta belgidan iborat xavfsiz parol kiriting</p>
                )}
              </div>

              <div>
                <label htmlFor="auth-reg-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Parolni tasdiqlang
                </label>
                <div className="relative">
                  <input
                    id="auth-reg-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={state.confirmPassword}
                    onChange={(e) => {
                      clearMessages();
                      const confirmPassword = e.target.value;
                      const c = validatePasswordConfirm(state.password, confirmPassword);
                      setPartialState({
                        confirmPassword,
                        fieldErrors: {
                          ...state.fieldErrors,
                          confirmPassword: confirmPassword ? (c.isValid ? undefined : c.error) : undefined,
                        },
                      });
                    }}
                    placeholder="Parolni qayta kiriting"
                    className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900"
                    disabled={state.loading}
                    minLength={8}
                    maxLength={128}
                    aria-invalid={Boolean(state.fieldErrors.confirmPassword)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 p-1 rounded-lg"
                    aria-label={showConfirmPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {state.fieldErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {state.fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {state.selectedRole === 'worker' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="auth-education" className="block text-sm font-medium text-gray-700 mb-1">
                      {t('auth.education_level', { defaultValue: "Ta'lim darajasi" })}
                    </label>
                    <SafeSelect
                      id="auth-education"
                      value={state.educationLevel}
                      onChange={(e) => {
                        clearMessages();
                        setPartialState({ educationLevel: e.target.value });
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900 text-sm"
                      disabled={state.loading}
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
                      value={state.profession}
                      onChange={(e) => {
                        clearMessages();
                        setPartialState({ profession: e.target.value });
                      }}
                      className="w-full min-h-[44px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-900 text-sm"
                      disabled={state.loading}
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

              <button
                type="submit"
                disabled={state.loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                {state.loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={18} className="animate-spin" aria-hidden /> Yaratilmoqda...
                  </span>
                ) : (
                  'Ro‘yxatdan o‘tish'
                )}
              </button>
            </form>
          )}

          {state.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3" role="alert">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
              <p className="text-red-800 text-sm">{state.error}</p>
            </div>
          )}

          {state.success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3" role="status">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              <p className="text-green-800 text-sm">{state.success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
