import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { applicationService } from '../../services/applicationService';
import { jobService } from '../../services/jobService';
import { Application, Job, Profile } from '../../types';
import MobileCard from '../components/Card';
import ChipFilter from '../components/ChipFilter';
import { SkeletonList } from '../components/SkeletonCard';
import PullToRefresh from '../components/PullToRefresh';
import SwipeableRow from '../components/SwipeableRow';
import ReviewModal from '../../components/ReviewModal';
import { appConfirm } from '../../lib/appDialog';
import { useTranslation } from 'react-i18next';

type Row = Application & { job?: Job; worker?: Profile };

export function WorkerApplicationsMobile() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      const apps = await applicationService.getByWorker(profile.uid);
      const combined = await Promise.all(
        apps.map(async (app) => ({
          ...app,
          job: await jobService.getById(app.jobId).catch(() => undefined),
        })),
      );
      setRows(combined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.uid]);

  const complete = async (id: string) => {
    if (!(await appConfirm(t('mobile.confirm_finish_job')))) return;
    setActionError(null);
    setCompletingId(id);
    try {
      await applicationService.complete(id);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'completed' } : r)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setCompletingId(null);
    }
  };

  const filtered = status === 'all' ? rows : rows.filter((r) => r.status === status);

  return (
    <div className="px-4 py-4 space-y-4">
      <h1 className="text-xl font-black">{t('mobile.my_applications_title')}</h1>
      <ChipFilter
        value={status}
        onChange={setStatus}
        options={[
          { id: 'all', label: t('mobile.all_chip') },
          { id: 'pending', label: t('mobile.pending_chip') },
          { id: 'accepted', label: t('mobile.accepted_chip') },
          { id: 'completed', label: t('mobile.completed_chip') },
          { id: 'rejected', label: t('mobile.rejected_chip') },
        ]}
      />
      {actionError && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
          {actionError}
        </p>
      )}
      <PullToRefresh onRefresh={load}>
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">{t('mobile.no_applications')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => (
              <MobileCard key={row.id}>
                <div className="flex justify-between gap-2">
                  <h2 className="font-bold text-sm">{row.job?.title || t('my_work.job')}</h2>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {row.coverLetter || row.message || '—'}
                </p>
                {row.status === 'accepted' && (
                  <button
                    type="button"
                    className="mt-3 w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
                    disabled={completingId === row.id}
                    onClick={() => void complete(row.id)}
                  >
                    {completingId === row.id ? t('mobile.sending') : t('mobile.complete_job')}
                  </button>
                )}
              </MobileCard>
            ))}
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}

export function EmployerApplicationsMobile() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [reviewRow, setReviewRow] = useState<Row | null>(null);

  const load = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      const apps = await applicationService.getByEmployer(profile.uid);
      const combined = await Promise.all(
        apps.map(async (app) => ({
          ...app,
          worker: await api.users.get(app.workerId).catch(() => undefined),
          job: await jobService.getById(app.jobId).catch(() => undefined),
        })),
      );
      setRows(combined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.uid]);

  const filtered = status === 'all' ? rows : rows.filter((r) => r.status === status);

  const reject = async (id: string) => {
    await applicationService.reject(id);
    await load();
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <h1 className="text-xl font-black">{t('mobile.incoming_applications_title')}</h1>
      <ChipFilter
        value={status}
        onChange={setStatus}
        options={[
          { id: 'all', label: t('mobile.all_chip') },
          { id: 'pending', label: t('mobile.new_chip') },
          { id: 'accepted', label: t('mobile.accepted_chip') },
          { id: 'completed', label: t('mobile.completed_chip') },
          { id: 'rejected', label: t('mobile.rejected_chip') },
        ]}
      />
      <PullToRefresh onRefresh={load}>
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">{t('mobile.no_applications')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((row) => (
              <SwipeableRow
                key={row.id}
                leftLabel={t('mobile.reject_btn')}
                onSwipeLeft={row.status === 'pending' ? () => void reject(row.id) : undefined}
              >
                <MobileCard>
                  <div className="flex justify-between gap-2">
                    <h2 className="font-bold text-sm">{row.worker?.fullName || t('directory.worker')}</h2>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.job?.title}</p>
                  {row.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                        onClick={() => void applicationService.approve(row.id).then(load)}
                      >
                        {t('mobile.accepted_chip')}
                      </button>
                      <button
                        type="button"
                        className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-bold"
                        onClick={() => void reject(row.id)}
                      >
                        {t('mobile.rejected_chip')}
                      </button>
                    </div>
                  )}
                  {row.status === 'completed' && (
                    row.reviewed ? (
                      <p className="mt-3 text-xs font-bold text-amber-600">{t('mobile.rated')}</p>
                    ) : (
                      <button
                        type="button"
                        className="mt-3 w-full min-h-[44px] rounded-xl bg-amber-500 text-white text-sm font-bold"
                        onClick={() => setReviewRow(row)}
                      >
                        {t('mobile.rate_worker')}
                      </button>
                    )
                  )}
                </MobileCard>
              </SwipeableRow>
            ))}
          </div>
        )}
      </PullToRefresh>

      <ReviewModal
        isOpen={Boolean(reviewRow)}
        onClose={() => setReviewRow(null)}
        applicationId={reviewRow?.id || ''}
        workerName={reviewRow?.worker?.fullName || reviewRow?.workerName}
        jobTitle={reviewRow?.job?.title || reviewRow?.jobTitle}
        onSubmitted={() => {
          setRows((prev) => prev.map((r) => (r.id === reviewRow?.id ? { ...r, reviewed: true } : r)));
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  const key = status || 'pending';
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    withdrawn: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${map[key] || map.pending}`}>
      {t(`mobile.status_${key}`, { defaultValue: key })}
    </span>
  );
}
