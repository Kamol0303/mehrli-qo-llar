import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';
import { api } from '../../lib/api';
import { formatSom } from '../../constants/yandexServices';
import type { OrgSubscription } from '../../types';
import { useAuth } from '../../hooks/useAuth';

export default function OrgSubscriptionPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.organization.getSubscription();
      setSubscription(res.subscription);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await api.organization.requestSubscription({
        companyName: companyName.trim() || profile?.fullName,
        planName: t('common.annual_org_subscription'),
      });
      setSubscription(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DrawerPageShell title={t('drawer.org_subscription')}>
      <div className="rounded-2xl border border-[#1a7c78]/40 border-l-4 border-l-[#1a7c78] bg-[#1a7c78]/5 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-[#1a7c78] shrink-0 mt-0.5" />
        <p className="text-sm font-extrabold text-foreground">{t('drawer.free_for_women_families')}</p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#1a7c78]" />
        </div>
      ) : subscription ? (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-extrabold text-foreground">
              <Building2 className="h-5 w-5 text-[#1a7c78]" />
              {subscription.companyName}
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-bold uppercase text-[#1a7c78]">
              <CheckCircle className="h-3.5 w-3.5" />
              {t(`super_admin.sub_status_${subscription.status}`, { defaultValue: subscription.status })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {subscription.planName === 'Yillik tashkilot obunasi'
              ? t('common.annual_org_subscription')
              : subscription.planName}
          </p>
          <p className="text-lg font-black text-foreground tabular-nums">
            {formatSom(subscription.annualPriceSom, i18n.language)} / {t('common.per_year')}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {new Date(subscription.startsAt).toLocaleDateString(
              i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ',
            )} — {new Date(subscription.expiresAt).toLocaleDateString(
              i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ',
            )}
          </p>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-foreground">{t('drawer.org_plan_note')}</h2>
          </div>
          <div>
            <label htmlFor="org-name" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('onboarding.company_name')}
            </label>
            <input
              id="org-name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#102833] text-sm font-extrabold text-white hover:opacity-95 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('drawer.request_org_plan')}
          </button>
        </form>
      )}
    </DrawerPageShell>
  );
}
