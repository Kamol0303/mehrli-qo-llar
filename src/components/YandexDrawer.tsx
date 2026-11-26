import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  CreditCard,
  Globe,
  HelpCircle,
  History,
  LogOut,
  Shield,
  ShieldCheck,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { Profile } from '../types';
import { normalizeLanguageCode } from '../lib/utils';

interface YandexDrawerProps {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  hasActiveOrder: boolean;
  onSignOut: () => Promise<void>;
  onOpenHelp: () => void;
}

export default function YandexDrawer({
  open,
  onClose,
  profile,
  hasActiveOrder,
  onSignOut,
  onOpenHelp,
}: YandexDrawerProps) {
  const { t, i18n } = useTranslation();
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!open) return null;

  const isWorker = profile?.role === 'worker';
  const currentLang = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language);

  const employerLinks = [
    { icon: User, label: t('drawer.profile'), to: '/my-profile' },
    { icon: History, label: t('drawer.my_jobs'), to: '/orders-history' },
    { icon: CreditCard, label: t('drawer.payment_methods'), to: '/payment-methods' },
    { icon: Users, label: t('drawer.trusted_contacts'), to: '/trusted-contacts' },
    { icon: Shield, label: t('drawer.safety'), to: '/safety' },
    { icon: Building2, label: t('drawer.org_subscription'), to: '/organization/subscription' },
  ];

  const workerLinks = [
    { icon: User, label: t('drawer.profile'), to: '/my-profile' },
    { icon: Wallet, label: t('drawer.earnings'), to: '/worker/earnings' },
    { icon: History, label: t('drawer.job_history'), to: '/orders-history' },
    { icon: ShieldCheck, label: t('drawer.kyc_status'), to: '/verification' },
    { icon: Users, label: t('drawer.trusted_contacts'), to: '/trusted-contacts' },
    { icon: Shield, label: t('drawer.safety'), to: '/safety' },
  ];

  const links = isWorker ? workerLinks : employerLinks;

  const handleLogoutClick = async () => {
    if (hasActiveOrder && !confirmLogout) {
      setConfirmLogout(true);
      return;
    }
    setConfirmLogout(false);
    onClose();
    await onSignOut();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-xs"
      />
      <aside
        aria-label={t('drawer.menu')}
        className="relative z-10 w-[84vw] max-w-[330px] h-full bg-card border-r border-border shadow-2xl flex flex-col"
      >
        <div className="p-5 bg-[#102833] text-white flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-[#c6a15b]/60 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.fullName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-sm truncate">{profile?.fullName || 'Mehrli Qo‘llar'}</p>
              <p className="text-xs text-slate-300 truncate tabular-nums">
                {profile?.phoneNumber || ''} · ★ {(profile?.rating ?? 5).toFixed(1)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className="flex items-center gap-3.5 min-h-[48px] px-4 py-3 rounded-2xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              <item.icon className="w-5 h-5 text-[#1a7c78] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenHelp();
            }}
            className="w-full flex items-center gap-3.5 min-h-[48px] px-4 py-3 rounded-2xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors text-left"
          >
            <HelpCircle className="w-5 h-5 text-[#1a7c78] shrink-0" />
            <span>{t('drawer.help')}</span>
          </button>

          <div className="px-4 py-3 space-y-2 border-t border-border mt-2 pt-3">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <Globe className="w-4 h-4" />
              <span>{t('drawer.language')}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-secondary p-1 rounded-xl">
              {(['uz', 'ru', 'en'] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => void i18n.changeLanguage(lng)}
                  className={`min-h-[38px] rounded-lg text-xs font-bold uppercase transition-colors ${
                    currentLang === lng
                      ? 'bg-[#102833] text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lng}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          {confirmLogout && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-900 dark:text-amber-200">
              {t('drawer.active_logout_warning')}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleLogoutClick()}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold text-sm hover:bg-rose-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('drawer.logout')}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
