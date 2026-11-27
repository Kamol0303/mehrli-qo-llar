import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Briefcase,
  CheckCircle,
  Clock,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  TrendingDown,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import SuperAdminLiveMap from '../../components/map/SuperAdminLiveMap';
import AdminUserEditModal, { type EditableAdminUser } from '../../components/admin/AdminUserEditModal';
import { api } from '../../lib/api';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';
import { appConfirm } from '../../lib/appDialog';
import { formatSom } from '../../constants/yandexServices';
import type { AdminDashboardKpi, YandexOrder } from '../../types';

type AdminWorkerRow = Awaited<ReturnType<typeof api.adminYandex.workers>>['workers'][number];
type AdminEmployerRow = Awaited<ReturnType<typeof api.adminYandex.employers>>['employers'][number];

const ASSIGNABLE_STATUSES = new Set(['qidirilmoqda', 'taklif_yuborildi', 'muddati_otdi', 'qabul_qilindi']);

export default function SuperAdminDashboard() {
  const { t, i18n } = useTranslation();
  const [kpi, setKpi] = useState<AdminDashboardKpi>({
    onlineWorkers: 0,
    activeOrders: 0,
    todayOrders: 0,
    totalOrders: 0,
    avgMatchSeconds: 0,
    cancelRatePercent: 0,
    openSos: 0,
    pendingKyc: 0,
  });
  const [orders, setOrders] = useState<YandexOrder[]>([]);
  const [workers, setWorkers] = useState<AdminWorkerRow[]>([]);
  const [employers, setEmployers] = useState<AdminEmployerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [orderSearch, setOrderSearch] = useState('');
  const [selectedWorkerByOrder, setSelectedWorkerByOrder] = useState<Record<string, string>>({});
  const [assignBusyKey, setAssignBusyKey] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'worker' | 'employer'>('all');
  const [editingUser, setEditingUser] = useState<EditableAdminUser | null>(null);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [kpiRes, ordersRes, workersRes, employersRes] = await Promise.all([
        api.adminYandex.kpi(),
        api.adminYandex.orders(),
        api.adminYandex.workers(),
        api.adminYandex.employers(),
      ]);
      setKpi(kpiRes);
      setOrders(ordersRes.orders || []);
      setWorkers(workersRes.workers || []);
      setEmployers(employersRes.employers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useRealtimeEvents(true, (eventType) => {
    if (eventType === 'sos_alert' || eventType === 'order_updated') {
      void loadData();
    }
  });

  const assignableOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders
      .filter((o) => ASSIGNABLE_STATUSES.has(o.status))
      .filter((o) => {
        if (!q) return true;
        return (
          o.id.toLowerCase().includes(q) ||
          (o.employerName || '').toLowerCase().includes(q) ||
          (o.workerName || '').toLowerCase().includes(q) ||
          (o.pendingOfferWorkerName || '').toLowerCase().includes(q) ||
          (o.district || '').toLowerCase().includes(q) ||
          t(`services.${o.serviceType}`).toLowerCase().includes(q)
        );
      });
  }, [orders, orderSearch, t]);

  const availableWorkers = useMemo(() => workers.filter((w) => !w.isBlocked), [workers]);

  const combinedUsers = useMemo(() => {
    const list: EditableAdminUser[] = [
      ...workers.map((w) => ({
        uid: w.uid,
        fullName: w.fullName,
        email: w.email,
        phoneNumber: w.phoneNumber,
        role: 'worker' as const,
        region: w.region,
        district: w.district,
        profession: w.profession,
        skills: w.skills,
        companyName: null,
        bio: w.bio,
        isVerified: w.isVerified,
        isBlocked: w.isBlocked,
      })),
      ...employers.map((e) => ({
        uid: e.uid,
        fullName: e.fullName,
        email: e.email,
        phoneNumber: e.phoneNumber,
        role: 'employer' as const,
        region: e.region,
        district: e.district,
        profession: null,
        skills: [],
        companyName: e.companyName,
        bio: e.bio,
        isVerified: e.isVerified,
        isBlocked: e.isBlocked,
      })),
    ];

    const q = userSearch.trim().toLowerCase();
    return list.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        (u.companyName || '').toLowerCase().includes(q) ||
        (u.phoneNumber || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.district || '').toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [workers, employers, userSearch, userRoleFilter]);

  const handleAssignOrder = async (order: YandexOrder, mode: 'offer' | 'direct') => {
    const chosenWorkerId = selectedWorkerByOrder[order.id] || order.pendingOfferWorkerId || order.workerId || '';
    if (!chosenWorkerId) {
      showFeedback('error', t('super_admin.select_worker'));
      return;
    }

    setAssignBusyKey(`${order.id}:${mode}`);
    try {
      const res = await api.adminYandex.assignOrder(order.id, { workerId: chosenWorkerId, mode });
      setOrders((prev) => prev.map((item) => (item.id === order.id ? res.order : item)));
      showFeedback(
        'success',
        mode === 'direct'
          ? t('super_admin.assigned_success', { name: res.assignment.workerName })
          : t('super_admin.offer_routed_success', { name: res.assignment.workerName }),
      );
      void loadData();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('super_admin.error_generic'));
    } finally {
      setAssignBusyKey(null);
    }
  };

  const handleToggleUserBlock = async (u: EditableAdminUser) => {
    setUserBusyId(u.uid);
    try {
      const next = !u.isBlocked;
      await api.adminYandex.setUserBlock(u.uid, next, next ? 'Admin moderation' : undefined);
      setWorkers((prev) => prev.map((w) => (w.uid === u.uid ? { ...w, isBlocked: next } : w)));
      setEmployers((prev) => prev.map((e) => (e.uid === u.uid ? { ...e, isBlocked: next } : e)));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('super_admin.error_generic'));
    } finally {
      setUserBusyId(null);
    }
  };

  const handleDeleteUser = async (u: EditableAdminUser) => {
    const ok = await appConfirm(t('super_admin.confirm_delete_user_permanent', { name: u.fullName }));
    if (!ok) return;

    setUserBusyId(u.uid);
    try {
      await api.adminYandex.deleteUser(u.uid);
      setWorkers((prev) => prev.filter((w) => w.uid !== u.uid));
      setEmployers((prev) => prev.filter((e) => e.uid !== u.uid));
      showFeedback('success', t('super_admin.user_deleted'));
      void loadData();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('super_admin.error_generic'));
    } finally {
      setUserBusyId(null);
    }
  };

  const cards = [
    {
      label: t('super_admin.online_workers'),
      value: kpi.onlineWorkers,
      icon: Users,
      accent: 'border-l-[#1a7c78]',
      link: '/super-admin/workers',
    },
    {
      label: t('super_admin.active_orders'),
      value: kpi.activeOrders,
      icon: Briefcase,
      accent: 'border-l-[#102833]',
      link: '/super-admin/orders',
    },
    {
      label: t('super_admin.today_orders'),
      value: kpi.todayOrders,
      icon: Clock,
      accent: 'border-l-[#c6a15b]',
      link: '/super-admin/orders',
    },
    {
      label: t('super_admin.avg_match_sec'),
      value: `${kpi.avgMatchSeconds} s`,
      icon: Clock,
      accent: 'border-l-[#1a7c78]',
      link: '/super-admin/analytics',
    },
    {
      label: t('super_admin.cancel_rate'),
      value: `${kpi.cancelRatePercent}%`,
      icon: TrendingDown,
      accent: 'border-l-slate-500',
      link: '/super-admin/analytics',
    },
    {
      label: t('super_admin.open_sos'),
      value: kpi.openSos,
      icon: AlertTriangle,
      accent: 'border-l-rose-600',
      link: '/super-admin/sos',
    },
    {
      label: t('super_admin.pending_kyc'),
      value: kpi.pendingKyc,
      icon: ShieldCheck,
      accent: 'border-l-amber-500',
      link: '/super-admin/verification',
    },
  ];

  return (
    <DashboardLayout title={t('super_admin.nav_dashboard')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <Shield className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                {t('super_admin.nav_dashboard')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('superAdmin.subtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-xs font-bold text-foreground hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('onboarding.refresh_kyc')}
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-xs font-bold ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.link}
              className={`rounded-2xl border border-border border-l-4 ${card.accent} bg-card p-4 transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground">{card.label}</span>
                <card.icon className="h-4 w-4 text-[#1a7c78]" />
              </div>
              <div className="text-2xl font-black text-foreground tabular-nums">{card.value}</div>
            </Link>
          ))}
        </div>

        {/* Dispatch & Order-to-Worker Assignment Panel */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground">{t('super_admin.dispatch_title')}</h2>
              <p className="text-xs text-muted-foreground">{t('super_admin.dispatch_subtitle')}</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder={t('super_admin.search_orders_workers')}
                className="w-full min-h-[40px] rounded-xl border border-border bg-background pl-9 pr-3 text-xs font-medium"
              />
            </div>
          </div>

          {assignableOrders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs font-medium text-muted-foreground">
              {t('super_admin.no_new_orders')}
            </p>
          ) : (
            <div className="space-y-3">
              {assignableOrders.slice(0, 15).map((o) => {
                const selectedWorker =
                  selectedWorkerByOrder[o.id] ?? o.pendingOfferWorkerId ?? o.workerId ?? '';
                const isOfferBusy = assignBusyKey === `${o.id}:offer`;
                const isDirectBusy = assignBusyKey === `${o.id}:direct`;

                return (
                  <div
                    key={o.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-muted-foreground">
                          #{o.id.slice(0, 8)}
                        </span>
                        <span className="text-sm font-extrabold text-foreground">
                          {t(`services.${o.serviceType}`)} · {t(`durations.${o.durationType}`)}
                        </span>
                        <span className="rounded-md bg-[#1a7c78]/10 px-2 py-0.5 text-[11px] font-bold text-[#1a7c78]">
                          {t(`yandex.status_${o.status}`, { defaultValue: o.status })}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('contract.employer')}: <strong className="text-foreground">{o.employerName || '—'}</strong>
                        </span>
                        <span className="tabular-nums font-bold text-foreground">
                          {formatSom(o.agreedRate || o.recommendedRate, i18n.language)}
                        </span>
                        {o.district && <span>{o.district}</span>}
                        {o.workerName && (
                          <span className="font-bold text-emerald-700">
                            {t('contract.worker')}: {o.workerName}
                          </span>
                        )}
                        {!o.workerName && o.pendingOfferWorkerName && (
                          <span className="font-bold text-amber-700">
                            {t('super_admin.pending_offer_badge', { name: o.pendingOfferWorkerName })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        aria-label={t('super_admin.select_worker')}
                        value={selectedWorker}
                        onChange={(e) =>
                          setSelectedWorkerByOrder((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        className="min-h-[40px] min-w-[210px] rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground"
                      >
                        <option value="">{t('super_admin.select_worker')}</option>
                        {availableWorkers.map((w) => (
                          <option key={w.uid} value={w.uid}>
                            {w.fullName}
                            {w.district ? ` (${w.district})` : ''} — ★{Number(w.rating || 5).toFixed(1)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={!selectedWorker || isOfferBusy || isDirectBusy}
                        onClick={() => void handleAssignOrder(o, 'offer')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#1a7c78] bg-[#1a7c78]/10 px-3.5 text-xs font-extrabold text-[#1a7c78] hover:bg-[#1a7c78]/20 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t('super_admin.send_offer')}
                      </button>

                      <button
                        type="button"
                        disabled={!selectedWorker || isOfferBusy || isDirectBusy}
                        onClick={() => void handleAssignOrder(o, 'direct')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#102833] px-3.5 text-xs font-extrabold text-white hover:bg-[#1a3c4c] disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-[#c6a15b]" />
                        {t('super_admin.assign_direct')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <SuperAdminLiveMap height="540px" />

        {/* Full User Edit & Permanent Delete Management Panel */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground">{t('super_admin.users_panel_title')}</h2>
              <p className="text-xs text-muted-foreground">{t('super_admin.users_panel_subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t('super_admin.role_label')}
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as 'all' | 'worker' | 'employer')}
                className="min-h-[40px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="all">{t('common.all')}</option>
                <option value="worker">{t('auth.worker')}</option>
                <option value="employer">{t('auth.employer')}</option>
              </select>
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t('super_admin.search_name_phone_uid')}
                  className="w-full min-h-[40px] rounded-xl border border-border bg-background pl-9 pr-3 text-xs font-medium"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('auth.full_name')}</th>
                  <th className="px-4 py-3">{t('super_admin.role_label')}</th>
                  <th className="px-4 py-3">{t('auth.phone')} / {t('auth.email')}</th>
                  <th className="px-4 py-3">{t('contract.status')}</th>
                  <th className="px-4 py-3 text-right">{t('super_admin.action_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {combinedUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-foreground">
                        {u.companyName ? `${u.companyName} (${u.fullName})` : u.fullName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[u.profession, u.district, u.region].filter(Boolean).join(' · ') || u.uid}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-bold">
                      <span className="rounded-md bg-secondary px-2 py-1 text-[11px]">
                        {t(`auth.${u.role}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <div>{u.phoneNumber || '—'}</div>
                      {u.email && <div className="text-[11px] text-muted-foreground">{u.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {u.isBlocked ? (
                        <span className="font-bold text-rose-600">{t('super_admin.blocked_badge')}</span>
                      ) : u.isVerified ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[#1a7c78]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {t('yandex.verified_badge')}
                        </span>
                      ) : (
                        <span className="font-bold text-amber-600">{t('admin.users.pending_status')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-bold text-foreground hover:bg-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('super_admin.edit_user')}
                        </button>
                        <button
                          type="button"
                          disabled={userBusyId === u.uid}
                          onClick={() => void handleToggleUserBlock(u)}
                          className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-white disabled:opacity-50 ${
                            u.isBlocked ? 'bg-[#1a7c78]' : 'bg-amber-600'
                          }`}
                        >
                          {u.isBlocked ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          {u.isBlocked ? t('super_admin.unblock') : t('super_admin.block')}
                        </button>
                        <button
                          type="button"
                          disabled={userBusyId === u.uid}
                          onClick={() => void handleDeleteUser(u)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-rose-600 px-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('super_admin.delete_user_permanent')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editingUser && (
        <AdminUserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            showFeedback('success', t('super_admin.user_updated'));
            void loadData();
          }}
        />
      )}
    </DashboardLayout>
  );
}
