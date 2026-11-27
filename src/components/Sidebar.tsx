import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard,
  Briefcase,
  FileText,
  MessageSquare,
  User,
  Bell,
  ShieldCheck,
  LogOut,
  Users,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  MapPin,
  Activity,
  Building2,
  Banknote,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

import { useTranslation } from 'react-i18next';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();

  const menuItems = {
    worker: [
      { icon: MapPin, label: t('mobile_nav.home'), path: '/', end: true },
      { icon: Briefcase, label: t('drawer.job_history'), path: '/orders-history', end: true },
      { icon: ShieldCheck, label: t('drawer.kyc_status'), path: '/verification', end: true },
      { icon: User, label: t('drawer.profile'), path: '/my-profile', end: true },
      { icon: Bell, label: t('nav.sidebar.notifications'), path: '/notifications', end: true },
    ],
    employer: [
      { icon: MapPin, label: t('mobile_nav.home'), path: '/', end: true },
      { icon: Briefcase, label: t('drawer.my_jobs'), path: '/orders-history', end: true },
      { icon: Building2, label: t('drawer.org_subscription'), path: '/organization/subscription', end: true },
      { icon: User, label: t('drawer.profile'), path: '/my-profile', end: true },
      { icon: Bell, label: t('nav.sidebar.notifications'), path: '/notifications', end: true },
    ],
    admin: [
      { icon: BarChart3, label: t('nav.sidebar.overview'), path: '/admin/dashboard', end: true },
      { icon: Users, label: t('nav.sidebar.users'), path: '/admin/users', end: false },
      { icon: Briefcase, label: t('nav.sidebar.jobs'), path: '/admin/jobs', end: false },
      { icon: CheckCircle, label: t('nav.sidebar.contracts'), path: '/admin/contracts', end: false },
      { icon: AlertTriangle, label: t('nav.sidebar.disputes'), path: '/admin/disputes', end: false },
      { icon: Sliders, label: t('nav.sidebar.settings'), path: '/admin/settings', end: true },
    ],
    super_admin: [
      { icon: LayoutDashboard, label: t('super_admin.nav_dashboard'), path: '/super-admin/dashboard', end: true },
      { icon: Briefcase, label: t('super_admin.nav_orders'), path: '/super-admin/orders', end: false },
      { icon: Users, label: t('super_admin.nav_workers'), path: '/super-admin/workers', end: false },
      { icon: Building2, label: t('super_admin.nav_employers'), path: '/super-admin/employers', end: false },
      { icon: ShieldCheck, label: t('super_admin.nav_kyc'), path: '/super-admin/verification', end: false },
      { icon: FileText, label: t('super_admin.nav_contracts'), path: '/super-admin/contracts', end: false },
      { icon: AlertTriangle, label: t('super_admin.nav_disputes'), path: '/super-admin/disputes', end: false },
      { icon: AlertTriangle, label: t('super_admin.nav_sos'), path: '/super-admin/sos', end: false },
      { icon: Banknote, label: t('super_admin.nav_tariffs'), path: '/super-admin/tariffs', end: false },
      { icon: Sliders, label: t('super_admin.nav_matching'), path: '/super-admin/matching', end: false },
      { icon: Building2, label: t('super_admin.nav_organizations'), path: '/super-admin/organizations', end: false },
      { icon: BarChart3, label: t('super_admin.nav_analytics'), path: '/super-admin/analytics', end: false },
      { icon: Activity, label: t('super_admin.nav_logs'), path: '/super-admin/logs', end: false },
    ],
  };

  const currentMenu = profile?.role ? menuItems[profile.role] : [];

  return (
    <aside className="w-72 bg-[#102833] border-r border-[#c6a15b]/30 h-screen sticky top-0 flex flex-col z-50">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-[#1a7c78]/30 ring-2 ring-[#c6a15b]/70 overflow-hidden p-1">
            <img
              src="/assets/brand/logo.png"
              alt={t('common.branding_short')}
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">{t('common.branding_short')}</h1>
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">{t('common.national_platform')}</p>
      </div>

      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
        {currentMenu.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            end={item.end}
            className={({ isActive }) => cn(
              "flex items-center gap-3.5 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden",
              isActive
                ? "bg-[#1a7c78] text-white shadow-xl shadow-[#1a7c78]/25 font-bold"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", isActive ? "text-white" : "text-slate-500 group-hover:text-blue-400")} />
                <span className="text-sm tracking-wide">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-800/50 space-y-3">
        <div className="bg-slate-800/30 rounded-[24px] p-4 border border-slate-800/50 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center overflow-hidden">
              {profile?.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.fullName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-white truncate">
                {profile?.role === 'super_admin' && /^super[\s_-]?admin$/i.test(profile?.fullName || '')
                  ? t('auth.admin')
                  : profile?.fullName}
              </p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{t(`auth.${profile?.role}`)}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-rose-400 hover:text-white hover:bg-rose-500/20 transition-all border border-rose-500/10"
        >
          <LogOut size={18} />
          <span className="text-sm font-bold">{t('common.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
