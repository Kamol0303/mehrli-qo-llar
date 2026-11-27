import React, { useEffect, useState } from 'react';
import { debugLogger } from '../../lib/debugLogger';
import DashboardLayout from '../../components/DashboardLayout';
import InviteWorkerModal from '../../components/map/InviteWorkerModal';
import { useAuth } from '../../hooks/useAuth';
import { api, EmployerWorker } from '../../lib/api';
import { contractService } from '../../services/contractService';
import { jobService } from '../../services/jobService';
import { Job } from '../../types';
import {
  Briefcase,
  CheckCircle,
  Clock,
  MapPin,
  TrendingUp,
  Users,
  ChevronRight,
  Plus,
  Sparkles,
  Star,
  ShieldCheck,
  Send,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import { uz, ru, enUS } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { getDistrictKey, toJsDate } from '../../lib/utils';
import { formatSom } from '../../constants/yandexServices';

export default function EmployerDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState({
    activeJobs: 0,
    activeContracts: 0,
    totalSpent: 0,
  });
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [recommendedWorkers, setRecommendedWorkers] = useState<EmployerWorker[]>([]);
  const [inviteWorker, setInviteWorker] = useState<EmployerWorker | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) return;

    const load = async () => {
      try {
        const [employerJobs, contracts, recWorkers] = await Promise.all([
          jobService.getByEmployer(profile.uid),
          contractService.getByEmployer(profile.uid),
          api.employer.recommendedWorkers().catch(() => ({ data: [] })),
        ]);

        setMyJobs(employerJobs.slice(0, 5));
        setRecommendedWorkers(recWorkers?.data || []);
        setStats({
          activeJobs: employerJobs.filter((j) => j.status === 'open' || j.status === 'active').length,
          activeContracts: contracts.filter((c) => c.status === 'active').length,
          totalSpent: contracts
            .filter((c) => c.status === 'completed')
            .reduce((acc, c) => acc + (c.amount || 0), 0),
        });
        setLoading(false);
      } catch (error) {
        debugLogger.error('Employer dashboard error:', error);
        setLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, [profile]);

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'ru':
        return ru;
      case 'en':
        return enUS;
      default:
        return uz;
    }
  };

  const statCards = [
    {
      label: t('employer.dashboard.active_jobs'),
      value: stats.activeJobs,
      icon: Briefcase,
      color: 'bg-blue-600',
      shadow: 'shadow-blue-500/20',
    },
    {
      label: t('employer.dashboard.active_contracts'),
      value: stats.activeContracts,
      icon: CheckCircle,
      color: 'bg-emerald-600',
      shadow: 'shadow-emerald-500/20',
    },
    {
      label: t('employer.dashboard.total_spent'),
      value: formatSom(stats.totalSpent, i18n.language),
      icon: TrendingUp,
      color: 'bg-amber-600',
      shadow: 'shadow-amber-600/20',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              {t('employer.dashboard.welcome', { name: profile?.fullName?.split(' ')[0] || '' })}
            </h2>
            <p className="text-muted-foreground mt-1.5 font-medium">{t('employer.dashboard.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/employer/create-job"
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-lg hover:opacity-95 transition-all"
            >
              <Plus className="w-5 h-5" />
              {t('employer.dashboard.create_new_job')}
            </Link>
            <Link
              to="/employer/nearby-workers"
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-card border border-border text-foreground rounded-2xl font-bold text-sm hover:bg-secondary transition-all"
            >
              <MapPin className="w-5 h-5 text-primary" />
              {t('employer.dashboard.find_on_map')}
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {statCards.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="bg-card p-6 rounded-3xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`${stat.color} p-3.5 rounded-2xl text-white shadow-lg ${stat.shadow}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-black text-foreground tracking-tight">{stat.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Smart Matched Workers ("Sizga Mos Ishchilar") */}
        {recommendedWorkers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xl font-black text-foreground tracking-tight">{t('employer.dashboard.matched_workers_title')}</h3>
                  <p className="text-xs text-muted-foreground">{t('employer.dashboard.matched_workers_sub')}</p>
                </div>
              </div>
              <Link
                to="/employer/nearby-workers"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                {t('employer.dashboard.all_on_map')} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendedWorkers.slice(0, 3).map((worker) => (
                <div
                  key={worker.uid}
                  className="bg-card p-5 rounded-3xl border border-border shadow-sm hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-secondary overflow-hidden border border-border shrink-0">
                      {worker.photoUrl ? (
                        <img src={worker.photoUrl} alt={worker.fullName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <User size={22} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-foreground truncate">{worker.fullName}</h4>
                        <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                          {t('employer.dashboard.match_percent', { percent: worker.matchScore || 90 })}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-primary truncate">
                        {worker.profession || (worker.skills?.[0] ? t(`skills.${worker.skills[0]}`, { defaultValue: worker.skills[0] }) : t('employer.dashboard.specialist_fallback'))}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                          <Star size={12} fill="currentColor" /> {worker.rating?.toFixed(1) || '4.8'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {worker.distanceLabel || t('employer.dashboard.nearby_label')}
                        </span>
                        {worker.isVerified && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold">
                            <ShieldCheck size={12} /> {t('common.verified')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setInviteWorker(worker)}
                      className="flex-1 min-h-[40px] rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-95"
                    >
                      <Send size={14} /> {t('employer.dashboard.send_invite')}
                    </button>
                    <Link
                      to={`/worker/${worker.uid}`}
                      className="min-h-[40px] px-3 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center justify-center hover:bg-secondary/80"
                    >
                      {t('common.profile')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* My Jobs */}
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
                <div className="w-2 h-7 bg-primary rounded-full" />
                {t('employer.dashboard.my_jobs')}
              </h3>
              <Link
                to="/employer/create-job"
                className="text-xs font-bold text-primary hover:underline"
              >
                {t('employer.dashboard.new_ad_plus')}
              </Link>
            </div>

            <div className="space-y-4">
              {loading ? (
                Array(3)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="h-28 bg-card rounded-3xl animate-pulse border border-border shadow-sm" />
                  ))
              ) : myJobs.length > 0 ? (
                myJobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-card p-6 rounded-3xl border border-border flex flex-col sm:flex-row sm:items-center justify-between hover:border-primary/40 hover:shadow-md transition-all group"
                  >
                    <div className="flex gap-4 items-center mb-4 sm:mb-0">
                      <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center border border-border">
                        <Briefcase className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-black text-foreground text-lg">{job.title}</h4>
                        <div className="flex flex-wrap items-center gap-4 mt-1 text-xs font-semibold text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-primary" />
                            {job.district
                              ? t(`districts.${getDistrictKey(job.district)}`, { defaultValue: job.district })
                              : t('districts.samarqand_shahri')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {job.scheduledAt
                              ? format(toJsDate(job.scheduledAt) || new Date(), 'd MMM, HH:mm', { locale: getDateLocale() })
                              : format(toJsDate(job.createdAt) || new Date(), 'd MMM', { locale: getDateLocale() })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-6 pt-4 sm:pt-0 border-t sm:border-t-0 border-border">
                      <div className="text-right">
                        <p className="text-lg font-black text-primary tracking-tight">
                          {formatSom(job.price ?? job.salary ?? 0, i18n.language)}
                        </p>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider mt-1 ${
                            job.status === 'open' || job.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-secondary text-muted-foreground border border-border'
                          }`}
                        >
                          {job.status === 'open' || job.status === 'active'
                            ? t('employer.dashboard.active')
                            : t('employer.dashboard.closed')}
                        </span>
                      </div>
                      <Link
                        to={`/employer/jobs/${job.id}`}
                        className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-card rounded-3xl p-12 text-center border border-border shadow-sm">
                  <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                    <Briefcase size={32} />
                  </div>
                  <p className="text-muted-foreground font-bold text-base mb-6">{t('employer.dashboard.no_jobs')}</p>
                  <Link
                    to="/employer/create-job"
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-lg"
                  >
                    <Plus size={18} /> {t('employer.dashboard.create_new_job')}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
              <h4 className="font-black text-white uppercase tracking-widest text-xs">
                {t('employer.dashboard.quick_actions')}
              </h4>
              <div className="space-y-2.5">
                <Link
                  to="/employer/create-job"
                  className="flex items-center justify-between p-4 bg-primary/20 rounded-2xl border border-primary/40 hover:border-primary transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Plus className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold text-white">{t('employer.dashboard.post_in_30s')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white" />
                </Link>
                <Link
                  to="/employer/nearby-workers"
                  className="flex items-center justify-between p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 hover:border-blue-500 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold text-white">{t('employer.dashboard.find_worker_map')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
                </Link>
                <Link
                  to="/directory"
                  className="flex items-center justify-between p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 hover:border-blue-500 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold text-white">{t('employer.dashboard.worker_base')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
                </Link>
                <Link
                  to="/employer/contracts"
                  className="flex items-center justify-between p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 hover:border-emerald-500 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold text-white">{t('employer.dashboard.apps_and_contracts')}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InviteWorkerModal
        worker={inviteWorker}
        isOpen={Boolean(inviteWorker)}
        onClose={() => setInviteWorker(null)}
      />
    </DashboardLayout>
  );
}
