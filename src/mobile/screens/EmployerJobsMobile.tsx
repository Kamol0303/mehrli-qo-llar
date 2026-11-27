import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { jobService } from '../../services/jobService';
import { Job } from '../../types';
import MobileCard from '../components/Card';
import FAB from '../components/FAB';
import ChipFilter from '../components/ChipFilter';
import { SkeletonList } from '../components/SkeletonCard';
import PullToRefresh from '../components/PullToRefresh';
import { useTranslation } from 'react-i18next';
import { formatSom } from '../../constants/yandexServices';

export default function EmployerJobsMobile() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');

  const load = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      setJobs(await jobService.getByEmployer(profile.uid));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.uid]);

  const filtered = status === 'all' ? jobs : jobs.filter((j) => j.status === status);

  return (
    <div className="px-4 py-4 space-y-4">
      <h1 className="text-xl font-black">{t('mobile.my_ads')}</h1>
      <ChipFilter
        value={status}
        onChange={setStatus}
        options={[
          { id: 'all', label: t('mobile.all_chip') },
          { id: 'open', label: t('mobile.open_chip') },
          { id: 'closed', label: t('mobile.closed_chip') },
          { id: 'draft', label: t('mobile.draft_chip') },
        ]}
      />
      <PullToRefresh onRefresh={load}>
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">{t('mobile.no_ads')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((job) => (
              <MobileCard key={job.id} onClick={() => navigate(`/employer/jobs/${job.id}`)}>
                <div className="flex justify-between gap-2">
                  <h2 className="font-bold text-sm">{job.title}</h2>
                  <span className="text-[10px] font-black uppercase text-primary">
                    {t(`common.${job.status}`, { defaultValue: job.status })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatSom(job.price || 0, i18n.language)} · {job.district || job.region}
                </p>
              </MobileCard>
            ))}
          </div>
        )}
      </PullToRefresh>
      <FAB label={t('mobile_nav.workers')} onClick={() => navigate('/jobs')} />
    </div>
  );
}
