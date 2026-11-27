import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle, Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { formatSom } from '../../constants/yandexServices';
import type { OrgSubscription } from '../../types';

export default function SuperAdminOrganizationsPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2);
  const dateLocale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
  const [subscriptions, setSubscriptions] = useState<OrgSubscription[]>([]);
  const [employers, setEmployers] = useState<Array<{ uid: string; fullName: string; companyName: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [employerId, setEmployerId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [planName, setPlanName] = useState('');
  const [annualPriceSom, setAnnualPriceSom] = useState('2400000');

  const load = async () => {
    setLoading(true);
    try {
      const [subsRes, empRes] = await Promise.all([
        api.adminYandex.listOrgSubscriptions(),
        api.adminYandex.employers(),
      ]);
      setSubscriptions(subsRes.subscriptions || []);
      setEmployers(empRes.employers || []);
      if (!employerId && empRes.employers?.[0]) {
        setEmployerId(empRes.employers[0].uid);
        setCompanyName(empRes.employers[0].companyName || empRes.employers[0].fullName);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerId || !companyName.trim()) return;
    setCreating(true);
    try {
      await api.adminYandex.createOrgSubscription({
        employerId,
        companyName: companyName.trim(),
        planName: planName.trim() || t('common.annual_org_subscription'),
        annualPriceSom: Number(annualPriceSom) || 2400000,
        status: 'active',
      });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleStatus = async (id: string, status: 'active' | 'pending' | 'expired' | 'cancelled') => {
    await api.adminYandex.updateOrgSubscription(id, status);
    setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  return (
    <DashboardLayout title={t('super_admin.nav_organizations')}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
            <Building2 className="h-6 w-6 text-[#c6a15b]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_organizations')}</h1>
            <p className="text-xs text-muted-foreground">{t('drawer.free_for_women_families')}</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-5 gap-3 rounded-2xl border border-border bg-card p-4">
          <select
            value={employerId}
            onChange={(e) => {
              const uid = e.target.value;
              setEmployerId(uid);
              const found = employers.find((x) => x.uid === uid);
              if (found) setCompanyName(found.companyName || found.fullName);
            }}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
            aria-label={t('super_admin.nav_employers')}
          >
            {employers.map((emp) => (
              <option key={emp.uid} value={emp.uid}>
                {emp.companyName || emp.fullName}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t('onboarding.company_name')}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
          />
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder={t('common.annual_org_subscription')}
            aria-label={t('common.annual_org_subscription')}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
          />
          <input
            type="number"
            value={annualPriceSom}
            onChange={(e) => setAnnualPriceSom(e.target.value)}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold tabular-nums"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#1a7c78] px-4 text-xs font-extrabold text-white"
          >
            <Plus className="h-4 w-4" />
            {t('auth.add')}
          </button>
        </form>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <div>
                  <p className="text-sm font-black text-foreground">{sub.companyName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {sub.planName} · {formatSom(sub.annualPriceSom, i18n.language)} · {new Date(sub.startsAt).toLocaleDateString(dateLocale)} — {new Date(sub.expiresAt).toLocaleDateString(dateLocale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(['active', 'pending', 'expired', 'cancelled'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void handleStatus(sub.id, st)}
                      className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold ${
                        sub.status === st ? 'bg-[#102833] text-white' : 'border border-border bg-background'
                      }`}
                    >
                      {sub.status === st && <CheckCircle className="h-3 w-3 text-[#c6a15b]" />}
                      {t(`super_admin.sub_status_${st}`)}
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
