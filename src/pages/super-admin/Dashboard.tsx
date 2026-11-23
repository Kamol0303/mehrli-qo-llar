import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import {
  Shield,
  Users,
  Briefcase,
  FileText,
  AlertTriangle,
  Activity,
  CheckCircle,
  MapPin,
  TrendingUp,
  Settings,
  UserCheck,
  Building2,
  Clock,
  Layers,
  Map as MapIcon,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SuperAdminLiveMap from '../../components/map/SuperAdminLiveMap';

export default function SuperAdminDashboard() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeWorkers: 0,
    activeEmployers: 0,
    todayOrders: 0,
    activeJobs: 0,
    completedJobs: 0,
    cancelledOrders: 0,
    pendingVerifications: 0,
    disputesCount: 0,
    usersOnMap: 0,
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'map' | 'activity'>('map');
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [users, jobs, applications, disputes, verifications, logs] = await Promise.all([
        api.users.list().catch(() => []),
        api.jobs.list().catch(() => []),
        api.applications.list().catch(() => []),
        api.disputes.list().catch(() => []),
        api.verificationRequests.list({ status: 'pending' }).catch(() => []),
        api.systemLogs.list().catch(() => []),
      ]);

      const now = Date.now();
      const oneDayAgo = now - 24 * 3600 * 1000;

      const workers = users.filter((u) => u.role === 'worker' && !u.isBlocked);
      const employers = users.filter((u) => u.role === 'employer' && !u.isBlocked);
      const todayApps = applications.filter((a) => {
        const time = new Date(a.createdAt).getTime();
        return time >= oneDayAgo;
      });
      const activeJ = jobs.filter((j) => j.status === 'open' || j.status === 'active');
      const compJ = applications.filter((a) => a.status === 'completed');
      const cancJ = applications.filter((a) => a.status === 'cancelled' || a.status === 'rejected');
      const pendDisputes = disputes.filter((d) => d.status === 'pending');
      const pendVerif = verifications.filter((v) => v.status === 'pending' || v.status === 'under_review');
      const withCoords = users.filter((u) => !u.isBlocked);

      setStats({
        totalUsers: users.length,
        activeWorkers: workers.length,
        activeEmployers: employers.length,
        todayOrders: todayApps.length,
        activeJobs: activeJ.length,
        completedJobs: compJ.length,
        cancelledOrders: cancJ.length,
        pendingVerifications: pendVerif.length,
        disputesCount: pendDisputes.length,
        usersOnMap: withCoords.length,
      });

      setRecentLogs((logs || []).slice(0, 8));
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const kpis = [
    {
      label: 'Jami foydalanuvchilar',
      value: stats.totalUsers,
      sub: `${stats.activeWorkers} ishchi · ${stats.activeEmployers} ish beruvchi`,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      link: '/super-admin/users',
    },
    {
      label: 'Faol ishlar',
      value: stats.activeJobs,
      sub: 'Ayni vaqtda ochiq e‘lonlar',
      icon: Briefcase,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      link: '/super-admin/jobs',
    },
    {
      label: 'Bugungi buyurtmalar',
      value: stats.todayOrders,
      sub: 'So‘nggi 24 soatda yuborilgan',
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      link: '/super-admin/applications',
    },
    {
      label: 'Tugallangan ishlar',
      value: stats.completedJobs,
      sub: 'Muvaffaqiyatli topshirilgan',
      icon: CheckCircle,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-950/30',
      link: '/super-admin/contracts',
    },
    {
      label: 'Bekor qilinganlar',
      value: stats.cancelledOrders,
      sub: 'Bekor / rad etilgan buyurtmalar',
      icon: Activity,
      color: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-100 dark:bg-slate-800',
      link: '/super-admin/applications',
    },
    {
      label: 'Xaritadagi foydalanuvchilar',
      value: stats.usersOnMap,
      sub: 'Lokatsiyasi aniqlangan',
      icon: MapPin,
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/30',
      link: '#live-map',
      onClick: () => setActiveTab('map'),
    },
    {
      label: 'Verification kutayotganlar',
      value: stats.pendingVerifications,
      sub: 'Hujjat tekshiruvi navbati',
      icon: UserCheck,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      link: '/super-admin/verification',
    },
    {
      label: 'Shikoyat va nizolar',
      value: stats.disputesCount,
      sub: 'Hal qilinishi kutilmoqda',
      icon: AlertTriangle,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      link: '/super-admin/disputes',
    },
  ];

  return (
    <DashboardLayout title="Superadmin Boshqaruv Markazi">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/30">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground tracking-tight">Superadmin Markazi</h1>
                <span className="rounded-md bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                  Real-Time
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ishchi va ish beruvchilar matching platformasi to‘liq nazorati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yangilash
            </button>
          </div>
        </div>

        {/* 10 CORE KPIS GRID (Requirement #6: sodda, professional, tez tushuniladigan) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {kpis.map((kpi) => {
            const content = (
              <div
                key={kpi.label}
                className="rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-md hover:border-primary/40 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground line-clamp-1">{kpi.label}</span>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${kpi.bg} ${kpi.color}`}>
                    <kpi.icon className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-black text-foreground tracking-tight tabular-nums">
                    {kpi.value.toLocaleString()}
                  </span>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{kpi.sub}</p>
                </div>
              </div>
            );

            if (kpi.onClick) {
              return (
                <button
                  type="button"
                  key={kpi.label}
                  onClick={kpi.onClick}
                  className="text-left"
                >
                  {content}
                </button>
              );
            }

            return (
              <Link key={kpi.label} to={kpi.link} className="block text-left">
                {content}
              </Link>
            );
          })}
        </div>

        {/* VIEW TABS: LIVE MAP vs AUDIT & ACTIONS */}
        <div className="space-y-4" id="live-map">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('map')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'map'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                <MapIcon className="h-4 w-4" />
                Jonli Xarita (Live Map)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'activity'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                <Activity className="h-4 w-4" />
                Tizim Jurnali va Boshqaruv
              </button>
            </div>

            <span className="text-xs text-muted-foreground hidden sm:inline">
              Xaritadagi markerlarni bosib tezkor kartani ko‘ring
            </span>
          </div>

          {activeTab === 'map' ? (
            <SuperAdminLiveMap height="640px" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Quick Navigation Cards */}
              <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Tezkor Boshqaruv Bo‘limlari
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to="/super-admin/users"
                    className="p-3.5 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary transition-all flex flex-col gap-1"
                  >
                    <Users className="h-5 w-5 text-blue-600 mb-1" />
                    <span className="text-xs font-bold text-foreground">Foydalanuvchilar</span>
                    <span className="text-[11px] text-muted-foreground">Bloklash, rollar, profil</span>
                  </Link>
                  <Link
                    to="/super-admin/jobs"
                    className="p-3.5 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary transition-all flex flex-col gap-1"
                  >
                    <Briefcase className="h-5 w-5 text-emerald-600 mb-1" />
                    <span className="text-xs font-bold text-foreground">E‘lonlar va ishlar</span>
                    <span className="text-[11px] text-muted-foreground">Statuslar, moderatsiya</span>
                  </Link>
                  <Link
                    to="/super-admin/verification"
                    className="p-3.5 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary transition-all flex flex-col gap-1"
                  >
                    <UserCheck className="h-5 w-5 text-indigo-600 mb-1" />
                    <span className="text-xs font-bold text-foreground">Verifikatsiya</span>
                    <span className="text-[11px] text-muted-foreground">Pasport & ID tekshiruvi</span>
                  </Link>
                  <Link
                    to="/super-admin/disputes"
                    className="p-3.5 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary transition-all flex flex-col gap-1"
                  >
                    <AlertTriangle className="h-5 w-5 text-rose-600 mb-1" />
                    <span className="text-xs font-bold text-foreground">Nizolar va Shikoyatlar</span>
                    <span className="text-[11px] text-muted-foreground">Arbitraj va yechimlar</span>
                  </Link>
                </div>
              </div>

              {/* System Audit Logs */}
              <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  So‘nggi Tizim Harakatlari
                </h3>
                {recentLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    Hozircha tizim xabarlari mavjud emas
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {recentLogs.map((log: any, idx: number) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border/60 bg-background p-2.5 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="text-foreground font-medium truncate">
                          {log.action || log.event || log.message || 'Tizim harakati'}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
