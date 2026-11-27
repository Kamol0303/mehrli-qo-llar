import React, { useEffect, useState } from 'react';
import { Activity, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import type { AdminAuditLog } from '../../types';

export default function SuperAdminLogsPage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2);
  const dateLocale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminYandex.auditLogs();
      setAuditLogs(res.logs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <DashboardLayout title={t('super_admin.nav_logs')}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102833] text-white">
              <Activity className="h-6 w-6 text-[#c6a15b]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t('super_admin.nav_logs')}</h1>
              <p className="text-xs text-muted-foreground tabular-nums">{auditLogs.length}</p>
            </div>
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

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('super_admin.time_col')}</th>
                  <th className="px-4 py-3">{t('super_admin.admin_col')}</th>
                  <th className="px-4 py-3">{t('super_admin.action_col')}</th>
                  <th className="px-4 py-3">{t('super_admin.target_col')}</th>
                  <th className="px-4 py-3">{t('super_admin.coords_audit_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums">
                      {new Date(log.createdAt).toLocaleString(dateLocale)}
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">{log.adminName || log.adminId}</td>
                    <td className="px-4 py-3 font-bold text-[#1a7c78]">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[log.targetType, log.targetId].filter(Boolean).join(': ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {log.viewedExactCoords ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          <Eye className="h-3 w-3" />
                          {t('super_admin.exact_coords_badge')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
