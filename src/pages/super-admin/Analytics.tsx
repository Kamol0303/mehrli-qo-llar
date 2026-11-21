import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { BarChart3, TrendingUp, Users, Briefcase, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { api } from '../../lib/api';
import { toUserMessage } from '../../lib/api/errors';
import type { Profile } from '../../types';

interface StatsCounts {
  users: number;
  jobs: number;
  applications: number;
  contracts: number;
  workers: number;
  employers: number;
  activeJobs: number;
  pendingApplications: number;
  activeContracts: number;
  completedContracts: number;
}

export default function SuperAdminAnalytics() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<StatsCounts | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([api.stats.counts(), api.users.list()]);
      setCounts(statsRes);
      setUsers(usersRes);
    } catch (err) {
      setError(toUserMessage(err, "Analitika ma'lumotlarini yuklab bo'lmadi."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const metrics = useMemo(() => {
    const totalUsers = counts?.users ?? users.length;
    const verifiedCount = users.filter((u) => u.isVerified).length;
    const verifiedPct = totalUsers > 0 ? Math.round((verifiedCount / totalUsers) * 100) : 0;

    const totalContracts = counts?.contracts ?? 0;
    const completedContracts = counts?.completedContracts ?? 0;
    const completionPct = totalContracts > 0 ? Math.round((completedContracts / totalContracts) * 100) : 0;

    const ratedUsers = users.filter((u) => typeof u.rating === 'number' && u.rating > 0);
    const avgRating =
      ratedUsers.length > 0
        ? ratedUsers.reduce((sum, u) => sum + Number(u.rating || 0), 0) / ratedUsers.length
        : 0;
    const ratingPct = Math.min(100, Math.round((avgRating / 5) * 100));

    const totalJobs = counts?.jobs ?? 0;
    const activeJobs = counts?.activeJobs ?? 0;
    const activeJobPct = totalJobs > 0 ? Math.round((activeJobs / totalJobs) * 100) : 0;

    return [
      {
        id: 'verified-users',
        label: t('superAdmin.metrics.userGrowth', { defaultValue: 'Tasdiqlangan foydalanuvchilar' }),
        value: `${verifiedCount} / ${totalUsers} (${verifiedPct}%)`,
        color: 'text-green-600',
        bg: 'bg-green-50',
        icon: Users,
        bar: verifiedPct,
        barColor: 'bg-green-500',
      },
      {
        id: 'contract-completion',
        label: t('superAdmin.metrics.jobCompletionRate', { defaultValue: 'Shartnoma yakunlanish ulushi' }),
        value: totalContracts > 0 ? `${completionPct}% (${completedContracts}/${totalContracts})` : '0%',
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        icon: Briefcase,
        bar: completionPct,
        barColor: 'bg-blue-500',
      },
      {
        id: 'platform-rating',
        label: t('superAdmin.metrics.platformSatisfaction', { defaultValue: "O'rtacha platforma reytingi" }),
        value: ratedUsers.length > 0 ? `${avgRating.toFixed(1)} / 5.0` : '—',
        color: 'text-purple-600',
        bg: 'bg-purple-50',
        icon: CheckCircle,
        bar: ratingPct,
        barColor: 'bg-purple-500',
      },
      {
        id: 'active-jobs',
        label: t('superAdmin.metrics.systemUptime', { defaultValue: 'Faol vakansiyalar ulushi' }),
        value: `${activeJobs} / ${totalJobs} (${activeJobPct}%)`,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        icon: TrendingUp,
        bar: activeJobPct,
        barColor: 'bg-emerald-500',
      },
    ];
  }, [counts, users, t]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                {t('superAdmin.actions.analytics')}
              </h1>
              <p className="text-gray-500 text-sm font-medium">{t('superAdmin.platformMetrics')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yangilash
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-red-700 text-sm font-medium" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {loading
            ? [1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 h-40 animate-pulse" />
              ))
            : metrics.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8"
                >
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div className={`${m.bg} p-3 rounded-2xl`}>
                      <m.icon size={22} className={m.color} />
                    </div>
                    <span className={`text-xl font-black ${m.color}`}>{m.value}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-600 mb-3">{m.label}</p>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${m.barColor} h-2 rounded-full transition-all duration-700`}
                      style={{ width: `${Math.max(0, Math.min(100, m.bar))}%` }}
                    />
                  </div>
                </motion.div>
              ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
