import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle, Loader2, Pencil, RefreshCw, Search, ShieldCheck, Star, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import AdminUserEditModal, { type EditableAdminUser } from '../../components/admin/AdminUserEditModal';
import { appConfirm } from '../../lib/appDialog';
import { api } from '../../lib/api';

type AdminWorkerRow = Awaited<ReturnType<typeof api.adminYandex.workers>>['workers'][number];

export default function SuperAdminWorkersPage() {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<AdminWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditableAdminUser | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.workers();
      setWorkers(res.workers || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.fullName.toLowerCase().includes(q) ||
        (w.phoneNumber || '').toLowerCase().includes(q) ||
        (w.email || '').toLowerCase().includes(q) ||
        (w.district || '').toLowerCase().includes(q) ||
        w.uid.toLowerCase().includes(q),
    );
  }, [workers, search]);

  const toggleBlock = async (row: AdminWorkerRow) => {
    setBusyId(row.uid);
    try {
      const next = !row.isBlocked;
      await api.adminYandex.setUserBlock(row.uid, next, next ? 'Admin moderation' : undefined);
      setWorkers((prev) => prev.map((w) => (w.uid === row.uid ? { ...w, isBlocked: next } : w)));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: AdminWorkerRow) => {
    const ok = await appConfirm(t('super_admin.confirm_delete_user_permanent', { name: row.fullName }));
    if (!ok) return;
    setBusyId(row.uid);
    try {
      await api.adminYandex.deleteUser(row.uid);
      setWorkers((prev) => prev.filter((w) => w.uid !== row.uid));
      setNotice({ type: 'success', text: t('super_admin.user_deleted') });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : t('super_admin.error_generic') });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout title={t('super_admin.nav_workers')}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1a7c78] text-white">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_workers')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{filteredWorkers.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('super_admin.search_name_phone_uid')}
                className="w-full min-h-[40px] rounded-xl border border-border bg-card pl-9 pr-3 text-xs font-medium"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('onboarding.refresh_kyc')}
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`rounded-2xl border px-4 py-3 text-xs font-bold ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('auth.full_name')}</th>
                  <th className="px-4 py-3">KYC</th>
                  <th className="px-4 py-3">{t('profile.rating')}</th>
                  <th className="px-4 py-3">{t('super_admin.acceptance_col')}</th>
                  <th className="px-4 py-3">{t('contract.status')}</th>
                  <th className="px-4 py-3 text-right">{t('super_admin.action_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredWorkers.map((w) => (
                  <tr key={w.uid} className="hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-foreground">{w.fullName}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {w.phoneNumber || '—'} · {w.district || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {w.isVerified ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[#1a7c78]">
                          <ShieldCheck className="h-3.5 w-3.5" /> {t('yandex.verified_badge')}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-bold">{w.verificationStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                        {Number(w.rating || 0).toFixed(1)} ({w.reviewCount})
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">{w.acceptanceRate}% ({w.acceptedOffers}/{w.totalOffers})</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${w.isOnline ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {w.isOnline ? t('super_admin.online_badge') : t('super_admin.offline_badge')}
                      </span>
                      {w.isBlocked && <span className="ml-2 font-bold text-rose-600">{t('super_admin.blocked_badge')}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              uid: w.uid,
                              fullName: w.fullName,
                              email: w.email,
                              phoneNumber: w.phoneNumber,
                              role: 'worker',
                              region: w.region,
                              district: w.district,
                              profession: w.profession,
                              skills: w.skills,
                              bio: w.bio,
                              isVerified: w.isVerified,
                              isBlocked: w.isBlocked,
                            })
                          }
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-bold text-foreground hover:bg-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('super_admin.edit_user')}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === w.uid}
                          onClick={() => void toggleBlock(w)}
                          className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-white ${
                            w.isBlocked ? 'bg-[#1a7c78]' : 'bg-amber-600'
                          }`}
                        >
                          {w.isBlocked ? <CheckCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          {w.isBlocked ? t('super_admin.unblock') : t('super_admin.block')}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === w.uid}
                          onClick={() => void handleDelete(w)}
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
          )}
        </div>
      </div>

      {editing && (
        <AdminUserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice({ type: 'success', text: t('super_admin.user_updated') });
            void load();
          }}
        />
      )}
    </DashboardLayout>
  );
}
