import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Save, Sliders } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import type { MatchingSettings } from '../../types';

export default function SuperAdminMatchingPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState<MatchingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.adminYandex
      .getMatchingSettings()
      .then((res) => setForm(res))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.adminYandex.updateMatchingSettings(form);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<{ key: keyof MatchingSettings; label: string; step: string; min: number; hint?: string }> = [
    { key: 'weightDistance', label: t('super_admin.weight_distance'), step: '1', min: 0 },
    { key: 'weightRating', label: t('super_admin.weight_rating'), step: '1', min: 0 },
    { key: 'weightAcceptance', label: t('super_admin.weight_acceptance'), step: '1', min: 0 },
    { key: 'weightService', label: t('super_admin.weight_service'), step: '1', min: 0 },
    { key: 'initialRadiusKm', label: t('super_admin.initial_radius'), step: '1', min: 1 },
    { key: 'radiusStepKm', label: t('super_admin.radius_step'), step: '1', min: 1 },
    { key: 'maxRadiusKm', label: t('super_admin.max_radius'), step: '1', min: 1 },
    {
      key: 'offerTimeoutSec',
      label: t('super_admin.offer_timeout_sec'),
      step: '5',
      min: 0,
      hint: t('super_admin.matching_timeout_hint'),
    },
    { key: 'liveLocationTtlSec', label: t('super_admin.live_location_ttl'), step: '5', min: 10 },
  ];

  return (
    <DashboardLayout title={t('super_admin.nav_matching')}>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
            <Sliders className="h-6 w-6 text-[#c6a15b]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_matching')}</h1>
          </div>
        </div>

        {loading || !form ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`match-${f.key}`} className="mb-1 block text-xs font-bold text-muted-foreground">
                    {f.label}
                  </label>
                  <input
                    id={`match-${f.key}`}
                    type="number"
                    min={f.min}
                    step={f.step}
                    value={form[f.key] as number}
                    onChange={(e) =>
                      setForm((prev) => (prev ? { ...prev, [f.key]: Number(e.target.value) } : prev))
                    }
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-bold tabular-nums"
                  />
                  {f.hint && (
                    <p className="mt-1 text-[11px] font-medium text-[#1a7c78]">{f.hint}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1a7c78] px-5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('super_admin.save_settings')}
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  {t('common.success')}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
