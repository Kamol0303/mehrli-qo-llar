import { debugLogger } from '../lib/debugLogger';
import { api } from '../lib/api';
import i18n from '../i18n';
import { formatSom } from '../constants/yandexServices';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: 'application' | 'contract' | 'message' | 'dispute' | 'system';
  link?: string;
}

export const notificationService = {
  async create(params: CreateNotificationParams): Promise<boolean> {
    try {
      await api.notifications.create({
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        link: params.link || '',
        read: false,
      });
      return true;
    } catch (error) {
      debugLogger.error('Error creating notification:', error);
      return false;
    }
  },

  async list(userId: string) {
    return api.notifications.list(userId);
  },

  async markRead(id: string) {
    return api.notifications.update(id, { read: true });
  },

  async notifyNewApplication(employerId: string, workerName: string, jobTitle: string, _applicationId: string) {
    return this.create({
      userId: employerId,
      title: i18n.t('notify.new_app_title'),
      message: i18n.t('notify.new_app_msg', { workerName, jobTitle }),
      type: 'application',
      link: '/employer/dashboard',
    });
  },

  async notifyApplicationAccepted(workerId: string, jobTitle: string) {
    return this.create({
      userId: workerId,
      title: i18n.t('notify.app_accepted_title'),
      message: i18n.t('notify.app_accepted_msg', { jobTitle }),
      type: 'application',
      link: '/my-work',
    });
  },

  async notifyApplicationRejected(workerId: string, jobTitle: string) {
    return this.create({
      userId: workerId,
      title: i18n.t('notify.app_rejected_title'),
      message: i18n.t('notify.app_rejected_msg', { jobTitle }),
      type: 'application',
      link: '/jobs',
    });
  },

  async notifyNewContract(userId: string, role: 'worker' | 'employer', jobTitle: string, contractId: string) {
    return this.create({
      userId,
      title: i18n.t('notify.new_contract_title'),
      message: i18n.t('notify.new_contract_msg', { jobTitle }),
      type: 'contract',
      link: role === 'worker' ? '/worker/contracts' : `/employer/contracts?highlight=${contractId}`,
    });
  },

  async notifyNewMessage(receiverId: string, senderName: string, messagePreview: string) {
    return this.create({
      userId: receiverId,
      title: i18n.t('notify.new_msg_title'),
      message: `${senderName}: ${messagePreview.substring(0, 50)}...`,
      type: 'message',
      link: '/chat',
    });
  },

  async notifyContractSigned(userId: string, role: 'worker' | 'employer', jobTitle: string) {
    const signer = role === 'worker' ? i18n.t('auth.employer') : i18n.t('auth.worker');
    return this.create({
      userId,
      title: i18n.t('notify.contract_signed_title'),
      message: i18n.t('notify.contract_signed_msg', { jobTitle, signer }),
      type: 'contract',
      link: role === 'worker' ? '/worker/contracts' : '/employer/contracts',
    });
  },

  async notifyContractCompleted(userId: string, jobTitle: string, amount: number) {
    return this.create({
      userId,
      title: i18n.t('notify.contract_completed_title'),
      message: i18n.t('notify.contract_completed_msg', {
        jobTitle,
        amount: formatSom(amount, i18n.resolvedLanguage || i18n.language),
      }),
      type: 'contract',
      link: '/contracts',
    });
  },

  async notifyVerificationApproved(userId: string) {
    return this.create({
      userId,
      title: i18n.t('notify.verify_approved_title'),
      message: i18n.t('notify.verify_approved_msg'),
      type: 'system',
      link: '/my-profile',
    });
  },

  async notifyVerificationRejected(userId: string, reason: string) {
    return this.create({
      userId,
      title: i18n.t('notify.verify_rejected_title'),
      message: i18n.t('notify.verify_rejected_msg', { reason }),
      type: 'system',
      link: '/verification',
    });
  },
};
