export type OrderStatus =
  | 'open'
  | 'matching'
  | 'offer_sent'
  | 'pending'
  | 'accepted'
  | 'on_the_way'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'rejected'
  | 'withdrawn';

export interface StatusMeta {
  code: OrderStatus;
  labelUz: string;
  labelRu: string;
  labelEn: string;
  colorClass: string;
  badgeBg: string;
}

export const ORDER_STATUS_MAP: Record<string, StatusMeta> = {
  open: {
    code: 'open',
    labelUz: 'Yangi',
    labelRu: 'Новый',
    labelEn: 'Open',
    colorClass: 'text-sky-700 dark:text-sky-400',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800',
  },
  matching: {
    code: 'matching',
    labelUz: 'Ishchi qidirilmoqda',
    labelRu: 'Подбор исполнителя',
    labelEn: 'Matching',
    colorClass: 'text-indigo-700 dark:text-indigo-400',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800',
  },
  offer_sent: {
    code: 'offer_sent',
    labelUz: 'Taklif yuborildi',
    labelRu: 'Предложение отправлено',
    labelEn: 'Offer Sent',
    colorClass: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800',
  },
  pending: {
    code: 'pending',
    labelUz: 'Kutilmoqda',
    labelRu: 'В ожидании',
    labelEn: 'Pending',
    colorClass: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800',
  },
  accepted: {
    code: 'accepted',
    labelUz: 'Qabul qilindi',
    labelRu: 'Принято',
    labelEn: 'Accepted',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800',
  },
  on_the_way: {
    code: 'on_the_way',
    labelUz: 'Yo‘lda',
    labelRu: 'В пути',
    labelEn: 'On the way',
    colorClass: 'text-blue-700 dark:text-blue-400',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800',
  },
  started: {
    code: 'started',
    labelUz: 'Ish boshlandi',
    labelRu: 'Работа начата',
    labelEn: 'In Progress',
    colorClass: 'text-teal-700 dark:text-teal-400',
    badgeBg: 'bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800',
  },
  completed: {
    code: 'completed',
    labelUz: 'Tugallandi',
    labelRu: 'Завершено',
    labelEn: 'Completed',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800',
  },
  cancelled: {
    code: 'cancelled',
    labelUz: 'Bekor qilindi',
    labelRu: 'Отменено',
    labelEn: 'Cancelled',
    colorClass: 'text-slate-600 dark:text-slate-400',
    badgeBg: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
  },
  disputed: {
    code: 'disputed',
    labelUz: 'Nizo',
    labelRu: 'Спор',
    labelEn: 'Disputed',
    colorClass: 'text-rose-700 dark:text-rose-400',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800',
  },
  rejected: {
    code: 'rejected',
    labelUz: 'Rad etildi',
    labelRu: 'Отклонено',
    labelEn: 'Rejected',
    colorClass: 'text-rose-700 dark:text-rose-400',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800',
  },
  withdrawn: {
    code: 'withdrawn',
    labelUz: 'Qaytarib olindi',
    labelRu: 'Отозвано',
    labelEn: 'Withdrawn',
    colorClass: 'text-slate-600 dark:text-slate-400',
    badgeBg: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
  },
};

export function getOrderStatusLabel(status?: string, lang: string = 'uz'): string {
  if (!status) return '—';
  const meta = ORDER_STATUS_MAP[status.toLowerCase()];
  if (!meta) return status;
  if (lang === 'ru') return meta.labelRu;
  if (lang === 'en') return meta.labelEn;
  return meta.labelUz;
}

export function getOrderStatusMeta(status?: string): StatusMeta {
  if (!status) return ORDER_STATUS_MAP.open;
  return ORDER_STATUS_MAP[status.toLowerCase()] || ORDER_STATUS_MAP.open;
}
