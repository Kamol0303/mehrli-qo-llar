import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Shield, Lock, AlertCircle, Eye, EyeOff, KeyRound, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { toUserMessage } from '../lib/api/errors';
import { useAuth } from '../hooks/useAuth';
import { normalizeLanguageCode } from '../lib/utils';

export default function SuperAdminLogin() {
  if (Capacitor.isNativePlatform()) {
    return <Navigate to="/403" replace />;
  }
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setAuthProfile } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLang = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language);

  useEffect(() => {
    let active = true;
    api.auth
      .superAdminStatus()
      .then((status) => {
        if (active) setNeedsSetup(Boolean(status.needsSetup));
      })
      .catch(() => {
        if (active) setNeedsSetup(false);
      })
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!login.trim() || !password) {
      setError(t('auth.err_login_password_req'));
      return;
    }
    if (needsSetup) {
      if (password.length < 8) {
        setError(t('auth.err_password_min_8'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('auth.err_passwords_not_match'));
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      localStorage.removeItem('qulay_ish_demo_session');
      const result = needsSetup
        ? await api.auth.superAdminSetup(login.trim(), password)
        : await api.auth.superAdminLogin(login.trim(), password);
      setAuthProfile(result.user);
      navigate('/super-admin/dashboard');
    } catch (err) {
      setError(toUserMessage(err, t('auth.err_invalid_credentials')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1a22] via-[#102833] to-[#0d222b] flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, #c6a15b 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-8 md:p-10 shadow-2xl">
          {/* Top language toggle */}
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
              <Globe className="w-3.5 h-3.5 text-white/60 ml-1.5 mr-0.5" />
              {(['uz', 'ru', 'en'] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => void i18n.changeLanguage(lng)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                    currentLang === lng
                      ? 'bg-[#1a7c78] text-white shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {lng}
                </button>
              ))}
            </div>
          </div>

          <div className="text-center mb-7">
            <div className="w-16 h-16 bg-[#1a7c78] border border-[#c6a15b]/40 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xl">
              {needsSetup ? <KeyRound size={30} className="text-white" /> : <Shield size={32} className="text-white" />}
            </div>
            <h1 className="text-2xl font-black text-white mb-1.5 tracking-tight">
              {needsSetup ? t('auth.super_admin_setup_title') : t('auth.super_admin_env_title')}
            </h1>
            <p className="text-[#c6a15b] text-xs font-bold uppercase tracking-wider">
              {needsSetup
                ? t('auth.super_admin_first_run')
                : t('auth.super_admin_control_center')}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="mb-5 p-3.5 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-3 text-rose-200"
            >
              <AlertCircle size={18} className="flex-shrink-0" />
              <p className="text-xs font-medium">{error}</p>
            </motion.div>
          )}

          {checkingStatus ? (
            <div className="py-10 flex justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="sa-login" className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-1.5">
                  {t('auth.login_or_phone_label')}
                </label>
                <input
                  id="sa-login"
                  type="text"
                  required
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:ring-2 focus:ring-[#1a7c78] focus:border-transparent outline-none transition-all text-sm"
                  placeholder={t('auth.login_or_phone_placeholder')}
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="sa-password" className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-1.5">
                  {t('auth.enter_password')}
                </label>
                <div className="relative">
                  <input
                    id="sa-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:ring-2 focus:ring-[#1a7c78] focus:border-transparent outline-none transition-all pr-12 text-sm"
                    placeholder="••••••••"
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#1a7c78] rounded-lg p-1"
                    aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {needsSetup && (
                <div>
                  <label htmlFor="sa-confirm" className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-1.5">
                    {t('auth.confirm_password')}
                  </label>
                  <input
                    id="sa-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/40 focus:ring-2 focus:ring-[#1a7c78] focus:border-transparent outline-none transition-all text-sm"
                    placeholder={t('auth.confirm_password_placeholder')}
                    autoComplete="new-password"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1a7c78] hover:bg-[#156865] text-white py-3.5 rounded-2xl font-extrabold text-base transition-all shadow-xl shadow-[#1a7c78]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('auth.checking_status')}
                  </>
                ) : needsSetup ? (
                  <>
                    <KeyRound size={18} />
                    {t('auth.setup_and_login_btn')}
                  </>
                ) : (
                  <>
                    <Lock size={18} />
                    {t('auth.login_mode_tab')}
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-xs text-white/60 text-center leading-relaxed">
              {t('auth.super_admin_notice')}
            </p>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-white/60 hover:text-white transition-colors font-medium"
            >
              {t('auth.back_to_platform')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

