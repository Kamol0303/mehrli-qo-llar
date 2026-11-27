import { debugLogger } from '../../lib/debugLogger';
import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { VerificationRequest, Profile, VerificationRequestStatus } from '../../types';
import {
  ShieldCheck, CheckCircle, XCircle, Clock, AlertTriangle,
  Calendar, X, ZoomIn, Image, Search, Download, RefreshCw, FileText, Eye,
} from 'lucide-react';
import SafeSelect from '../../components/SafeSelect';
import { format } from 'date-fns';
import { uz, ru, enUS } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { SecureImage } from '../../components/verification/SecureMedia';
import { resolveSecureMediaUrl } from '../../lib/secureMedia';
import { getAccessToken } from '../../lib/api/client';

function resolveDocUrl(req: VerificationRequest): string | null {
  return req.idPhotoUrl || req.documentUrl || null;
}

function resolveSelfieUrl(req: VerificationRequest): string | null {
  return req.selfieUrl || null;
}

function extraUrls(req: VerificationRequest): string[] {
  const files = req.additionalFiles;
  if (!files) return [];
  if (Array.isArray(files)) {
    return files
      .map((f) => (typeof f === 'string' ? f : f?.url))
      .filter((u): u is string => Boolean(u));
  }
  return [];
}

function isImageUrl(url?: string | null) {
  if (!url) return false;
  return !/\.pdf(\?|$)/i.test(url);
}

const STATUS_META: Record<string, { labelKey: string; className: string }> = {
  pending: { labelKey: 'common.pending', className: 'bg-amber-100 text-amber-700' },
  under_review: { labelKey: 'common.under_review', className: 'bg-blue-100 text-blue-700' },
  verified: { labelKey: 'common.approved', className: 'bg-emerald-100 text-emerald-700' },
  approved: { labelKey: 'common.approved', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { labelKey: 'common.rejected', className: 'bg-rose-100 text-rose-700' },
  need_reupload: { labelKey: 'common.need_reupload', className: 'bg-orange-100 text-orange-700' },
};

function ImagePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X size={28} />
        </button>
        {isImageUrl(url) ? (
          <SecureImage url={url} alt={t('common.preview')} className="w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
        ) : (
          <div className="rounded-2xl bg-white p-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-500" />
            <SecureOpenLink url={url} label={t('super_admin.open_pdf_file')} />
          </div>
        )}
      </div>
    </div>
  );
}

function SecureOpenLink({ url, label }: { url: string; label: string }) {
  const { t } = useTranslation();
  const [href, setHref] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void resolveSecureMediaUrl(url).then((resolved) => {
      if (!active) return;
      if (resolved?.startsWith('blob:')) objectUrl = resolved;
      setHref(resolved);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  if (!href) return <span className="text-sm text-muted-foreground">{t('common.loading')}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary hover:underline">
      {label}
    </a>
  );
}

function RejectModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full">
        <h3 className="text-lg font-black text-gray-900 mb-4">{title}</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('super_admin.write_reason_placeholder')}
          rows={3}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm resize-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-40"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 3000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[300] px-5 py-3 rounded-2xl shadow-xl font-bold text-sm text-white flex items-center gap-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {msg}
    </div>
  );
}

