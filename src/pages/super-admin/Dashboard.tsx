import React, { useEffect, useState } from 'react';
import { AlertTriangle, Briefcase, Clock, RefreshCw, Shield, ShieldCheck, TrendingDown, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import SuperAdminLiveMap from '../../components/map/SuperAdminLiveMap';
import { api } from '../../lib/api';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';
import type { AdminDashboardKpi } from '../../types';

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<AdminDashboardKpi>({
    onlineWorkers: 0,
    activeOrders: 0,
    todayOrders: 0,
    totalOrders: 0,
    avgMatchSeconds: 0,
    cancelRatePercent: 0,
    openSos: 0,
    pendingKyc: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.kpi();
      setKpi(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useRealtimeEvents(true, (eventType) => {
    if (eventType === 'sos_alert' || eventType === 'order_updated') {
      void loadData();
    }
  });

  const cards = [
    {
      label: t('super_admin.online_workers'),
      value: kpi.onlineWorkers,
      icon: Users,
      accent: 'border-l-[#1a7c78]',
      link: '/super-admin/workers',
    },
    {
      label: t('super_admin.active_orders'),
      value: kpi.activeOrders,
      icon: Briefcase,
      accent: 'border-l-[#102833]',
      link: '/super-admin/orders',
    },
    {
      label: t('super_admin.today_orders'),
      value: kpi.todayOrders,
      icon: Clock,
      accent: 'border-l-[#c6a15b]',
      link: '/super-admin/orders',
    },
    {
      label: t('super_admin.avg_match_sec'),
      value: `${kpi.avgMatchSeconds} s`,
      icon: Clock,
      accent: 'border-l-[#1a7c78]',
      link: '/super-admin/analytics',
    },
    {
      label: t('super_admin.cancel_rate'),
      value: `${kpi.cancelRatePercent}%`,
      icon: TrendingDown,
      accent: 'border-l-slate-500',
      link: '/super-admin/analytics',
    },
    {
      label: t('super_admin.open_sos'),
      value: kpi.openSos,
      icon: AlertTriangle,
      accent: 'border-l-rose-600',
      link: '/super-admin/sos',
    },
    {
      label: t('super_admin.pending_kyc'),
      value: kpi.pendingKyc,
      icon: ShieldCheck,
      accent: 'border-l-amber-500',
      link: '/super-admin/verification',
    },
  ];

  return (
    <DashboardLayout title={t('super_admin.nav_dashboard')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <Shield className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                {t('super_admin.nav_dashboard')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('superAdmin.subtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-xs font-bold text-foreground hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('onboarding.refresh_kyc')}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.link}
              className={`rounded-2xl border border-border border-l-4 ${card.accent} bg-card p-4 transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground">{card.label}</span>
                <card.icon className="h-4 w-4 text-[#1a7c78]" />
              </div>
              <div className="text-2xl font-black text-foreground tabular-nums">{card.value}</div>
            </Link>
          ))}
        </div>

        <SuperAdminLiveMap height="600px" />
      </div>
    </DashboardLayout>
  );
}
