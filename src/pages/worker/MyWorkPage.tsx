import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Navigation,
  Play,
  Star,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import ReviewModal from '../../components/ReviewModal';
import StarRow from '../../components/StarRow';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobileUi } from '../../hooks/useIsMobileUi';
import { api } from '../../lib/api';
import { appConfirm } from '../../lib/appDialog';
import { getOrderStatusLabel, getOrderStatusMeta } from '../../lib/orderStatus';
import type { Application, Job, Profile, Review } from '../../types';

type Assignment = Application & { job?: Job; employer?: Profile };

const VISIBLE_STATUSES = new Set([
  'offer_sent',
  'pending',
  'accepted',
  'on_the_way',
  'started',
  'completed',
  'cancelled',
  'disputed',
]);

function MyWorkContent() {
  const { t, i18n } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [reviewsReceived, setReviewsReceived] = useState<Record<string, Review>>({});
  const [rateTarget, setRateTarget] = useState<Assignment | null>(null);

  const lang = (i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2);

  const load = useCallback(async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      const [applications, reviewRows] = await Promise.all([
        api.applications.list({ workerId: profile.uid }),
        api.reviews.list({ workerId: profile.uid }).catch(() => [] as Review[]),
      ]);
      const byApplication: Record<string, Review> = {};
      for (const review of reviewRows) {
        if (review.applicationId) byApplication[review.applicationId] = review;
      }
      setReviewsReceived(byApplication);

      const relevant = applications.filter((a) => VISIBLE_STATUSES.has(a.status || ''));
      const combined = await Promise.all(
        relevant.map(async (application) => {
          const [job, employer] = await Promise.all([
            api.jobs.get(application.jobId).catch(() => undefined),
            api.users.get(application.employerId).catch(() => undefined),
          ]);
          return { ...application, job, employer };
        }),
      );
      setRows(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('my_work.load_error'));
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (assignment: Assignment, nextStatus: Application['status']) => {
    setError('');
    setBusyId(assignment.id);
    try {
      const updated = await api.applications.update(assignment.id, { status: nextStatus });
      setRows((current) =>
        current.map((row) => (row.id === assignment.id ? { ...row, ...updated, status: nextStatus } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Holatni yangilab bo‘lmadi');
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (assignment: Assignment) => {
    if (!(await appConfirm(t('my_work.complete_confirm')))) return;
    setError('');
    setBusyId(assignment.id);
    try {
      const updated = await api.applications.complete(assignment.id);
      setRows((current) =>
        current.map((row) =>
          row.id === assignment.id
            ? { ...row, ...updated, status: 'completed', completedAt: updated.completedAt || new Date().toISOString() }
            : row,
        ),
      );
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('my_work.complete_error'));
    } finally {
      setBusyId(null);
    }
  };

  const formatSchedule = (value?: string | Date) => {
    if (!value) return t('my_work.agreed_time');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('my_work.agreed_time');
    return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const activeRows = rows.filter((r) =>
    ['offer_sent', 'pending', 'accepted', 'on_the_way', 'started'].includes(r.status || ''),
  );
  const completedRows = rows.filter((r) =>
    ['completed', 'cancelled', 'disputed'].includes(r.status || ''),
  );
  const visibleRows = tab === 'active' ? activeRows : completedRows;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-1 py-2 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">{t('my_work.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('my_work.subtitle')}</p>
        </div>

        <div className="inline-flex rounded-2xl border border-border bg-secondary/60 p-1">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition-all ${
              tab === 'active' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Faol ({activeRows.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('completed')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition-all ${
              tab === 'completed' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tugallangan ({completedRows.length})
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center space-y-3">
          <p className="text-muted-foreground font-medium">
            {tab === 'active' ? t('my_work.empty') : 'Hozircha tugallangan ishlar yo‘q'}
          </p>
          <Link
            to="/worker/nearby-jobs"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Xaritadan ish topish
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleRows.map((row) => {
            const meta = getOrderStatusMeta(row.status);
            const employerTitle = row.employer?.companyName || row.employer?.fullName || row.employerName || 'Ish beruvchi';
            const isBusy = busyId === row.id;

            return (
              <article key={row.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <Briefcase size={22} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-black text-foreground">
                        {row.job?.title || row.jobTitle || t('my_work.job')}
                      </h2>
                      <p className="text-xs font-semibold text-muted-foreground mt-0.5">{employerTitle}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarClock size={15} />
                        {formatSchedule(row.job?.scheduledAt)}
                      </p>
                      {(row.job?.price || row.job?.salary) ? (
                        <p className="mt-1 text-sm font-black text-primary">
                          {(row.job.price || row.job.salary || 0).toLocaleString()} {t('common.uzs')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${meta.badgeBg} ${meta.colorClass}`}>
                    {getOrderStatusLabel(row.status, lang)}
                  </span>
                </div>

                {row.message && (
                  <p className="mt-3 rounded-2xl bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
                    {row.message}
                  </p>
                )}

                {/* Completed Review Info + Mutual Rating Button */}
                {row.status === 'completed' && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Ish beruvchi bahosi
                      </p>
                      {reviewsReceived[row.id] ? (
                        <>
                          <StarRow rating={reviewsReceived[row.id].rating} size={18} />
                          {reviewsReceived[row.id].comment ? (
                            <p className="mt-1.5 text-sm text-muted-foreground">{reviewsReceived[row.id].comment}</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-muted-foreground">{t('my_work.not_rated')}</p>
                      )}
                    </div>

                    {!row.workerReviewed ? (
                      <button
                        type="button"
                        onClick={() => setRateTarget(row)}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
                      >
                        <Star size={17} />
                        Ish beruvchini baholash
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                        <CheckCircle2 size={16} /> Siz ish beruvchini baholadingiz
                      </div>
                    )}
                  </div>
                )}

                {/* Worker Interactive Lifecycle Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {row.status === 'offer_sent' && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void updateStatus(row, 'accepted')}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <ThumbsUp size={16} />}
                        Taklifni qabul qilish
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void updateStatus(row, 'rejected')}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 text-sm font-bold text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle size={16} />
                        Rad etish
                      </button>
                    </>
                  )}

                  {row.status === 'accepted' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void updateStatus(row, 'on_the_way')}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                      Yo‘lga chiqdim
                    </button>
                  )}

                  {(row.status === 'accepted' || row.status === 'on_the_way') && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void updateStatus(row, 'started')}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                      Ishni boshlash
                    </button>
                  )}

                  {(row.status === 'accepted' || row.status === 'on_the_way' || row.status === 'started') && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void complete(row)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      {isBusy ? t('my_work.completing') : t('my_work.complete_button')}
                    </button>
                  )}

                  <Link
                    to={`/chat?with=${row.employerId}&jobId=${row.jobId}`}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 text-sm font-bold text-foreground hover:bg-secondary/80"
                  >
                    <MessageSquare size={16} />
                    Chat
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ReviewModal
        isOpen={Boolean(rateTarget)}
        onClose={() => setRateTarget(null)}
        applicationId={rateTarget?.id || ''}
        revieweeId={rateTarget?.employerId}
        title="Ish beruvchini baholang"
        subtitle={
          rateTarget?.employer?.companyName ||
          rateTarget?.employer?.fullName ||
          rateTarget?.job?.title ||
          rateTarget?.jobTitle
        }
        placeholder="Ish beruvchi bilan hamkorlik, to‘lov va sharoit haqida fikringiz..."
        onSubmitted={() => {
          if (!rateTarget) return;
          setRows((prev) =>
            prev.map((r) => (r.id === rateTarget.id ? { ...r, workerReviewed: true } : r)),
          );
        }}
      />
    </div>
  );
}

export default function MyWorkPage() {
  const mobile = useIsMobileUi();
  if (mobile) return <MyWorkContent />;
  return (
    <DashboardLayout>
      <MyWorkContent />
    </DashboardLayout>
  );
}
