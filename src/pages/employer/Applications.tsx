import { debugLogger } from '../../lib/debugLogger';
import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import ReviewModal from '../../components/ReviewModal';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { applicationService } from '../../services/applicationService';
import { jobService } from '../../services/jobService';
import { Application, Profile, Job } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Briefcase,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Star,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { uz, ru, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { getDistrictKey, toJsDate } from '../../lib/utils';
import { getOrderStatusLabel, getOrderStatusMeta } from '../../lib/orderStatus';

export default function EmployerApplications() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [applications, setApplications] = useState<(Application & { worker?: Profile; job?: Job })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [reviewApp, setReviewApp] = useState<(Application & { worker?: Profile; job?: Job }) | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const lang = (i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2);

  useEffect(() => {
    if (!profile?.uid) return;
    setLoading(true);

    const load = async () => {
      try {
        const appsData = await applicationService.getByEmployer(profile.uid);
        const combined = await Promise.all(
          appsData.map(async (app) => {
            const worker = await api.users.get(app.workerId).catch(() => undefined);
            const job = await jobService.getById(app.jobId).catch(() => undefined);
            return { ...app, worker, job };
          }),
        );
        setApplications(combined);
      } catch (error) {
        debugLogger.error('Error fetching applications:', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [profile]);

  useEffect(() => {
    const reviewId = searchParams.get('review');
    if (!reviewId || reviewApp) return;
    const match = applications.find((a) => a.id === reviewId);
    if (match && match.status === 'completed' && !(match.employerReviewed || match.reviewed)) {
      setReviewApp(match);
    }
  }, [searchParams, applications, reviewApp]);

  const closeReview = () => {
    setReviewApp(null);
    if (searchParams.get('review')) {
      searchParams.delete('review');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handleStatusUpdate = async (appId: string, newStatus: Application['status']) => {
    setBusyId(appId);
    try {
      let success = false;
      if (newStatus === 'accepted') {
        success = await applicationService.approve(appId);
      } else if (newStatus === 'rejected') {
        success = await applicationService.reject(appId);
      } else if (newStatus === 'completed') {
        success = await applicationService.complete(appId);
      } else {
        success = await applicationService.updateStatus(appId, newStatus);
      }
      if (success) {
        setApplications((prev) => prev.map((app) => (app.id === appId ? { ...app, status: newStatus } : app)));
      }
    } catch (error) {
      debugLogger.error('Error updating application status:', error);
    } finally {
      setBusyId(null);
    }
  };

  const filteredApps = applications.filter((app) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') {
      return ['accepted', 'on_the_way', 'started'].includes(app.status || '');
    }
    return app.status === filterStatus;
  });

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

  const filterTabs = [
    { key: 'all', label: t('common.all', { defaultValue: 'Barchasi' }) },
    { key: 'pending', label: 'Kutilmoqda' },
    { key: 'offer_sent', label: 'Takliflar' },
    { key: 'active', label: 'Jarayonda' },
    { key: 'completed', label: 'Tugallandi' },
    { key: 'rejected', label: 'Rad etildi' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">
              {t('employer.dashboard.applications_management')}
            </h2>
            <p className="text-muted-foreground mt-2">{t('employer.dashboard.applications_management_desc')}</p>
          </div>

          <div className="flex flex-wrap bg-secondary/50 p-1 rounded-2xl border border-border gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  filterStatus === tab.key
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-secondary/50 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : filteredApps.length > 0 ? (
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredApps.map((app) => {
                const statusMeta = getOrderStatusMeta(app.status);
                const isBusy = busyId === app.id;
                const isInProgress = ['accepted', 'on_the_way', 'started'].includes(app.status || '');
                const alreadyReviewed = Boolean(app.employerReviewed || app.reviewed);
                const chatAllowed = !['rejected', 'cancelled', 'withdrawn'].includes(app.status || '');

                return (
                  <motion.div
                    key={app.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card rounded-[32px] border border-border shadow-sm overflow-hidden hover:shadow-md transition-all"
                  >
                    <div className="p-6 sm:p-8">
                      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                        {/* Worker Info */}
                        <div className="flex items-start gap-4 min-w-[230px]">
                          <div className="w-16 h-16 rounded-2xl bg-secondary overflow-hidden border border-border shrink-0">
                            {app.worker?.photoUrl ? (
                              <img src={app.worker.photoUrl} alt={app.worker.fullName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <User size={32} />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xl font-bold text-foreground">
                              {app.worker?.fullName || app.workerName || t('common.unknown_worker')}
                            </h4>
                            <div className="flex items-center gap-1 text-amber-500 text-sm font-bold mt-1">
                              <Star size={14} fill="currentColor" />
                              <span>{app.worker?.rating || '0.0'}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Link to={`/worker/${app.workerId}`} className="text-xs font-bold text-primary hover:underline">
                                {t('profile.view_profile')}
                              </Link>
                            </div>
                          </div>
                        </div>

                        {/* Application Content */}
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              <Briefcase size={14} />
                              <span>
                                {t('jobs.job')}: {app.job?.title || app.jobTitle || t('jobs.deleted_job')}
                              </span>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${statusMeta.badgeBg} ${statusMeta.colorClass}`}
                            >
                              {getOrderStatusLabel(app.status, lang)}
                            </span>
                          </div>

                          <div className="bg-secondary/30 p-4 rounded-2xl border border-border/50 italic text-muted-foreground text-sm leading-relaxed">
                            "{app.coverLetter || app.message || '—'}"
                          </div>

                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground font-medium">
                            <span className="flex items-center gap-1.5">
                              <Clock size={14} />
                              {toJsDate(app.createdAt)
                                ? format(toJsDate(app.createdAt)!, 'd-MMMM, HH:mm', { locale: getDateLocale() })
                                : t('common.recently')}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapPin size={14} />
                              {app.worker?.district
                                ? `${t(`districts.${getDistrictKey(app.worker.district)}`, { defaultValue: app.worker.district })}, `
                                : ''}
                              {t('common.region_name', { defaultValue: app.worker?.region })}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col justify-center gap-2.5 min-w-[210px]">
                          {app.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusUpdate(app.id, 'accepted')}
                                className="flex-1 min-h-[44px] px-4 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-all disabled:opacity-50"
                              >
                                {isBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                Qabul qilish
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusUpdate(app.id, 'rejected')}
                                className="min-h-[44px] px-3.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold text-sm flex items-center justify-center gap-1 hover:bg-rose-100 transition-all disabled:opacity-50"
                              >
                                <XCircle size={16} />
                                Rad etish
                              </button>
                            </div>
                          )}

                          {app.status === 'offer_sent' && (
                            <div className="min-h-[44px] px-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
                              <Clock size={16} />
                              Ishchi javobi kutilmoqda
                            </div>
                          )}

                          {isInProgress && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleStatusUpdate(app.id, 'completed')}
                                className="w-full min-h-[44px] bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50"
                              >
                                {isBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                Ishni yakunlash
                              </button>
                              <Link
                                to={`/employer/create-contract?appId=${app.id}`}
                                className="w-full min-h-[44px] bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                              >
                                <CheckCircle size={16} />
                                {t('employer.dashboard.create_contract')}
                              </Link>
                            </>
                          )}

                          {app.status === 'completed' &&
                            (alreadyReviewed ? (
                              <div className="min-h-[44px] bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                                <Star size={16} fill="currentColor" />
                                {t('reviews.rated', { defaultValue: 'Baholangan' })}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReviewApp(app)}
                                className="w-full min-h-[44px] bg-amber-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20"
                              >
                                <Star size={16} />
                                {t('reviews.rate_worker', { defaultValue: 'Ishchini baholash' })}
                              </button>
                            ))}

                          {chatAllowed && (
                            <Link
                              to={`/chat?with=${app.workerId}&jobId=${app.jobId}`}
                              className="w-full min-h-[44px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                            >
                              <MessageSquare size={16} />
                              {t('worker_profile.start_chat')}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-secondary/20 rounded-[40px] p-16 text-center border-2 border-dashed border-border">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground shadow-sm">
              <Briefcase size={40} />
            </div>
            <h3 className="text-xl font-bold text-foreground">{t('employer.dashboard.no_applications')}</h3>
            <p className="text-muted-foreground mt-2">{t('employer.dashboard.no_applications_desc')}</p>
          </div>
        )}
      </div>

      <ReviewModal
        isOpen={Boolean(reviewApp)}
        onClose={closeReview}
        applicationId={reviewApp?.id || ''}
        revieweeId={reviewApp?.workerId}
        workerName={reviewApp?.worker?.fullName || reviewApp?.workerName}
        jobTitle={reviewApp?.job?.title || reviewApp?.jobTitle}
        onSubmitted={() => {
          setApplications((prev) =>
            prev.map((a) => (a.id === reviewApp?.id ? { ...a, reviewed: true, employerReviewed: true } : a)),
          );
        }}
      />
    </DashboardLayout>
  );
}
