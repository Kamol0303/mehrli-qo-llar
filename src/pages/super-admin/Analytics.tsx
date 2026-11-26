import React, { useEffect, useState } from 'react';
import { BarChart3, CheckCircle, Loader2, RefreshCw, Star, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { formatSom } from '../../constants/yandexServices';
import type { AdminAnalyticsData } from '../../types';

export default function SuperAdminAnalytics() {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.analytics();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <DashboardLayout title={t('super_admin.nav_analytics')}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <BarChart3 className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_analytics')}</h1>
              <p className="text-xs text-muted-foreground">{t('superAdmin.platformMetrics')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('onboarding.refresh_kyc')}
          </button>
        </div>

        {loading || !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border border-l-4 border-l-[#102833] bg-card p-5">
                <p className="text-xs font-bold text-muted-foreground">{t('super_admin.nav_orders')}</p>
                <p className="mt-2 text-2xl font-black text-foreground tabular-nums">{data.totalOrders}</p>
              </div>
              <div className="rounded-2xl border border-border border-l-4 border-l-[#1a7c78] bg-card p-5">
                <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5 text-[#1a7c78]" /> Match %
                </p>
                <p className="mt-2 text-2xl font-black text-[#1a7c78] tabular-nums">{data.matchRatePercent}%</p>
              </div>
              <div className="rounded-2xl border border-border border-l-4 border-l-[#c6a15b] bg-card p-5">
                <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5 text-[#c6a15b]" /> {t('drawer.earnings')}
                </p>
                <p className="mt-2 text-2xl font-black text-foreground tabular-nums">
                  {formatSom(data.totalWorkerEarnings)} so‘m
                </p>
              </div>
              <div className="rounded-2xl border border-border border-l-4 border-l-amber-500 bg-card p-5">
                <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" /> {t('profile.rating')}
                </p>
                <p className="mt-2 text-2xl font-black text-foreground tabular-nums">
                  {data.avgWorkerRating} / 5
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="text-sm font-black text-foreground">{t('super_admin.nav_orders')}</h2>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                    <span className="font-bold">{t('yandex.status_qabul_qilindi')}</span>
                    <span className="font-black tabular-nums">{data.matchedCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                    <span className="font-bold">{t('yandex.status_yakunlandi')}</span>
                    <span className="font-black tabular-nums">{data.completedCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                    <span className="font-bold">{t('yandex.status_bekor_qilindi')}</span>
                    <span className="font-black tabular-nums">{data.cancelledCount}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="text-sm font-black text-foreground">{t('yandex.select_service')}</h2>
                <div className="space-y-2 text-xs">
                  {data.byService.map((row) => (
                    <div key={row.serviceType} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                      <span className="font-bold">{t(`services.${row.serviceType}`, { defaultValue: row.serviceType })}</span>
                      <span className="font-black tabular-nums">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-black text-foreground">{t('super_admin.cancel_rate')}</h2>
              {data.cancelReasons.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {data.cancelReasons.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                      <span>{r.reason}</span>
                      <span className="font-black tabular-nums">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
