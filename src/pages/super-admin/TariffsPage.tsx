import React, { useEffect, useState } from 'react';
import { Banknote, CheckCircle, Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { formatSom, YANDEX_DURATIONS, YANDEX_SERVICES } from '../../constants/yandexServices';
import type { TariffRate, YandexDurationType, YandexServiceType } from '../../types';

export default function SuperAdminTariffsPage() {
  const { t } = useTranslation();
  const [rates, setRates] = useState<TariffRate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Array<{
    id: string;
    serviceType: string;
    durationType: string;
    oldRateSom: number;
    newRateSom: number;
    changedByName: string | null;
    changedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.getTariffs();
      setRates(res.rates || []);
      setHistory(res.history || []);
      const map: Record<string, string> = {};
      for (const r of res.rates || []) {
        map[`${r.serviceType}_${r.durationType}`] = String(r.rateSom);
      }
      setDrafts(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (serviceType: YandexServiceType, durationType: YandexDurationType) => {
    const key = `${serviceType}_${durationType}`;
    const rateSom = Number(drafts[key]);
    if (!Number.isFinite(rateSom) || rateSom <= 0) return;
    setSavingKey(key);
    try {
      await api.adminYandex.updateTariff({ serviceType, durationType, rateSom });
      setSavedKey(key);
      await load();
      setTimeout(() => setSavedKey(null), 2000);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_tariffs')}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
            <Banknote className="h-6 w-6 text-[#c6a15b]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_tariffs')}</h1>
            <p className="text-xs text-muted-foreground">{rates.length}</p>
          </div>
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
                  <th className="px-4 py-3">{t('yandex.select_service')}</th>
                  {YANDEX_DURATIONS.map((dur) => (
                    <th key={dur.id} className="px-4 py-3">{t(dur.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {YANDEX_SERVICES.map((svc) => (
                  <tr key={svc.id}>
                    <td className="px-4 py-3 font-extrabold text-foreground">{t(svc.labelKey)}</td>
                    {YANDEX_DURATIONS.map((dur) => {
                      const key = `${svc.id}_${dur.id}`;
                      return (
                        <td key={dur.id} className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1000}
                              step={5000}
                              value={drafts[key] || ''}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="w-28 min-h-[38px] rounded-lg border border-border bg-background px-2.5 text-xs font-bold tabular-nums"
                              aria-label={`${svc.id} ${dur.id}`}
                            />
                            <button
                              type="button"
                              disabled={savingKey === key}
                              onClick={() => void handleSave(svc.id, dur.id)}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-[#1a7c78] px-2.5 text-xs font-bold text-white"
                            >
                              {savingKey === key ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : savedKey === key ? (
                                <CheckCircle className="h-3.5 w-3.5" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                              {t('super_admin.save_rate')}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-black text-foreground uppercase tracking-wider">History</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-xs">
                <span className="font-bold">
                  {t(`services.${h.serviceType}`)} · {t(`durations.${h.durationType}`)}
                </span>
                <span className="tabular-nums">
                  {formatSom(h.oldRateSom)} → <strong className="text-[#1a7c78]">{formatSom(h.newRateSom)}</strong> so‘m
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {h.changedByName || 'Admin'} · {new Date(h.changedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
