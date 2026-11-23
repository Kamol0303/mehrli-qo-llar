/**
 * Strict Yandex Go-style Order & Offer State Machines
 *
 * Pure module (zero I/O) for fast deterministic unit testing and server enforcement.
 */

export const ORDER_STATES = [
  'qidirilmoqda',
  'taklif_yuborildi',
  'qabul_qilindi',
  'yolda',
  'yetib_keldi',
  'jarayonda',
  'yakunlandi',
  'bekor_qilindi',
  'muddati_otdi',
] as const;

export type OrderLifecycleStatus = (typeof ORDER_STATES)[number];

export const OFFER_STATES = [
  'kutilmoqda',
  'qabul_qilindi',
  'rad_etildi',
  'muddati_otdi',
  'bekor_qilindi',
] as const;

export type OfferStatus = (typeof OFFER_STATES)[number];

export const ACTIVE_ORDER_STATES: readonly OrderLifecycleStatus[] = [
  'qidirilmoqda',
  'taklif_yuborildi',
  'qabul_qilindi',
  'yolda',
  'yetib_keldi',
  'jarayonda',
];

export const TERMINAL_ORDER_STATES: readonly OrderLifecycleStatus[] = [
  'yakunlandi',
  'bekor_qilindi',
  'muddati_otdi',
];

const ALLOWED_ORDER_TRANSITIONS: Record<OrderLifecycleStatus, readonly OrderLifecycleStatus[]> = {
  qidirilmoqda: ['taklif_yuborildi', 'qabul_qilindi', 'bekor_qilindi', 'muddati_otdi'],
  taklif_yuborildi: ['qidirilmoqda', 'qabul_qilindi', 'bekor_qilindi', 'muddati_otdi'],
  qabul_qilindi: ['yolda', 'bekor_qilindi'],
  yolda: ['yetib_keldi', 'bekor_qilindi'],
  yetib_keldi: ['jarayonda', 'bekor_qilindi'],
  jarayonda: ['yakunlandi', 'bekor_qilindi'],
  yakunlandi: [],
  bekor_qilindi: [],
  muddati_otdi: [],
};

const ALLOWED_OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  kutilmoqda: ['qabul_qilindi', 'rad_etildi', 'muddati_otdi', 'bekor_qilindi'],
  qabul_qilindi: [],
  rad_etildi: [],
  muddati_otdi: [],
  bekor_qilindi: [],
};

export class StateTransitionError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'INVALID_STATE_TRANSITION') {
    super(message);
    this.name = 'StateTransitionError';
    this.code = code;
  }
}

export function isOrderState(value: string): value is OrderLifecycleStatus {
  return (ORDER_STATES as readonly string[]).includes(value);
}

export function isActiveOrderState(status: string): boolean {
  return (ACTIVE_ORDER_STATES as readonly string[]).includes(status);
}

export function isOfferState(value: string): value is OfferStatus {
  return (OFFER_STATES as readonly string[]).includes(value);
}

export function canTransitionOrder(
  from: OrderLifecycleStatus,
  to: OrderLifecycleStatus,
  options?: { contractSigned?: boolean },
): { ok: true } | { ok: false; reason: string; code: string } {
  if (!isOrderState(from) || !isOrderState(to)) {
    return {
      ok: false,
      code: 'UNKNOWN_STATUS',
      reason: `Noma’lum buyurtma holati: ${from} → ${to}`,
    };
  }

  const allowed = ALLOWED_ORDER_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      reason: `Buyurtma holatini ${from} dan ${to} ga o‘tkazish mumkin emas`,
    };
  }

  if (to === 'jarayonda' && !options?.contractSigned) {
    return {
      ok: false,
      code: 'CONTRACT_REQUIRED',
      reason: 'Ishni boshlash ("jarayonda") uchun avval raqamli shartnoma ikkala tomonidan imzolanishi shart',
    };
  }

  return { ok: true };
}

export function assertOrderTransition(
  from: OrderLifecycleStatus,
  to: OrderLifecycleStatus,
  options?: { contractSigned?: boolean },
): void {
  const check = canTransitionOrder(from, to, options);
  if (!check.ok) {
    throw new StateTransitionError(check.reason, check.code);
  }
}

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  if (!isOfferState(from) || !isOfferState(to)) return false;
  return (ALLOWED_OFFER_TRANSITIONS[from] || []).includes(to);
}

export function assertOfferTransition(from: OfferStatus, to: OfferStatus): void {
  if (!canTransitionOffer(from, to)) {
    throw new StateTransitionError(
      `Taklif holatini ${from} dan ${to} ga o‘tkazish mumkin emas`,
      'INVALID_OFFER_TRANSITION',
    );
  }
}
