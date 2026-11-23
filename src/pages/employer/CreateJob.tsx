import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { SERVICE_DIRECTIONS } from '../../constants/categories';
import { REGIONS, DISTRICTS } from '../../constants/locations';
import {
  Briefcase,
  MapPin,
  Banknote,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { useTranslation } from 'react-i18next';
import SafeSelect from '../../components/SafeSelect';

export default function CreateJob() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 6 Essential Fields (Requirement #11)
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    region: profile?.region || 'Samarqand viloyati',
    district: profile?.district || 'samarkand_city',
    neighborhood: '',
    price: '',
    salaryType: 'kunlik',
    workType: 'one_time',
    workersNeeded: '1',
    scheduledOption: 'today', // today | tomorrow | weekend | custom
    customDate: '',
    requirements: '',
  });

  const handleAiVacancy = async () => {
    if (!formData.title && !formData.category) {
      setError('Iltimos, avval ish nomi yoki toifasini kiriting');
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const res = await api.ai.vacancy({
        title: formData.title,
        category: formData.category,
        description: formData.description,
        requirements: [],
        region: formData.region,
        salary: formData.price,
        language: i18n.resolvedLanguage || i18n.language || 'uz',
      });
      setFormData((prev) => ({ ...prev, description: res.text }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI yordamida tavsif yaratishda xatolik');
    } finally {
      setAiLoading(false);
    }
  };

  const getScheduledAtDate = (): string => {
    const now = new Date();
    if (formData.scheduledOption === 'today') {
      now.setHours(now.getHours() + 4);
      return now.toISOString();
    }
    if (formData.scheduledOption === 'tomorrow') {
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
      return now.toISOString();
    }
    if (formData.scheduledOption === 'weekend') {
      now.setDate(now.getDate() + 3);
      now.setHours(10, 0, 0, 0);
      return now.toISOString();
    }
    if (formData.customDate) {
      const parsed = new Date(formData.customDate);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    now.setHours(now.getHours() + 24);
    return now.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Iltimos, avval tizimga kiring');
      return;
    }

    if (!formData.title.trim()) {
      setError('Ish nomini kiriting');
      return;
    }
    if (!formData.price) {
      setError('To‘lanadigan haq miqdorini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scheduledAt = getScheduledAtDate();
      const requirementsList = formData.requirements
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const created = await api.jobs.create({
        title: formData.title.trim(),
        description: formData.description.trim() || `${formData.title} bo‘yicha sifatli va mas‘uliyatli xodim kerak.`,
        category: formData.category || 'Boshqa',
        price: Number(formData.price) || 0,
        salary: Number(formData.price) || 0,
        salaryType: (formData.salaryType || 'kunlik') as any,
        workType: formData.workType,
        scheduledAt,
        region: formData.region,
        district: formData.district,
        neighborhood: formData.neighborhood.trim() || undefined,
        requirements: requirementsList,
        status: 'open',
      });

      if (created) {
        setSuccess(true);
        setTimeout(() => navigate('/employer/jobs'), 1800);
      } else {
        setError('E‘lonni joylashtirishda xatolik yuz berdi');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const samarkandDistricts = DISTRICTS['Samarqand viloyati'] || [
    'Samarqand shahar',
    'Urgut',
    'Jomboy',
    'Kattaqoʻrgʻon',
    'Pastdargʻom',
    'Bulungʻur',
  ];

  return (
    <DashboardLayout title="Yangi ish joylashtirish">
      <div className="max-w-3xl mx-auto py-6 px-4">
        {/* Top Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-primary">Tezkor Joylash</span>
              <span className="text-[10px] font-bold text-muted-foreground">· 30–60 soniya</span>
            </div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Yangi Ish E‘lonini Joylash</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ishchilarga real vaqtda ko‘rinadi va matching tizimi orqali eng munosiblariga yetkaziladi
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/30">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-10 text-center dark:bg-emerald-950/20">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black text-foreground">Ish muvaffaqiyatli joylashtirildi!</h2>
            <p className="text-xs text-muted-foreground mt-2">
              E‘lon xaritada faollashdi va yaqin atrofdagi mos ishchilarga yetkazilmoqda…
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/employer/nearby-workers"
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
              >
                Xaritadagi ishchilarni ko‘rish
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 1. NIMA ISH? (What work) */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Briefcase className="h-4 w-4" />
                <span>1. Qanday ish va qaysi soha?</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Ish nomi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Masalan: Tajribali tikuvchi kerak, Uy tozalash"
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Soha / Kasb toifasi</label>
                  <SafeSelect
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-foreground focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Toifani tanlang…</option>
                    {SERVICE_DIRECTIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {t(`jobs.directions.${item.id}`, { defaultValue: item.name })}
                      </option>
                    ))}
                  </SafeSelect>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-foreground">Tavsif va vazifalar</label>
                  <button
                    type="button"
                    onClick={handleAiVacancy}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Tavsif yozish
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ish joyi, sharoitlar va talablar haqida qisqacha ma‘lumot…"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            {/* 2. QAYERDA? (Location) */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <MapPin className="h-4 w-4" />
                <span>2. Joylashuv (Qayerda bajariladi?)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Viloyat</label>
                  <SafeSelect
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </SafeSelect>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Tuman / Shahar</label>
                  <SafeSelect
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="samarkand_city">Samarqand shahar</option>
                    <option value="urgut">Urgut</option>
                    <option value="jomboy">Jomboy</option>
                    <option value="kattakurgan">Kattaqo‘rg‘on</option>
                    <option value="pastdargom">Pastdarg‘om</option>
                    <option value="bulungur">Bulung‘ur</option>
                    <option value="payariq">Payariq</option>
                    <option value="ishtixon">Ishtixon</option>
                    <option value="narpay">Narpay</option>
                    <option value="toyloq">Toyloq</option>
                    <option value="qoshrabot">Qo‘shrabot</option>
                  </SafeSelect>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">Mahalla / Ko‘cha</label>
                  <input
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                    placeholder="Masalan: Registon MFY"
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            {/* 3. QACHON VA QANCHA TO'LANADI? (When & How Much) */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Banknote className="h-4 w-4" />
                <span>3. To‘lov va muddat</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    To‘lov miqdori (so‘m) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="Masalan: 200000"
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-foreground focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">To‘lov turi</label>
                  <SafeSelect
                    value={formData.salaryType}
                    onChange={(e) => setFormData({ ...formData, salaryType: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 text-sm text-foreground"
                  >
                    <option value="kunlik">Kunlik to‘lov</option>
                    <option value="soatlik">Soatbay to‘lov</option>
                    <option value="oylik">Oylik maosh</option>
                    <option value="fixed">Kelishilgan ishbay</option>
                  </SafeSelect>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-foreground">Qachon boshlash kerak?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'today', label: 'Bugun tezkor' },
                    { id: 'tomorrow', label: 'Ertaga ertalab' },
                    { id: 'weekend', label: 'Hafta oxiri' },
                    { id: 'custom', label: 'Boshqa sana' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, scheduledOption: opt.id })}
                      className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition-all ${
                        formData.scheduledOption === opt.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {formData.scheduledOption === 'custom' && (
                  <div className="mt-2.5">
                    <input
                      type="datetime-local"
                      value={formData.customDate}
                      onChange={(e) => setFormData({ ...formData, customDate: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 4. TALABLAR (Requirements) */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-3">
              <label className="block text-xs font-bold text-foreground">
                Qo‘shimcha talablar (ixtiyoriy, har birini yangi qatordan)
              </label>
              <textarea
                rows={2}
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                placeholder="Masalan: Tajriba 1 yildan oshgan bo'lishi kerak&#10;O'z asbob-uskunasi bilan kelishi"
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
              />
            </div>

            {/* BIG ACTION: ISHNI JOYLASH */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] rounded-2xl bg-primary hover:opacity-95 text-primary-foreground font-black text-base shadow-xl shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Joylashtirilmoqda…</span>
                  </>
                ) : (
                  <>
                    <span>ISHNI JOYLASH</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
