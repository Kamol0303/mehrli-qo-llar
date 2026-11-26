import React, { useEffect, useState } from 'react';
import { Ban, CheckCircle, Loader2, RefreshCw, ShieldCheck, Star, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';

type AdminWorkerRow = Awaited<ReturnType<typeof api.adminYandex.workers>>['workers'][number];

export default function SuperAdminWorkersPage() {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<AdminWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.workers();
      setWorkers(res.workers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleBlock = async (row: AdminWorkerRow) => {
    setBusyId(row.uid);
    try {
      const next = !row.isBlocked;
      await api.adminYandex.setUserBlock(row.uid, next, next ? 'Admin moderation' : undefined);
      setWorkers((prev) => prev.map((w) => (w.uid === row.uid ? { ...w, isBlocked: next } : w)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_workers')}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1a7c78] text-white">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_workers')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{workers.length}</p>
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

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('auth.full_name')}</th>
                  <th className="px-4 py-3">KYC</th>
                  <th className="px-4 py-3">{t('profile.rating')}</th>
                  <th className="px-4 py-3">Acceptance %</th>
                  <th className="px-4 py-3">{t('contract.status')}</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workers.map((w) => (
                  <tr key={w.uid} className="hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-foreground">{w.fullName}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{w.phoneNumber || '—'} · {w.district || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {w.isVerified ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[#1a7c78]">
                          <ShieldCheck className="h-3.5 w-3.5" /> {t('yandex.verified_badge')}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-bold">{w.verificationStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                        {Number(w.rating || 0).toFixed(1)} ({w.reviewCount})
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{w.acceptanceRate}% ({w.acceptedOffers}/{w.totalOffers})</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${w.isOnline ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {w.isOnline ? 'Online' : 'Offline'}
                      </span>
                      {w.isBlocked && <span className="ml-2 font-bold text-rose-600">Blocked</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === w.uid}
                        onClick={() => void toggleBlock(w)}
                        className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 text-xs font-bold text-white ${
                          w.isBlocked ? 'bg-[#1a7c78]' : 'bg-rose-600'
                        }`}
                      >
                        {w.isBlocked ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {w.isBlocked ? t('super_admin.unblock') : t('super_admin.block')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