function PhotoSlot({
  url,
  label,
  noLabel,
  onPreview,
  onDownload,
}: {
  url: string | null;
  label: string;
  noLabel: string;
  onPreview: (url: string) => void;
  onDownload: (url: string, name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
        {url && (
          <button
            type="button"
            onClick={() => onDownload(url, label)}
            className="text-muted-foreground hover:text-foreground"
            title={t('common.download')}
          >
            <Download size={14} />
          </button>
        )}
      </div>
      <div className="aspect-[4/3] rounded-xl overflow-hidden border border-border relative group bg-gray-50 flex items-center justify-center">
        {url ? (
          <>
            <SecureImage url={url} alt={label} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onPreview(url)}
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              <ZoomIn size={22} className="text-white" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400 p-4 text-center">
            <Image size={28} />
            <p className="text-xs font-medium">{noLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerificationManagement() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [requests, setRequests] = useState<(VerificationRequest & { user?: Partial<Profile> })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [accountType, setAccountType] = useState<'all' | 'worker' | 'employer'>('all');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; mode: 'reject' | 'need_reupload' } | null>(null);
  const [detail, setDetail] = useState<(VerificationRequest & { user?: Partial<Profile> }) | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin';
  const showToast = (msg: string, type: 'success' | 'error') => setToast({ msg, type });

  async function fetchRequests() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter === 'approved' ? 'verified' : statusFilter;
      }
      const rows = await api.verificationRequests.list(params);
      setRequests(rows);
    } catch (error) {
      debugLogger.error('Error fetching verification requests:', error);
      showToast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) void fetchRequests();
  }, [statusFilter, isSuperAdmin]);

  const filtered = useMemo(() => {
    let list = [...requests];
    if (accountType !== 'all') {
      list = list.filter((r) => (r.accountType || r.user?.role) === accountType);
    }
    if (region.trim()) {
      const q = region.toLowerCase();
      list = list.filter((r) => (r.user?.region || '').toLowerCase().includes(q));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const name = r.user?.fullName || r.userName || '';
        const phone = r.user?.phoneNumber || '';
        return name.toLowerCase().includes(q) || phone.includes(q) || r.userId.toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => {
      const da = new Date(a.createdAt as string).getTime();
      const db = new Date(b.createdAt as string).getTime();
      return sort === 'newest' ? db - da : da - db;
    });
    return list;
  }, [requests, accountType, region, search, sort]);

  const openDetail = async (req: VerificationRequest & { user?: Partial<Profile> }) => {
    setDetail(req);
    setAdminNotes(req.adminNotes || '');
    if (req.status === 'pending') {
      try {
        await api.verificationRequests.update(req.id, { action: 'under_review' });
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'under_review' as VerificationRequestStatus } : r)));
        setDetail((d) => (d ? { ...d, status: 'under_review' } : d));
      } catch {
        /* ignore */
      }
    }
  };

  async function handleAction(requestId: string, action: 'approve' | 'reject' | 'need_reupload', reason?: string) {
    setActionLoading(requestId);
    try {
      await api.verificationRequests.update(requestId, {
        action,
        rejectionReason: reason,
        adminNotes: adminNotes.trim() || undefined,
        reviewNote: reason,
      });
      showToast(
        action === 'approve'
          ? t('super_admin.status_approved_toast')
          : action === 'reject'
            ? t('super_admin.status_rejected_toast')
            : t('super_admin.status_reupload_toast'),
        'success',
      );
      setDetail(null);
      setRejectTarget(null);
      await fetchRequests();
    } catch {
      showToast(t('common.error'), 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulk(action: 'approve' | 'reject', reason?: string) {
    if (!selected.size) return;
    if (action === 'reject' && !reason?.trim()) {
      showToast(t('super_admin.bulk_reject_reason_req'), 'error');
      return;
    }
    setActionLoading('bulk');
    try {
      await api.verificationRequests.bulk({
        ids: Array.from(selected),
        action,
        rejectionReason: reason,
      });
      setSelected(new Set());
      showToast(t('super_admin.bulk_action_done'), 'success');
      await fetchRequests();
    } catch {
      showToast(t('common.error'), 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function downloadFile(url: string, name: string) {
    try {
      const resolved = await resolveSecureMediaUrl(url);
      if (!resolved) throw new Error(t('super_admin.file_not_found'));
      if (resolved.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = resolved;
        a.download = name.replace(/\s+/g, '_');
        a.click();
        return;
      }
      const token = getAccessToken();
      const res = await fetch(resolved, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t('super_admin.download_error'));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name.replace(/\s+/g, '_');
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      showToast(t('super_admin.download_error'), 'error');
    }
  }

  const getDateLocale = () => (i18n.language === 'ru' ? ru : i18n.language === 'en' ? enUS : uz);

  const tabs = [
    { key: 'all', label: t('common.all') },
    { key: 'pending', label: t('common.pending') },
    { key: 'under_review', label: t('common.under_review') },
    { key: 'verified', label: t('common.approved') },
    { key: 'rejected', label: t('admin.verification.rejected_tab') },
    { key: 'need_reupload', label: t('common.need_reupload') },
  ];

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-800">
          <h2 className="text-xl font-black mb-2">{t('super_admin.verification_center')}</h2>
          <p>{t('super_admin.verification_only_super_admin')}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-primary" /> {t('super_admin.verification_center')}
            </h2>
            <p className="text-muted-foreground mt-2">
              {t('super_admin.verification_center_desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRequests()}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold"
          >
            <RefreshCw size={16} /> {t('common.refresh')}
          </button>
        </div>

        <div className="flex items-center gap-1 bg-card p-1 rounded-2xl border border-border shadow-sm flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${statusFilter === tab.key ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 rounded-3xl border border-border bg-card p-4 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none"
              placeholder={t('super_admin.search_name_phone_uid')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SafeSelect
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as typeof accountType)}
          >
            <option value="all">{t('super_admin.filter_all_types')}</option>
            <option value="worker">{t('auth.worker')}</option>
            <option value="employer">{t('auth.employer')}</option>
          </SafeSelect>
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
            placeholder={t('common.region')}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
          <SafeSelect
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="newest">{t('super_admin.filter_newest')}</option>
            <option value="oldest">{t('super_admin.filter_oldest')}</option>
          </SafeSelect>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selected.size || actionLoading === 'bulk'}
            onClick={() => void handleBulk('approve')}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            <CheckCircle size={16} /> {t('super_admin.bulk_approve', { count: selected.size })}
          </button>
          <button
            type="button"
            disabled={!selected.size || actionLoading === 'bulk'}
            onClick={() => setRejectTarget({ id: 'bulk', mode: 'reject' })}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            <XCircle size={16} /> {t('super_admin.bulk_reject', { count: selected.size })}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-card h-96 rounded-3xl animate-pulse border border-border" />
              ))
            ) : filtered.length > 0 ? (
              filtered.map((req) => {
                const docUrl = resolveDocUrl(req);
                const selfieUrl = resolveSelfieUrl(req);
                const meta = STATUS_META[req.status] || STATUS_META.pending;
                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm flex flex-col"
                  >
                    <div className="p-6 border-b border-border">
                      <div className="flex items-start gap-3 mb-4">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(req.id)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(req.id)) next.delete(req.id);
                              else next.add(req.id);
                              return next;
                            });
                          }}
                        />
                        <img
                          src={req.user?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.user?.fullName || req.userName || 'User')}`}
                          alt=""
                          className="w-12 h-12 rounded-2xl object-cover border border-border"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-foreground truncate">{req.user?.fullName || req.userName || t('common.unknown_user')}</h4>
                          <p className="text-xs text-muted-foreground capitalize">
                            {(req.accountType || req.user?.role) === 'employer' ? t('auth.employer') : t('auth.worker')}
                            {' • '}
                            {req.user?.region || '-'}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate">UID: {req.userId}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {req.createdAt ? format(new Date(req.createdAt as string), 'dd MMM, yyyy', { locale: getDateLocale() }) : '-'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${meta.className}`}>
                          {t(meta.labelKey)}
                        </span>
                      </div>
                    </div>

                    <div className="p-6 space-y-4 flex-1">
                      <div className="grid grid-cols-2 gap-4">
                        <PhotoSlot
                          url={docUrl}
                          label={t('admin.verification.id_photo')}
                          noLabel={t('admin.verification.no_id_photo')}
                          onPreview={setPreviewUrl}
                          onDownload={(u, n) => void downloadFile(u, n)}
                        />
                        <PhotoSlot
                          url={selfieUrl}
                          label={t('admin.verification.selfie')}
                          noLabel={t('admin.verification.no_selfie')}
                          onPreview={setPreviewUrl}
                          onDownload={(u, n) => void downloadFile(u, n)}
                        />
                      </div>
                    </div>

                    <div className="p-4 border-t border-border flex gap-2">
                      <button
                        type="button"
                        onClick={() => void openDetail(req)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-secondary"
                      >
                        <Eye size={16} /> {t('common.details')}
                      </button>
                      {req.status !== 'verified' && (
                        <button
                          type="button"
                          disabled={actionLoading === req.id}
                          onClick={() => void handleAction(req.id, 'approve')}
                          className="rounded-xl bg-emerald-600 px-3 py-2.5 text-white hover:bg-emerald-700 disabled:opacity-40"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {req.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={actionLoading === req.id}
                          onClick={() => setRejectTarget({ id: req.id, mode: 'reject' })}
                          className="rounded-xl bg-rose-600 px-3 py-2.5 text-white hover:bg-rose-700 disabled:opacity-40"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
                {t('admin.verification.no_requests')}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">
                  {t('super_admin.review_modal_title', { name: detail.user?.fullName || detail.userName || t('common.unknown_user') })}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-1">UID: {detail.userId}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl p-2 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-2">
              <div>{t('super_admin.type_label')}: <strong>{detail.accountType === 'employer' ? t('auth.employer') : t('auth.worker')}</strong></div>
              <div>{t('common.region')}: <strong>{detail.user?.region || '—'}</strong></div>
              <div>{t('common.phone')}: <strong>{detail.user?.phoneNumber || '—'}</strong></div>
              <div>{t('super_admin.uploaded_at_label')}: <strong>{detail.createdAt ? format(new Date(detail.createdAt as string), 'dd MMM yyyy HH:mm', { locale: getDateLocale() }) : '—'}</strong></div>
              <div>{t('super_admin.reviewer_label')}: <strong>{detail.reviewedBy || '—'}</strong></div>
              <div>{t('super_admin.approved_at_label')}: <strong>{detail.approvedAt ? format(new Date(detail.approvedAt as string), 'dd MMM yyyy', { locale: getDateLocale() }) : '—'}</strong></div>
            </div>

            {detail.passportData && (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-blue-800">
                  {t('super_admin.passport_confidential')}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>{t('super_admin.passport_series_num')}: <strong>{detail.passportData.series} {detail.passportData.number}</strong></div>
                  <div>{t('super_admin.passport_pinfl')}: <strong className="font-mono">{detail.passportData.pinfl}</strong></div>
                  <div className="md:col-span-2">{t('super_admin.passport_fullname')}: <strong>{detail.passportData.fullName}</strong></div>
                  <div>{t('super_admin.passport_issued')}: <strong>{detail.passportData.issueDate || '—'}</strong></div>
                  <div>{t('super_admin.passport_expiry')}: <strong>{detail.passportData.expiryDate || '—'}</strong></div>
                </div>
              </div>
            )}

            <div className="mb-4 grid gap-4 md:grid-cols-2">
              <PhotoSlot
                url={resolveDocUrl(detail)}
                label={t('super_admin.main_document')}
                noLabel={t('super_admin.none_label')}
                onPreview={setPreviewUrl}
                onDownload={(u, n) => void downloadFile(u, n)}
              />
              <PhotoSlot
                url={resolveSelfieUrl(detail)}
                label={t('admin.verification.selfie')}
                noLabel={t('super_admin.none_label')}
                onPreview={setPreviewUrl}
                onDownload={(u, n) => void downloadFile(u, n)}
              />
              <PhotoSlot
                url={detail.addressProofUrl || null}
                label={t('super_admin.address_document')}
                noLabel={t('super_admin.none_label')}
                onPreview={setPreviewUrl}
                onDownload={(u, n) => void downloadFile(u, n)}
              />
              {extraUrls(detail).map((url, idx) => (
                <PhotoSlot
                  key={`${url}-${idx}`}
                  url={url}
                  label={t('super_admin.additional_doc_num', { num: idx + 1 })}
                  noLabel={t('super_admin.none_label')}
                  onPreview={setPreviewUrl}
                  onDownload={(u, n) => void downloadFile(u, n)}
                />
              ))}
            </div>

            <div className="mb-3 space-y-2">
              <label className="text-sm font-bold text-slate-700">{t('super_admin.internal_notes_label')}</label>
              <textarea
                className="min-h-20 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>

            {(detail.rejectionReason || detail.reviewNote) && (
              <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
                {t('super_admin.user_visible_reason')}: {detail.rejectionReason || detail.reviewNote}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionLoading === detail.id}
                onClick={() => void handleAction(detail.id, 'approve')}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                <CheckCircle size={16} /> {t('common.confirm')}
              </button>
              <button
                type="button"
                disabled={actionLoading === detail.id}
                onClick={() => setRejectTarget({ id: detail.id, mode: 'reject' })}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                <XCircle size={16} /> {t('common.reject')}
              </button>
              <button
                type="button"
                disabled={actionLoading === detail.id}
                onClick={() => setRejectTarget({ id: detail.id, mode: 'need_reupload' })}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold"
              >
                <RefreshCw size={16} /> {t('super_admin.reupload_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
      {rejectTarget && (
        <RejectModal
          title={rejectTarget.mode === 'need_reupload' ? t('super_admin.reupload_reason_title') : t('super_admin.reject_reason_title')}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reason) => {
            if (rejectTarget.id === 'bulk') {
              void handleBulk('reject', reason);
              setRejectTarget(null);
              return;
            }
            void handleAction(rejectTarget.id, rejectTarget.mode, reason);
          }}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
