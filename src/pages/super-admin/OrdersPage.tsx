import React, { useEffect, useState } from 'react';
import { Briefcase, Eye, FileText, Loader2, MapPin, RefreshCw, Send, Star, UserCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { formatSom, YANDEX_SERVICES } from '../../constants/yandexServices';
import { getDistrictKey } from '../../lib/utils';
import type { Contract, Review, YandexOrder } from '../../types';

type AdminWorkerRow = Awaited<ReturnType<typeof api.adminYandex.workers>>['workers'][number];

const ASSIGNABLE_STATUSES = new Set(['qidirilmoqda', 'taklif_yuborildi', 'muddati_otdi', 'qabul_qilindi']);

export default function SuperAdminOrdersPage() {
  const { t, i18n } = useTranslation();
  const [orders, setOrders] = useState<YandexOrder[]>([]);
  const [workers, setWorkers] = useState<AdminWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignWorkerId, setAssignWorkerId] = useState('');
  const [assigningMode, setAssigningMode] = useState<'offer' | 'direct' | null>(null);
  const [assignNotice, setAssignNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detail, setDetail] = useState<{
    order: YandexOrder;
    offers: Array<{
      id: string;
      workerId: string;
      workerName: string | null;
      workerRating: number;
      status: string;
      score: number;
      distanceKm: number;
      etaMin: number;
      searchRadiusKm: number;
      expiresAt: string;
      respondedAt: string | null;
      createdAt: string;
    }>;
    contract: Contract | null;
    reviews: Review[];
  } | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const [ordersRes, workersRes] = await Promise.all([
        api.adminYandex.orders({
          status: statusFilter || undefined,
          serviceType: serviceFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        api.adminYandex.workers(),
      ]);
      setOrders(ordersRes.orders || []);
      setWorkers((workersRes.workers || []).filter((w) => !w.isBlocked));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, [statusFilter, serviceFilter, dateFrom, dateTo]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setAssignNotice(null);
    try {
      const res = await api.adminYandex.orderDetail(id, true);
      setDetail(res);
      const pendingOffer = res.offers.find((o) => o.status === 'kutilmoqda');
      setAssignWorkerId(res.order.workerId || pendingOffer?.workerId || '');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAssignFromDrawer = async (mode: 'offer' | 'direct') => {
    if (!detail || !assignWorkerId) return;
    setAssigningMode(mode);
    setAssignNotice(null);
    try {
      const res = await api.adminYandex.assignOrder(detail.order.id, {
        workerId: assignWorkerId,
        mode,
      });
      setAssignNotice({
        type: 'success',
        text:
          mode === 'direct'
            ? t('super_admin.assigned_success', { name: res.assignment.workerName })
            : t('super_admin.offer_routed_success', { name: res.assignment.workerName }),
      });
      await Promise.all([openDetail(detail.order.id), loadOrders()]);
    } catch (err) {
      setAssignNotice({
        type: 'error',
        text: err instanceof Error ? err.message : t('super_admin.error_generic'),
      });
    } finally {
      setAssigningMode(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_orders')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <Briefcase className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_orders')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{orders.length}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-bold text-foreground hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('onboarding.refresh_kyc')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl border border-border bg-card p-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
            aria-label={t('contract.status')}
          >
            <option value="">{t('common.all')}</option>
            {(['qidirilmoqda', 'taklif_yuborildi', 'qabul_qilindi', 'yolda', 'yetib_keldi', 'jarayonda', 'yakunlandi', 'bekor_qilindi'] as const).map((st) => (
              <option key={st} value={st}>
                {t(`yandex.status_${st}`)}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
            aria-label={t('yandex.select_service')}
          >
            <option value="">{t('common.all')}</option>
            {YANDEX_SERVICES.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {t(svc.labelKey)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
            aria-label={t('super_admin.date_from_aria')}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-bold"
            aria-label={t('super_admin.date_to_aria')}
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">{t('yandex.select_service')}</th>
                  <th className="px-4 py-3">{t('contract.employer')}</th>
                  <th className="px-4 py-3">{t('contract.worker')}</th>
                  <th className="px-4 py-3">{t('contract.agreed_amount')}</th>
                  <th className="px-4 py-3">{t('contract.status')}</th>
                  <th className="px-4 py-3 text-right">{t('notifications.view_details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{o.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {t(`services.${o.serviceType}`)} · {t(`durations.${o.durationType}`)}
                    </td>
                    <td className="px-4 py-3">{o.employerName || '—'}</td>
                    <td className="px-4 py-3">
                      {o.workerName ||
                        (o.pendingOfferWorkerName ? (
                          <span className="font-bold text-amber-700">
                            {t('super_admin.pending_offer_badge', { name: o.pendingOfferWorkerName })}
                          </span>
                        ) : (
                          '—'
                        ))}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{formatSom(o.agreedRate || o.recommendedRate, i18n.language)}</td>
                    <td className="px-4 py-3 font-bold text-[#1a7c78]">
                      {t(`yandex.status_${o.status}`, { defaultValue: o.status })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void openDetail(o.id)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#102833] px-3 text-xs font-bold text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t('notifications.view_details')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {(detail || detailLoading) && (
          <div className="fixed inset-0 z-[150] flex justify-end bg-black/50 backdrop-blur-xs">
            <div className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-lg font-black text-foreground">{t('notifications.view_details')}</h2>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-lg p-2 hover:bg-secondary"
                  aria-label={t('common.back')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {detailLoading || !detail ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-border border-l-4 border-l-[#1a7c78] bg-background p-4 space-y-2 text-xs">
                    <div className="font-black text-base text-foreground">
                      {t(`services.${detail.order.serviceType}`)} · {t(`durations.${detail.order.durationType}`)}
                    </div>
                    <div className="font-bold text-[#1a7c78]">
                      {t(`yandex.status_${detail.order.status}`, { defaultValue: detail.order.status })}
                    </div>
                    <div className="tabular-nums font-bold">{formatSom(detail.order.agreedRate || detail.order.recommendedRate, i18n.language)}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                      <MapPin className="h-3.5 w-3.5 text-[#1a7c78]" />
                      {detail.order.lat != null && detail.order.lng != null
                        ? `${detail.order.lat.toFixed(5)}, ${detail.order.lng.toFixed(5)} · `
                        : ''}
                      {detail.order.addressText ||
                        (detail.order.district
                          ? t(`districts.${getDistrictKey(detail.order.district)}`, { defaultValue: detail.order.district })
                          : '—')}
                    </div>
                    {detail.contract && (
                      <Link
                        to={`/super-admin/contracts/${detail.contract.id}`}
                        className="inline-flex items-center gap-1.5 font-bold text-[#1a7c78] hover:underline pt-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t('yandex.digital_contract')} ({t(`common.${detail.contract.status}`, { defaultValue: detail.contract.status })})
                      </Link>
                    )}
                  </div>

                  {ASSIGNABLE_STATUSES.has(detail.order.status) && (
                    <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                          {t('super_admin.dispatch_title')}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">{t('super_admin.dispatch_subtitle')}</p>
                      </div>

                      {assignNotice && (
                        <div
                          className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                            assignNotice.type === 'success'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-rose-200 bg-rose-50 text-rose-800'
                          }`}
                        >
                          {assignNotice.text}
                        </div>
                      )}

                      <select
                        aria-label={t('super_admin.select_worker')}
                        value={assignWorkerId}
                        onChange={(e) => setAssignWorkerId(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-border bg-card px-3 text-xs font-bold"
                      >
                        <option value="">{t('super_admin.select_worker')}</option>
                        {workers.map((w) => (
                          <option key={w.uid} value={w.uid}>
                            {w.fullName}
                            {w.district ? ` (${w.district})` : ''} — ★{Number(w.rating || 5).toFixed(1)}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={!assignWorkerId || assigningMode !== null}
                          onClick={() => void handleAssignFromDrawer('offer')}
                          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#1a7c78] bg-[#1a7c78]/10 px-3 text-xs font-extrabold text-[#1a7c78] hover:bg-[#1a7c78]/20 disabled:opacity-50"
                        >
                          {assigningMode === 'offer' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {t('super_admin.send_offer')}
                        </button>
                        <button
                          type="button"
                          disabled={!assignWorkerId || assigningMode !== null}
                          onClick={() => void handleAssignFromDrawer('direct')}
                          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#102833] px-3 text-xs font-extrabold text-white hover:bg-[#1a3c4c] disabled:opacity-50"
                        >
                          {assigningMode === 'direct' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5 text-[#c6a15b]" />}
                          {t('super_admin.assign_direct')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                      {t('super_admin.matching_queue', { count: detail.offers.length })}
                    </h3>
                    {detail.offers.map((of) => (
                      <div key={of.id} className="rounded-xl border border-border bg-background p-3 text-xs flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-foreground">{of.workerName || of.workerId}</p>
                          <p className="text-muted-foreground tabular-nums">
                            {of.distanceKm.toFixed(1)} km · ~{of.etaMin} {t('nearby_jobs.minutes_short')} · ★{of.workerRating.toFixed(1)} · {of.score.toFixed(2)}
                          </p>
                        </div>
                        <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-bold uppercase">
                          {t(`common.${of.status}`, { defaultValue: of.status })}
                        </span>
                      </div>
                    ))}
                  </div>

                  {detail.reviews.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        {t('super_admin.reviews_title', { count: detail.reviews.length })}
                      </h3>
                      {detail.reviews.map((rev) => (
                        <div key={rev.id} className="rounded-xl border border-border bg-background p-3 text-xs space-y-1">
                          <div className="flex items-center gap-1 font-bold">
                            <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                            {rev.rating}
                          </div>
                          {rev.comment && <p className="text-muted-foreground">{rev.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
