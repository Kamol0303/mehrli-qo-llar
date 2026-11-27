import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Home,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  UserCheck,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../lib/authService';
import { api } from '../lib/api';
import type { Profile, VerificationRequest } from '../types';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';

const BRAND_LOGO = '/assets/brand/logo.png';
const LANG_CHOSEN_KEY = 'mq_lang_chosen';

type Step =
  | 'language'
  | 'login'
  | 'phone'
  | 'role'
  | 'employer_setup'
  | 'worker_kyc'
  | 'permissions';

export default function OnboardingFlow() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile, setAuthProfile } = useAuth();

  const search = new URLSearchParams(location.search);
  const autostart = search.get('autostart') === '1';

  const [step, setStep] = useState<Step>(() => {
    if (autostart) return 'login';
    try {
      return localStorage.getItem(LANG_CHOSEN_KEY) ? 'login' : 'language';
    } catch {
      return 'language';
    }
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Password & Phone Auth States
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => {
    return search.get('mode') === 'register' ? 'register' : 'login';
  });
  const [loginPhone, setLoginPhone] = useState(() => {
    try {
      return localStorage.getItem('mq_saved_phone') || '+998';
    } catch {
      return '+998';
    }
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Registration Form State
  const [regPhone, setRegPhone] = useState('+998');
  const [regFullName, setRegFullName] = useState('');
  const [regRole, setRegRole] = useState<'worker' | 'employer'>('worker');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Onboarding profile inputs
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [selectedRole, setSelectedRole] = useState<'employer' | 'worker'>('employer');
  const [employerKind, setEmployerKind] = useState<'family' | 'organization'>('family');
  const [companyName, setCompanyName] = useState('');
  const [orgDocUrl, setOrgDocUrl] = useState('');

  // Worker KYC
  const [kycRequest, setKycRequest] = useState<VerificationRequest | null>(null);
  const [idPhotoUrl, setIdPhotoUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Sync local inputs when profile loads
  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'super_admin' || profile.role === 'admin') {
      if (!Capacitor.isNativePlatform()) {
        navigate('/super-admin/dashboard', { replace: true });
      }
      return;
    }

    setFullName((prev) => prev || profile.fullName || '');
    setPhone((prev) => (prev !== '+998' ? prev : profile.phoneNumber || '+998'));
    if (profile.role === 'worker' || profile.role === 'employer') {
      setSelectedRole(profile.role);
    }
    if (profile.companyName) {
      setEmployerKind('organization');
      setCompanyName(profile.companyName);
    }

    if (profile.onboardingCompleted) {
      navigate('/', { replace: true });
      return;
    }

    // Decide resume step for partially onboarded account
    if (!profile.phoneNumber) {
      setStep('phone');
    } else if (!profile.permissionsAcknowledged) {
      setStep('role');
    }
  }, [profile, navigate]);

  const loadMyKyc = useCallback(async () => {
    if (!user) return;
    try {
      const req = await api.verificationRequests.mine();
      setKycRequest(req);
    } catch {
      setKycRequest(null);
    }
  }, [user]);

  useEffect(() => {
    if (step === 'worker_kyc' && user) {
      void loadMyKyc();
    }
  }, [step, user, loadMyKyc]);

  useRealtimeEvents(Boolean(user && step === 'worker_kyc'), (evt) => {
    if (evt === 'verification_updated') {
      void refreshProfile();
      void loadMyKyc();
    }
  });

  const chooseLanguage = async (code: 'uz' | 'ru' | 'en') => {
    await i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANG_CHOSEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setStep(user ? (profile?.phoneNumber ? 'role' : 'phone') : 'login');
  };

  const formatUzPhone = (val: string) => {
    let digits = val.replace(/\D/g, '');
    if (digits.startsWith('998')) {
      digits = digits.slice(3);
    }
    digits = digits.slice(0, 9);
    return digits ? `+998${digits}` : '+998';
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = authService.normalizePhoneNumber(loginPhone);
    if (!/^\+998\d{9}$/.test(normalized)) {
      setError(t('auth.err_phone_format'));
      return;
    }
    if (!loginPassword) {
      setError(t('auth.err_enter_password'));
      return;
    }
    if (loginPassword.length < 8) {
      setError(t('auth.err_password_min_8'));
      return;
    }

    setBusy(true);
    try {
      const result = await authService.loginWithPassword(normalized, loginPassword);
      if (!result.success || !result.profile) {
        setError(result.error ? t(result.error, { defaultValue: result.error }) : t('auth.err_invalid_credentials'));
        return;
      }
      if (rememberMe) {
        try {
          localStorage.setItem('mq_saved_phone', normalized);
        } catch {
          /* ignore */
        }
      }
      setAuthProfile(result.profile);
      const p: Profile = result.profile;
      if (p.role === 'super_admin' || p.role === 'admin') {
        navigate('/super-admin/dashboard', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.err_login_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = authService.normalizePhoneNumber(regPhone);
    if (!/^\+998\d{9}$/.test(normalized)) {
      setError(t('auth.err_phone_format'));
      return;
    }
    if (regFullName.trim().length < 2) {
      setError(t('auth.err_full_name_req'));
      return;
    }
    if (regPassword.length < 8) {
      setError(t('auth.err_password_min_8'));
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError(t('auth.err_passwords_match'));
      return;
    }

    setBusy(true);
    try {
      const result = await authService.registerWithPassword({
        identifier: normalized,
        password: regPassword,
        fullName: regFullName.trim(),
        role: regRole,
      });
      if (!result.success || !result.profile) {
        setError(result.error ? t(result.error, { defaultValue: result.error }) : t('auth.err_register_failed'));
        return;
      }
      try {
        localStorage.setItem('mq_saved_phone', normalized);
      } catch {
        /* ignore */
      }
      setAuthProfile(result.profile);
      const p: Profile = result.profile;
      if (p.role === 'super_admin' || p.role === 'admin') {
        navigate('/super-admin/dashboard', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.err_register_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = authService.normalizePhoneNumber(phone);
    if (!/^\+998\d{9}$/.test(normalized)) {
      setError(t('auth.error_phone_format'));
      return;
    }
    if (fullName.trim().length < 2) {
      setError(t('onboarding.full_name_label'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.completeOnboarding({
        fullName: fullName.trim(),
        phoneNumber: normalized,
      });
      if (res.user) {
        setAuthProfile({ ...(profile as Profile), ...res.user });
      } else {
        await refreshProfile();
      }
      setStep('role');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleRoleSelect = async (role: 'employer' | 'worker') => {
    setSelectedRole(role);
    setError('');
    setBusy(true);
    try {
      const res = await api.auth.completeOnboarding({ role });
      if (res.user) {
        setAuthProfile({ ...(profile as Profile), ...res.user, role });
      }
      setStep(role === 'employer' ? 'employer_setup' : 'worker_kyc');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (
    file: File | undefined,
    kind: 'verification_id' | 'verification_selfie' | 'document',
    onDone: (url: string) => void,
  ) => {
    if (!file) return;
    setUploadingField(kind);
    setError('');
    try {
      const res = await api.uploads.upload(file, kind);
      onDone(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verification.upload_error'));
    } finally {
      setUploadingField(null);
    }
  };

  const handleEmployerSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (employerKind === 'organization' && companyName.trim().length < 2) {
      setError(t('onboarding.company_name'));
      return;
    }
    setBusy(true);
    try {
      await api.auth.completeOnboarding({
        role: 'employer',
        isOrganization: employerKind === 'organization',
        companyName: employerKind === 'organization' ? companyName.trim() : undefined,
        companyDocuments: orgDocUrl ? [{ url: orgDocUrl, title: 'Tashkilot hujjati' }] : undefined,
      });
      await refreshProfile();
      setStep('permissions');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idPhotoUrl || !selfieUrl) {
      setError(t('verification.documents_required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      let next: VerificationRequest;
      if (kycRequest && (kycRequest.status === 'rejected' || kycRequest.status === 'need_reupload')) {
        next = await api.verificationRequests.update(kycRequest.id, {
          idPhotoUrl,
          documentUrl: idPhotoUrl,
          selfieUrl,
          documentType: 'passport',
        });
      } else {
        next = await api.verificationRequests.create({
          idPhotoUrl,
          documentUrl: idPhotoUrl,
          selfieUrl,
          documentType: 'passport',
        });
      }
      setKycRequest(next);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verification.submit_error'));
    } finally {
      setBusy(false);
    }
  };

  const finishPermissions = async (requestNativeAndBrowserPerms: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (requestNativeAndBrowserPerms && typeof window !== 'undefined') {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            () => undefined,
            () => undefined,
            { timeout: 4000 },
          );
        }
        if ('Notification' in window && Notification.permission === 'default') {
          try {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
              await api.auth.registerPushToken(`web_${profile?.uid || 'device'}`, 'web').catch(() => undefined);
            }
          } catch {
            /* ignore */
          }
        }
      }
      await api.auth.completeOnboarding({
        role: selectedRole,
        permissionsAcknowledged: true,
      });
      await refreshProfile();
      navigate('/', { replace: true });
    } catch {
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO}
              alt="Mehrli Qo'llar"
              className="w-11 h-11 rounded-2xl object-contain bg-white p-1 border border-[#c6a15b]/50"
            />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-[#102833] dark:text-white">
                Mehrli Qo‘llar
              </h1>
              <p className="text-xs text-muted-foreground">{t('onboarding.splash_subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-secondary p-1 rounded-xl">
            {(['uz', 'ru', 'en'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => void i18n.changeLanguage(lng)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                  (i18n.resolvedLanguage || i18n.language || 'uz').startsWith(lng)
                    ? 'bg-[#102833] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-xs font-medium text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {step === 'language' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.choose_language')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('onboarding.language_hint')}</p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void chooseLanguage('uz')}
                className="w-full min-h-[56px] flex items-center justify-between px-5 py-4 rounded-2xl border border-border bg-secondary/40 hover:border-primary hover:bg-primary/5 transition-all font-bold text-base"
              >
                <span>O‘zbekcha</span>
                <span className="text-xs text-muted-foreground">UZ</span>
              </button>
              <button
                type="button"
                onClick={() => void chooseLanguage('ru')}
                className="w-full min-h-[56px] flex items-center justify-between px-5 py-4 rounded-2xl border border-border bg-secondary/40 hover:border-primary hover:bg-primary/5 transition-all font-bold text-base"
              >
                <span>Русский</span>
                <span className="text-xs text-muted-foreground">RU</span>
              </button>
              <button
                type="button"
                onClick={() => void chooseLanguage('en')}
                className="w-full min-h-[56px] flex items-center justify-between px-5 py-4 rounded-2xl border border-border bg-secondary/40 hover:border-primary hover:bg-primary/5 transition-all font-bold text-base"
              >
                <span>English</span>
                <span className="text-xs text-muted-foreground">EN</span>
              </button>
            </div>
          </div>
        )}

        {step === 'login' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">
                {authMode === 'login' ? t('auth.login_mode_tab') : t('auth.register_mode_tab')}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {authMode === 'login'
                  ? t('auth.login_mode_sub')
                  : t('auth.register_mode_sub')}
              </p>
            </div>

            {/* Segmented control: Kirish / Ro'yxatdan o'tish */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-secondary rounded-2xl border border-border/60">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setError(''); }}
                className={`min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#102833] text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>{t('auth.login_mode_tab')}</span>
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setError(''); }}
                className={`min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-[#1a7c78] text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>{t('auth.register_mode_tab')}</span>
              </button>
            </div>

            {/* LOGIN FORM */}
            {authMode === 'login' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.enter_phone')}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      autoComplete="username tel"
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.enter_password')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder={t('auth.enter_password_placeholder')}
                      autoComplete="current-password"
                      className="w-full min-h-[48px] pl-11 pr-11 py-3 rounded-2xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                      tabIndex={-1}
                      aria-label={showLoginPassword ? t('auth.hide_password') : t('auth.show_password')}
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember me checkbox */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary border-border cursor-pointer accent-[#1a7c78]"
                    />
                    <span className="text-xs font-medium text-foreground">
                      {t('auth.remember_device')}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[52px] flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#102833] hover:bg-[#0c1f28] text-white font-extrabold text-sm shadow-lg shadow-[#102833]/20 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                  <span>{busy ? t('auth.logging_in') : t('auth.login_mode_tab')}</span>
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('register'); setError(''); }}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    {t('auth.dont_have_account_register')}
                  </button>
                </div>
              </form>
            ) : (
              /* REGISTRATION FORM */
              <form onSubmit={handlePasswordRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.enter_phone')}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      autoComplete="username tel"
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.enter_full_name')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder={t('auth.full_name_placeholder')}
                      autoComplete="name"
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                {/* Role selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.platform_role')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegRole('worker')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        regRole === 'worker'
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      }`}
                    >
                      <p className="text-xs font-black text-foreground">{t('auth.role_worker_badge')}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{t('auth.role_worker_sub')}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole('employer')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        regRole === 'employer'
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      }`}
                    >
                      <p className="text-xs font-black text-foreground">{t('auth.role_employer_badge')}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{t('auth.role_employer_sub')}</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.enter_password_reg')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder={t('auth.enter_password_placeholder')}
                      autoComplete="new-password"
                      className="w-full min-h-[48px] pl-11 pr-11 py-3 rounded-2xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                      tabIndex={-1}
                      aria-label={showRegPassword ? t('auth.hide_password') : t('auth.show_password')}
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground block">
                    {t('auth.confirm_password')}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder={t('auth.confirm_password_placeholder')}
                      autoComplete="new-password"
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[52px] flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#1a7c78] hover:bg-[#156865] text-white font-extrabold text-sm shadow-lg shadow-[#1a7c78]/25 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  <span>{busy ? t('auth.registering') : t('auth.register_mode_tab')}</span>
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setError(''); }}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    {t('auth.already_have_account_login')}
                  </button>
                </div>
              </form>
            )}

            <div className="pt-2 text-center">
              <Link
                to="/privacy"
                className="text-[11px] font-semibold text-muted-foreground underline hover:text-foreground"
              >
                {t('privacy.link_label')}
              </Link>
            </div>
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handlePhoneSave} className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.phone_title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('onboarding.phone_subtitle')}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground block">
                {t('onboarding.full_name_label')}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('onboarding.full_name_placeholder')}
                className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground block">
                {t('profile.phone_number')}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('onboarding.phone_placeholder')}
                  className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-[#102833] text-white font-bold text-sm hover:opacity-95 transition-opacity disabled:opacity-60"
            >
              {busy ? t('auth.saving') : t('auth.continue')}
            </button>
          </form>
        )}

        {step === 'role' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.role_title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('onboarding.role_subtitle')}</p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRoleSelect('employer')}
                className="w-full text-left p-5 rounded-2xl border border-border bg-secondary/35 hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-[#102833] text-white flex items-center justify-center shrink-0">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-extrabold text-base text-foreground">{t('onboarding.role_employer_title')}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('onboarding.role_employer_desc')}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRoleSelect('worker')}
                className="w-full text-left p-5 rounded-2xl border border-border bg-secondary/35 hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-[#1a7c78] text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-extrabold text-base text-foreground">{t('onboarding.role_worker_title')}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('onboarding.role_worker_desc')}
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 'employer_setup' && (
          <form onSubmit={handleEmployerSetup} className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.employer_setup_title')}</h2>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-secondary rounded-2xl">
              <button
                type="button"
                onClick={() => setEmployerKind('family')}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  employerKind === 'family' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {t('onboarding.employer_type_family')}
              </button>
              <button
                type="button"
                onClick={() => setEmployerKind('organization')}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  employerKind === 'organization' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {t('onboarding.employer_type_org')}
              </button>
            </div>

            {employerKind === 'organization' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1.5">
                    {t('onboarding.company_name')}
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full min-h-[48px] pl-11 pr-4 py-3 rounded-2xl border border-border bg-background text-sm font-medium"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1.5">
                    {t('onboarding.company_doc')}
                  </label>
                  <label className="flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-2xl border border-dashed border-[#c6a15b]/60 bg-secondary/40 cursor-pointer text-xs font-bold">
                    {uploadingField === 'document' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 text-primary" />
                    )}
                    <span>{orgDocUrl ? t('auth.doc_uploaded_success') : t('verification.choose_file')}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) =>
                        void handleUploadFile(e.target.files?.[0], 'document', setOrgDocUrl)
                      }
                    />
                  </label>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-[#102833] text-white font-bold text-sm hover:opacity-95 disabled:opacity-60"
            >
              {busy ? t('auth.saving') : t('auth.continue')}
            </button>
          </form>
        )}

        {step === 'worker_kyc' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.worker_kyc_title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('onboarding.worker_kyc_desc')}</p>
            </div>

            {profile?.isVerified && profile.verificationStatus === 'verified' ? (
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 space-y-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <p className="font-bold text-emerald-900 dark:text-emerald-200">
                  {t('verification.approved_title')}
                </p>
                <button
                  type="button"
                  onClick={() => setStep('permissions')}
                  className="w-full min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm"
                >
                  {t('auth.continue')}
                </button>
              </div>
            ) : kycRequest && (kycRequest.status === 'pending' || kycRequest.status === 'under_review') ? (
              <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-amber-950 dark:text-amber-200">
                      {t('onboarding.worker_kyc_pending')}
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                      {t('onboarding.worker_kyc_pending_desc')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void refreshProfile();
                      void loadMyKyc();
                    }}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white text-amber-900 text-xs font-bold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('onboarding.refresh_kyc')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('permissions')}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#102833] text-white text-xs font-bold"
                  >
                    {t('auth.continue')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitKyc} className="space-y-4">
                {kycRequest && (kycRequest.status === 'rejected' || kycRequest.status === 'need_reupload') && (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-800 dark:text-rose-200">
                      <p className="font-bold">{t('onboarding.worker_kyc_rejected')}</p>
                      <p className="mt-1">{kycRequest.rejectionReason || kycRequest.reviewNote}</p>
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl border border-dashed border-[#c6a15b]/70 bg-secondary/40 cursor-pointer">
                  <span className="flex items-center gap-3 text-xs font-bold">
                    <FileText className="w-5 h-5 text-primary" />
                    <span>{idPhotoUrl ? t('verification.id_submitted') : t('verification.upload_id')}</span>
                  </span>
                  {uploadingField === 'verification_id' && <Loader2 className="w-4 h-4 animate-spin" />}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadFile(e.target.files?.[0], 'verification_id', setIdPhotoUrl)
                    }
                  />
                </label>

                <label className="flex items-center justify-between min-h-[56px] px-4 py-3 rounded-2xl border border-dashed border-[#c6a15b]/70 bg-secondary/40 cursor-pointer">
                  <span className="flex items-center gap-3 text-xs font-bold">
                    <Camera className="w-5 h-5 text-primary" />
                    <span>{selfieUrl ? t('verification.selfie_submitted') : t('verification.take_selfie')}</span>
                  </span>
                  {uploadingField === 'verification_selfie' && <Loader2 className="w-4 h-4 animate-spin" />}
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadFile(e.target.files?.[0], 'verification_selfie', setSelfieUrl)
                    }
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || !idPhotoUrl || !selfieUrl}
                    className="flex-1 min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-xs disabled:opacity-50"
                  >
                    {busy ? t('verification.submitting') : t('verification.submit_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('permissions')}
                    className="min-h-[48px] px-4 rounded-2xl border border-border text-xs font-bold text-muted-foreground"
                  >
                    {t('onboarding.skip_manual')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {step === 'permissions' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">{t('onboarding.permissions_title')}</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {t('onboarding.permissions_desc')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/45">
                <MapPin className="w-5 h-5 text-[#1a7c78] shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  {t('onboarding.perm_location')}
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/45">
                <Bell className="w-5 h-5 text-[#c6a15b] shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  {t('onboarding.perm_notifications')}
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/45">
                <ShieldCheck className="w-5 h-5 text-[#102833] dark:text-primary shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  {t('onboarding.privacy_note')}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishPermissions(true)}
                className="w-full min-h-[52px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm shadow-lg shadow-[#1a7c78]/20"
              >
                {t('onboarding.allow_and_start')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishPermissions(false)}
                className="w-full min-h-[44px] rounded-2xl text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {t('onboarding.skip_manual')}
              </button>
              <div className="pt-1 text-center">
                <Link
                  to="/privacy"
                  className="text-[11px] font-semibold text-muted-foreground underline hover:text-foreground"
                >
                  {t('privacy.link_label')}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
