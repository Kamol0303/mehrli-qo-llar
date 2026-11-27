import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';
import { api } from '../../lib/api';
import { formatSom } from '../../constants/yandexServices';

export default function WorkerEarningsPage() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    totalEarned: number;
    completedCount: number;
    items: Array<{
      id: string;
      serviceType: string;
      durationType: string;
      amount: number;
      employerName: string | null;
      completedAt: string | null;
    }>;
  } | null>(null);

  useEffect(() => {
    api.workerLive
      .getEarnings()
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : t('errors.unexpected')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <DrawerPageShell title={t('drawer.earnings')}>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border border-l-4 border-l-[#1a7c78] bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Wallet className="h-4 w-4 text-[#1a7c78]" />
                {t('dashboard.earnings')}
              </div>
              <div className="mt-2 text-xl font-black text-foreground tabular-nums">
                {formatSom(data?.totalEarned || 0, i18n.language)}
              </div>
            </div>
            <div className="rounded-2xl border border-border border-l-4 border-l-[#c6a15b] bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-[#c6a15b]" />
                {t('dashboard.completed_jobs')}
              </div>
              <div className="mt-2 text-xl font-black text-foreground tabular-nums">
                {data?.completedCount || 0}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {(data?.items || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">
                    {t(`services.${item.serviceType}`)} · {t(`durations.${item.durationType}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.employerName || '—'} · {item.completedAt ? new Date(item.completedAt).toLocaleDateString(
                      i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ',
                    ) : '—'}
                  </p>
                </div>
                <span className="text-sm font-black text-[#1a7c78] tabular-nums shrink-0">
                  +{formatSom(item.amount, i18n.language)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </DrawerPageShell>
  );
}
