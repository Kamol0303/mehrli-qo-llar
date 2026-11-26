import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, MapPin, Phone, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';
import type { SosIncident } from '../../types';

export default function SuperAdminSosPage() {
  const { t } = useTranslation();
  const [incidents, setIncidents] = useState<SosIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.listSos();
      setIncidents(res.incidents || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useRealtimeEvents(true, (eventType) => {
    if (eventType === 'sos_alert') void load();
  });

  const updateStatus = async (id: string, status: 'yangi' | 'korilmoqda' | 'yopildi') => {
    setBusyId(id);
    try {
      await api.adminYandex.updateSos(id, status);
      setIncidents((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_sos')}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_sos')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{incidents.length}</p>
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

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-rose-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border border-border border-l-4 ${
                  item.status === 'yangi'
                    ? 'border-l-rose-600'
                    : item.status === 'korilmoqda'
                      ? 'border-l-amber-500'
                      : 'border-l-emerald-600'
                } bg-card p-5 space-y-3 shadow-sm`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-foreground">{item.userName || item.userId}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 tabular-nums">
                      <Phone className="h-3.5 w-3.5" />
                      {item.trustedContactSummary || item.userRole} · {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-md border border-border px-2.5 py-1 text-xs font-black uppercase">
                    {item.status === 'yangi'
                      ? t('super_admin.sos_new')
                      : item.status === 'korilmoqda'
                        ? t('super_admin.sos_review')
                        : t('super_admin.sos_closed')}
                  </span>
                </div>

                {item.message && <p className="text-xs text-foreground">{item.message}</p>}

                {item.lat != null && item.lng != null && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                    <MapPin className="h-3.5 w-3.5 text-rose-600" />
                    {Number(item.lat).toFixed(5)}, {Number(item.lng).toFixed(5)}
                  </p>
                )}

                {item.trustedContactSummary && (
                  <p className="text-xs font-semibold text-[#1a7c78]">{item.trustedContactSummary}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(['yangi', 'korilmoqda', 'yopildi'] as const).map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      disabled={busyId === item.id || item.status === nextStatus}
                      onClick={() => void updateStatus(item.id, nextStatus)}
                      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
                        item.status === nextStatus
                          ? 'bg-[#102833] text-white'
                          : 'border border-border bg-background text-foreground hover:bg-secondary'
                      }`}
                    >
                      {item.status === nextStatus && <CheckCircle className="h-3.5 w-3.5 text-[#c6a15b]" />}
                      {nextStatus === 'yangi'
                        ? t('super_admin.sos_new')
                        : nextStatus === 'korilmoqda'
                          ? t('super_admin.sos_review')
                          : t('super_admin.sos_closed')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
