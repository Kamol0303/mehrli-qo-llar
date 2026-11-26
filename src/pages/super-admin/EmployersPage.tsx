import React, { useEffect, useState } from 'react';
import { Ban, Building2, CheckCircle, Loader2, RefreshCw, ShieldCheck, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';

type AdminEmployerRow = Awaited<ReturnType<typeof api.adminYandex.employers>>['employers'][number];

export default function SuperAdminEmployersPage() {
  const { t } = useTranslation();
  const [employers, setEmployers] = useState<AdminEmployerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.employers();
      setEmployers(res.employers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleBlock = async (row: AdminEmployerRow) => {
    setBusyId(row.uid);
    try {
      const next = !row.isBlocked;
      await api.adminYandex.setUserBlock(row.uid, next, next ? 'Admin moderation' : undefined);
      setEmployers((prev) => prev.map((e) => (e.uid === row.uid ? { ...e, isBlocked: next } : e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_employers')}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <Building2 className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_employers')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{employers.length}</p>
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
                  <th className="px-4 py-3">Telegram / Phone</th>
                  <th className="px-4 py-3">{t('super_admin.nav_orders')}</th>
                  <th className="px-4 py-3">{t('profile.rating')}</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employers.map((emp) => (
                  <tr key={emp.uid} className="hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-foreground">{emp.companyName || emp.fullName}</p>
                      {emp.companyName && <p className="text-[11px] text-muted-foreground">{emp.fullName}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <div className="flex items-center gap-1.5">
                        {emp.telegramVerified && <ShieldCheck className="h-3.5 w-3.5 text-[#1a7c78]" />}
                        <span>{emp.telegram ? `@${emp.telegram}` : '—'}</span>
                        <span>· {emp.phoneNumber || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{emp.ordersCount}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                        {Number(emp.rating || 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === emp.uid}
                        onClick={() => void toggleBlock(emp)}
                        className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 text-xs font-bold text-white ${
                          emp.isBlocked ? 'bg-[#1a7c78]' : 'bg-rose-600'
                        }`}
                      >
                        {emp.isBlocked ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {emp.isBlocked ? t('super_admin.unblock') : t('super_admin.block')}
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
