import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CheckCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { contractService } from '../../services/contractService';
import { jobService } from '../../services/jobService';
import MobileCard from '../components/Card';
import FAB from '../components/FAB';
import { SkeletonList } from '../components/SkeletonCard';
import PullToRefresh from '../components/PullToRefresh';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatSom } from '../../constants/yandexServices';

export function WorkerDashboardMobile() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ contracts: 0, done: 0, earnings: 0 });

  const load = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      const contracts = await contractService.getByWorker(profile.uid);
      setStats({
        contracts: contracts.filter((c) => c.status === 'active').length,
        done: contracts.filter((c) => c.status === 'completed').length,
        earnings: contracts
          .filter((c) => c.status === 'completed')
          .reduce((s, c) => s + (c.amount || 0), 0),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.uid]);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="px-4 py-5 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('mobile.hello')}</p>
          <h1 className="text-xl font-black">{profile?.fullName || t('directory.worker')}</h1>
        </div>
        {loading ? (
          <SkeletonList count={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={CheckCircle} label={t('mobile.active_contract')} value={stats.contracts} />
            <Stat icon={Briefcase} label={t('mobile.completed')} value={stats.done} />
            <Stat icon={TrendingUp} label={t('drawer.earnings')} value={formatSom(stats.earnings, i18n.language)} />
          </div>
        )}
        <div className="space-y-2">
          <Quick to="/jobs" label={t('mobile_nav.jobs')} />
          <Quick to="/my-work" label={t('mobile.current_job')} />
          <Quick to="/directory" label={t('directory.employers_title')} />
          <Quick to="/verification" label={t('admin.dashboard.verify')} />
          <Quick to="/saved-jobs" label={t('mobile.saved_orders')} />
        </div>
        <FAB label={t('mobile_nav.jobs')} onClick={() => navigate('/jobs')} />
      </div>
    </PullToRefresh>
  );
}

export function EmployerDashboardMobile() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ jobs: 0, contracts: 0 });

  const load = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      const [jobs, contracts] = await Promise.all([
        jobService.getByEmployer(profile.uid),
        contractService.getByEmployer(profile.uid),
      ]);
      setStats({
        jobs: jobs.filter((j) => j.status === 'open' || j.status === 'active').length,
        contracts: contracts.filter((c) => c.status === 'active').length,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile?.uid]);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="px-4 py-5 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('mobile.org_label')}</p>
          <h1 className="text-xl font-black">{profile?.fullName || t('auth.employer')}</h1>
        </div>
        {loading ? (
          <SkeletonList count={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Briefcase} label={t('mobile.active_ads')} value={stats.jobs} />
            <Stat icon={CheckCircle} label={t('mobile.contracts_label')} value={stats.contracts} />
          </div>
        )}
        <div className="space-y-2">
          <Quick to="/directory" label={t('directory.workers_title')} />
          <Quick to="/employer/jobs" label={t('mobile.my_ads')} />
          <Quick to="/verification" label={t('admin.dashboard.verify')} />
        </div>
        <FAB label={t('mobile_nav.workers')} onClick={() => navigate('/jobs')} />
      </div>
    </PullToRefresh>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <MobileCard className="!p-3">
      <Icon size={18} className="text-primary mb-1" />
      <p className="text-lg font-black leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 font-medium">{label}</p>
    </MobileCard>
  );
}

function Quick({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="min-h-[48px] flex items-center justify-between rounded-2xl border border-border bg-card px-4 font-semibold text-sm"
    >
      {label}
      <span className="text-primary">→</span>
    </Link>
  );
}
