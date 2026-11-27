import { debugLogger } from '../../lib/debugLogger';
import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { FileText, CheckCircle, XCircle, Clock, User, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import systemLogService from '../../services/systemLogService';
import { notificationService } from '../../services/notificationService';
import { formatSom } from '../../constants/yandexServices';

export interface Contract {
  id?: string;
  ishchi: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  ish_beruvchi: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  jobId: string;
  jobTitle: string;
  amount: number;
  currency: string;
  startDate: string | Date;
  endDate?: string | Date;
  description?: string;
  termsAccepted: boolean;
  signatures?: {
    worker?: {
      date: string | Date;
      signature: string;
    };
    employer?: {
      date: string | Date;
      signature: string;
    };
  };
  adminApproved: 'pending' | 'approved' | 'rejected';
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function SuperAdminContractsPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processMessage, setProcessMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const mapContract = async (c: import('../../types').Contract): Promise<Contract> => {
      const [worker, employer] = await Promise.all([
        api.users.get(c.workerId).catch(() => null),
        api.users.get(c.employerId).catch(() => null),
      ]);
      const adminStatus: Contract['adminApproved'] =
        c.adminApproved === true ? 'approved' :
        c.status === 'cancelled' ? 'rejected' : 'pending';

      return {
        id: c.id,
        ishchi: {
          id: c.workerId,
          name: worker?.fullName || c.workerName || t('contract.worker'),
          email: worker?.email || '',
          phone: worker?.phoneNumber,
        },
        ish_beruvchi: {
          id: c.employerId,
          name: employer?.fullName || c.employerName || t('contract.employer'),
          email: employer?.email || '',
          phone: employer?.phoneNumber,
        },
        jobId: c.jobId || '',
        jobTitle: c.jobTitle || t('super_admin.contract_default_title'),
        amount: c.amount || 0,
        currency: 'UZS',
        startDate: c.startDate || new Date().toISOString(),
        endDate: c.endDate,
        description: c.terms,
        termsAccepted: Boolean((c.signedByWorker ?? c.workerSigned) && (c.signedByEmployer ?? c.employerSigned)),
        signatures: {
          worker: (c.signedByWorker ?? c.workerSigned)
            ? { date: c.updatedAt || new Date().toISOString(), signature: 'signed' }
            : undefined,
          employer: (c.signedByEmployer ?? c.employerSigned)
            ? { date: c.updatedAt || new Date().toISOString(), signature: 'signed' }
            : undefined,
        },
        adminApproved: adminStatus,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    };

    const load = async () => {
      try {
        const rows = await api.contracts.list();
        const mapped = await Promise.all(rows.map(mapContract));
        if (!cancelled) {
          setContracts(mapped);
          setLoading(false);
        }
      } catch (error) {
        debugLogger.error('Error loading contracts:', error);
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filteredContracts = filterStatus === 'all'
    ? contracts
    : contracts.filter(c => c.adminApproved === filterStatus);

  const handleApproveContract = async (contractId: string) => {
    if (!profile?.uid) return;

    setProcessingId(contractId);
    setProcessMessage(t('super_admin.approving_process'));

    try {
      // Update contract status
      await api.contracts.update(contractId, {
        adminApproved: true,
        status: 'active',
      });

      // Log the action
      await systemLogService.logAction(
        'APPROVE_CONTRACT',
        profile.uid,
        profile.email,
        { contractId },
        'info'
      );

      // Send notifications to both parties
      const contract = contracts.find(c => c.id === contractId);
      if (contract) {
        // Notify worker
        await notificationService.create({
          userId: contract.ishchi.id,
          title: t('contract.notification_approved_title'),
          message: t('contract.notification_approved_message', { jobTitle: contract.jobTitle }),
          type: 'contract'
        });

        // Notify employer
        await notificationService.create({
          userId: contract.ish_beruvchi.id,
          title: t('contract.notification_approved_title'),
          message: t('contract.notification_approved_message', { jobTitle: contract.jobTitle }),
          type: 'contract'
        });
      }

      setProcessMessage(t('super_admin.contract_approved_msg'));
      setTimeout(() => {
        setProcessingId(null);
        setProcessMessage('');
      }, 2000);
    } catch (error) {
      debugLogger.error('Error approving contract:', error);
      setProcessMessage(t('super_admin.error_generic'));
      setTimeout(() => {
        setProcessingId(null);
        setProcessMessage('');
      }, 2000);
    }
  };

  const handleRejectContract = async (contractId: string) => {
    if (!profile?.uid) return;

    setProcessingId(contractId);
    setProcessMessage(t('super_admin.rejecting_process'));

    try {
      // Update contract status
      await api.contracts.update(contractId, {
        adminApproved: false,
        status: 'cancelled',
      });

      // Log the action
      await systemLogService.logAction(
        'REJECT_CONTRACT',
        profile.uid,
        profile.email,
        { contractId },
        'warning'
      );

      // Send notifications to both parties
      const contract = contracts.find(c => c.id === contractId);
      if (contract) {
        // Notify worker
        await notificationService.create({
          userId: contract.ishchi.id,
          title: t('super_admin.contract_rejected_msg'),
          message: `${contract.jobTitle} — ${t('super_admin.contract_rejected_msg')}`,
          type: 'contract'
        });

        // Notify employer
        await notificationService.create({
          userId: contract.ish_beruvchi.id,
          title: t('super_admin.contract_rejected_msg'),
          message: `${contract.jobTitle} — ${t('super_admin.contract_rejected_msg')}`,
          type: 'contract'
        });
      }

      setProcessMessage(t('super_admin.contract_rejected_msg'));
      setTimeout(() => {
        setProcessingId(null);
        setProcessMessage('');
      }, 2000);
    } catch (error) {
      debugLogger.error('Error rejecting contract:', error);
      setProcessMessage(t('super_admin.error_generic'));
      setTimeout(() => {
        setProcessingId(null);
        setProcessMessage('');
      }, 2000);
    }
  };

  const formatDate = (timestamp: any) => {
    try {
      const date = timestamp?.toDate?.() || new Date(timestamp);
      const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ';
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch {
      return '—';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock, text: 'text-amber-700', label: t('common.pending') };
      case 'approved':
        return { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, text: 'text-green-700', label: t('common.approved') };
      case 'rejected':
        return { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, text: 'text-red-700', label: t('common.rejected') };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', icon: FileText, text: 'text-gray-700', label: t('common.unknown') };
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
              <FileText size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t('super_admin.contracts_audit_title')}</h1>
              <p className="text-gray-500 text-sm font-medium">{t('super_admin.contracts_audit_sub')}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-gray-900">{contracts.length}</div>
            <p className="text-xs text-gray-500">{t('super_admin.total_contracts')}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl p-2 border border-gray-100 w-fit">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(status => {
            const count = status === 'all'
              ? contracts.length
              : contracts.filter(c => c.adminApproved === status).length;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  filterStatus === status
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {status === 'all' ? t('common.all') : status === 'pending' ? t('common.pending') : status === 'approved' ? t('common.approved') : t('common.rejected')}
                <span className="ml-2 text-xs">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Contracts List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-gray-100">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-spin">
                <div className="w-8 h-8 bg-indigo-500 rounded-full" />
              </div>
              <p className="text-gray-600 font-medium">{t('super_admin.contracts_loading')}</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-gray-100">
              <FileText size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t('super_admin.contracts_not_found')}</p>
            </div>
          ) : (
            filteredContracts.map((contract, idx) => {
              const badge = getStatusBadge(contract.adminApproved);
              const StatusIcon = badge.icon;
              const isProcessing = processingId === contract.id;

              return (
                <motion.div
                  key={contract.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`${badge.bg} border-2 ${badge.border} rounded-3xl p-6 space-y-4`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-black text-gray-900">{contract.jobTitle}</h3>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white ${badge.border} border`}>
                          <StatusIcon size={14} className={badge.text} />
                          <span className={`text-xs font-black uppercase ${badge.text}`}>{badge.label}</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">{t('super_admin.contract_id_label')}: {contract.id}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-gray-900">
                        {formatSom(contract.amount, i18n.language)}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{t('super_admin.total_price')}</p>
                    </div>
                  </div>

                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-4">
                      <p className="text-xs font-black text-gray-500 uppercase mb-2">{t('contract.worker')}</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User size={16} className="text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{contract.ishchi.name}</p>
                          <p className="text-xs text-gray-500">{contract.ishchi.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-4">
                      <p className="text-xs font-black text-gray-500 uppercase mb-2">{t('contract.employer')}</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User size={16} className="text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{contract.ish_beruvchi.name}</p>
                          <p className="text-xs text-gray-500">{contract.ish_beruvchi.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="bg-white rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">{t('contract.start_date')}:</span>
                      <span className="text-sm font-bold text-gray-900">{formatDate(contract.startDate)}</span>
                    </div>
                    {contract.endDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">{t('contract.end_date')}:</span>
                        <span className="text-sm font-bold text-gray-900">{formatDate(contract.endDate)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">{t('super_admin.terms_accepted_label')}:</span>
                      <span className={`text-sm font-bold ${contract.termsAccepted ? 'text-green-600' : 'text-red-600'}`}>
                        {contract.termsAccepted ? `✓ ${t('common.yes')}` : `✗ ${t('common.no')}`}
                      </span>
                    </div>
                  </div>

                  {/* Signatures Status */}
                  {contract.signatures && (
                    <div className="bg-white rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-black text-gray-500 uppercase">{t('super_admin.signatures_status')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`p-3 rounded-xl ${contract.signatures.worker ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <p className="text-xs font-bold text-gray-600 mb-1">{t('contract.worker')}</p>
                          <p className={`text-xs font-bold ${contract.signatures.worker ? 'text-green-600' : 'text-gray-400'}`}>
                            {contract.signatures.worker ? t('super_admin.signed_label') : t('super_admin.unsigned_label')}
                          </p>
                        </div>
                        <div className={`p-3 rounded-xl ${contract.signatures.employer ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <p className="text-xs font-bold text-gray-600 mb-1">{t('contract.employer')}</p>
                          <p className={`text-xs font-bold ${contract.signatures.employer ? 'text-green-600' : 'text-gray-400'}`}>
                            {contract.signatures.employer ? t('super_admin.signed_label') : t('super_admin.unsigned_label')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {contract.description && (
                    <div className="bg-white rounded-2xl p-4">
                      <p className="text-xs font-black text-gray-500 uppercase mb-2">{t('super_admin.contract_desc')}</p>
                      <p className="text-sm text-gray-700">{contract.description}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {contract.adminApproved === 'pending' && (
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleApproveContract(contract.id!)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all"
                      >
                        <CheckCircle size={18} />
                        {isProcessing && processingId === contract.id ? processMessage : t('common.approve')}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleRejectContract(contract.id!)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all"
                      >
                        <XCircle size={18} />
                        {isProcessing && processingId === contract.id ? processMessage : t('common.reject')}
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
