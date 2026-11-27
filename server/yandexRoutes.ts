import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppDatabase, UserRole } from './db';
import { nowIso, normalizeEmail, normalizePhone, splitName } from './db';
import {
  YANDEX_DURATION_TYPES,
  YANDEX_SERVICE_TYPES,
  acceptOfferAtomic,
  assignOrderToWorkerByAdmin,
  dispatchNextOfferForOrder,
  getMatchingSettings,
  hasNoOfferExpiry,
  haversineKm,
  rejectOfferForWorker,
  sweepExpiredOffersAndLocations,
  updateWorkerGeoRow,
} from './matching';
import {
  canTransitionOrder,
  isOrderState,
  type OrderLifecycleStatus,
} from './orderStateMachine';
import {
  getBucketWindow,
  obfuscatePreAcceptCoords,
  redactCoordinatesFromLogPayload,
} from './privacyAndCoords';
import { dispatchPushEvent, realtimeHub } from './realtime';

const UZ_PHONE_REGEX = /^\+998\d{9}$/;

export interface AuthPrincipal {
  userId: string;
  role: UserRole;
  email?: string | null;
}

export interface YandexRouterDeps {
  db: AppDatabase;
  getAuth: (req: Request) => AuthPrincipal | null;
  requireAuth: (req: Request, res: Response) => AuthPrincipal | null;
  verifyTokenString: (token: string) => AuthPrincipal | null;
}

function createOrderRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({
        message: 'Juda ko‘p so‘rov yuborildi. Biroz kutib qayta urinib ko‘ring.',
      });
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits.entries()) {
        if (v.every((ts) => now - ts >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function formatOrderRow(row: Record<string, unknown>, opts: { includeExactEmployerLocation: boolean }) {
  const out = {
    id: String(row.id),
    employerId: String(row.employer_id),
    employerName: row.employer_name ? String(row.employer_name) : null,
    workerId: row.worker_id ? String(row.worker_id) : null,
    workerName: row.worker_name ? String(row.worker_name) : null,
    contractId: row.contract_id ? String(row.contract_id) : null,
    serviceType: String(row.service_type),
    durationType: String(row.duration_type),
    paymentMethod: String(row.payment_method || 'cash'),
    recommendedRate: Number(row.recommended_rate || 0),
    agreedRate: Number(row.agreed_rate || 0),
    status: String(row.status) as OrderLifecycleStatus,
    currentRadiusKm: Number(row.current_radius_km || 5),
    searchStep: Number(row.search_step || 0),
    contractSigned: Boolean(row.contract_signed),
    employerRated: Boolean(row.employer_rated),
    workerRated: Boolean(row.worker_rated),
    cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    cancelledByRole: row.cancelled_by_role ? String(row.cancelled_by_role) : null,
    cancelledById: row.cancelled_by_id ? String(row.cancelled_by_id) : null,
    note: row.note ? String(row.note) : null,
    district: row.district ? String(row.district) : null,
    statusHistory: (() => {
      try {
        return JSON.parse(String(row.status_history || '[]'));
      } catch {
        return [];
      }
    })(),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    matchedAt: row.matched_at ? String(row.matched_at) : null,
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    arrivedAt: row.arrived_at ? String(row.arrived_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    lat: opts.includeExactEmployerLocation ? Number(row.lat) : undefined,
    lng: opts.includeExactEmployerLocation ? Number(row.lng) : undefined,
    addressText: opts.includeExactEmployerLocation
      ? (row.address_text ? String(row.address_text) : null)
      : null,
  };
  return out;
}

export function attachYandexRoutes(router: express.Router, deps: YandexRouterDeps): void {
  const { db, getAuth, requireAuth, verifyTokenString } = deps;
  const sqlite = db.sqlite;
  const orderRateLimit = createOrderRateLimiter(60_000, 12);
  const sosRateLimit = createOrderRateLimiter(60_000, 6);

  // --- REALTIME SSE STREAM ---
  router.get('/realtime/stream', (req, res) => {
    let auth = getAuth(req);
    if (!auth && typeof req.query.token === 'string' && req.query.token.trim()) {
      auth = verifyTokenString(req.query.token.trim());
    }
    if (!auth) {
      return res.status(401).json({ message: 'Avtorizatsiya talab qilinadi' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const detach = realtimeHub.addClient(auth.userId, auth.role, res);
    req.on('close', () => {
      detach();
    });
  });

  // --- PUSH DEVICE REGISTRATION ---
  router.post('/push/register', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const token = String(req.body?.token || '').trim().slice(0, 512);
    const platformRaw = String(req.body?.platform || 'web').trim().toLowerCase();
    const platform: 'web' | 'android' | 'ios' =
      platformRaw === 'android' ? 'android' : platformRaw === 'ios' ? 'ios' : 'web';
    if (!token) {
      return res.status(400).json({ message: 'Push token majburiy' });
    }
    db.upsertPushToken(auth.userId, platform, token);
    res.json({ success: true });
  });

  router.delete('/push/register', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const token = req.body?.token ? String(req.body.token).trim() : undefined;
    db.deletePushTokensForUser(auth.userId, token);
    res.json({ success: true });
  });

  // --- ONBOARDING ROLE & PROFILE COMPLETION (First-time Telegram flow) ---
  router.patch('/auth/complete-onboarding', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    const requestedRole = req.body?.role;
    if (requestedRole === 'worker' || requestedRole === 'employer') {
      // Strictly never allows self-elevation to admin or super_admin
      if (user.role === 'worker' || user.role === 'employer') {
        user.role = requestedRole;
      }
    }

    const fullNameInput = String(req.body?.fullName || '').trim();
    if (fullNameInput.length >= 2) {
      const parts = splitName(fullNameInput);
      user.fullName = parts.fullName.slice(0, 120);
      user.firstName = parts.firstName.slice(0, 60) || user.firstName;
      user.lastName = parts.lastName.slice(0, 60) || user.lastName;
    }

    if (req.body?.phoneNumber || req.body?.phone) {
      const normalized = normalizePhone(String(req.body.phoneNumber || req.body.phone));
      if (!UZ_PHONE_REGEX.test(normalized)) {
        return res.status(400).json({ message: 'Telefon raqami +998XXXXXXXXX formatida bo‘lishi kerak' });
      }
      const existingPhoneOwner = db.getUserByPhone(normalized);
      if (existingPhoneOwner && existingPhoneOwner.id !== user.id) {
        return res.status(409).json({ message: 'Bu telefon raqami boshqa hisobga biriktirilgan' });
      }
      user.phoneNumber = normalized;
    }

    if (user.role === 'employer') {
      const isOrg = Boolean(req.body?.isOrganization || req.body?.companyName);
      if (isOrg && req.body?.companyName) {
        user.companyName = String(req.body.companyName).trim().slice(0, 120);
        user.businessType = 'organization';
      }
      if (req.body?.registrationNumber) {
        user.registrationNumber = String(req.body.registrationNumber).trim().slice(0, 80);
      }
      if (req.body?.tin) {
        user.tin = String(req.body.tin).trim().slice(0, 30);
      }
      if (Array.isArray(req.body?.companyDocuments)) {
        user.companyDocuments = req.body.companyDocuments;
      }
      // Employer verified once Telegram + Phone confirmed (plus company doc if org)
      if ((user.telegramId || user.telegram) && user.phoneNumber) {
        user.isVerified = true;
        user.verificationStatus = 'verified';
      }
    }

    const pi = (user.personalInfo && typeof user.personalInfo === 'object' ? user.personalInfo : {}) as Record<
      string,
      unknown
    >;
    user.personalInfo = {
      ...pi,
      onboardingCompleted: true,
      permissionsAcknowledged: Boolean(req.body?.permissionsAcknowledged ?? pi.permissionsAcknowledged),
    };
    user.updatedAt = nowIso();
    db.upsertUser(user);

    res.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        telegramId: user.telegramId ?? null,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        companyName: user.companyName,
        personalInfo: user.personalInfo,
      },
    });
  });

  // --- PUBLIC TARIFF MATRIX (Service × Duration recommended rates) ---
  router.get('/tariffs', (_req, res) => {
    const rows = sqlite
      .prepare('SELECT id, service_type, duration_type, rate_som, updated_at FROM tarif_stavkalari ORDER BY service_type, duration_type')
      .all() as Array<{
      id: string;
      service_type: string;
      duration_type: string;
      rate_som: number;
      updated_at: string;
    }>;

    res.json({
      services: YANDEX_SERVICE_TYPES,
      durations: YANDEX_DURATION_TYPES,
      rates: rows.map((r) => ({
        id: r.id,
        serviceType: r.service_type,
        durationType: r.duration_type,
        rateSom: Number(r.rate_som),
        updatedAt: r.updated_at,
      })),
    });
  });

  // --- PRE-ACCEPTANCE PRIVACY MAP FOR EMPLOYER (~250m obfuscated coordinates, zero exact leak) ---
  router.get('/map/nearby-workers', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(50, Math.max(1, Number(req.query.radiusKm || 15)));
    const serviceType = req.query.serviceType ? String(req.query.serviceType) : undefined;

    if (!isValidCoord(lat, lng)) {
      return res.status(400).json({ message: 'Joylashuv koordinatalari noto‘g‘ri' });
    }

    const bounds = getBucketWindow(lat, lng, radiusKm);
    const rows = sqlite
      .prepare(
        `SELECT ih.worker_id, ih.service_types, ih.lat, ih.lng, u.rating, u.completed_jobs, u.is_verified
         FROM ishchi_holati ih
         JOIN users u ON u.id = ih.worker_id
         WHERE ih.is_online = 1
           AND ih.kyc_verified = 1
           AND ih.active_order_id IS NULL
           AND u.is_blocked = 0
           AND ih.lat_bucket BETWEEN ? AND ?
           AND ih.lng_bucket BETWEEN ? AND ?
         LIMIT 60`,
      )
      .all(bounds.minLatBucket, bounds.maxLatBucket, bounds.minLngBucket, bounds.maxLngBucket) as Array<{
      worker_id: string;
      service_types: string;
      lat: number;
      lng: number;
      rating: number;
      completed_jobs: number;
      is_verified: number;
    }>;

    const bucketSlot = Math.floor(Date.now() / (10 * 60_000));
    const points = rows
      .filter((r) => {
        if (r.lat == null || r.lng == null) return false;
        const d = haversineKm(lat, lng, r.lat, r.lng);
        if (d > radiusKm) return false;
        if (serviceType) {
          try {
            const list = JSON.parse(r.service_types || '[]') as string[];
            if (list.length > 0 && !list.includes(serviceType) && !list.includes('other')) return false;
          } catch {
            /* keep */
          }
        }
        return true;
      })
      .map((r, idx) => {
        const obfuscated = obfuscatePreAcceptCoords(r.lat, r.lng, `${r.worker_id}:${bucketSlot}`);
        return {
          anonId: `w_${idx + 1}`,
          lat: obfuscated.lat,
          lng: obfuscated.lng,
          approxRadiusMeters: obfuscated.approxRadiusMeters,
          rating: Number(r.rating || 4.8),
          completedJobs: Number(r.completed_jobs || 0),
          isVerified: Boolean(r.is_verified),
        };
      });

    res.json({ workers: points, privacyObfuscated: true, approxRadiusMeters: 250 });
  });

  // --- WORKER ONLINE STATUS & INCOMING OFFERS ---
  router.get('/worker/status', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(404).json({ message: 'Topilmadi' });

    const row = sqlite
      .prepare('SELECT * FROM ishchi_holati WHERE worker_id = ?')
      .get(auth.userId) as Record<string, unknown> | undefined;

    let serviceTypes: string[] = [];
    if (row?.service_types) {
      try {
        serviceTypes = JSON.parse(String(row.service_types));
      } catch {
        serviceTypes = [];
      }
    }

    res.json({
      workerId: auth.userId,
      isOnline: Boolean(row?.is_online),
      kycVerified: Boolean(user.isVerified && user.verificationStatus === 'verified'),
      verificationStatus: user.verificationStatus,
      serviceTypes,
      radiusKm: Number(row?.radius_km ?? 15),
      lat: row?.lat != null ? Number(row.lat) : user.latitude,
      lng: row?.lng != null ? Number(row.lng) : user.longitude,
      activeOrderId: row?.active_order_id ? String(row.active_order_id) : null,
      backgroundConsent: Boolean(row?.background_consent),
      acceptanceRate: Number(row?.acceptance_rate ?? 1),
      totalOffers: Number(row?.total_offers ?? 0),
      acceptedOffers: Number(row?.accepted_offers ?? 0),
      rejectedOffers: Number(row?.rejected_offers ?? 0),
      lastActivityAt: row?.last_activity_at ? String(row.last_activity_at) : user.lastActive,
    });
  });

  router.put('/worker/status', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user || user.role !== 'worker') {
      return res.status(403).json({ message: 'Faqat ishchilar onlayn holatini o‘zgartira oladi' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Hisobingiz bloklangan' });
    }

    const wantOnline = req.body?.isOnline !== undefined ? Boolean(req.body.isOnline) : undefined;
    const kycOk = Boolean(user.isVerified && user.verificationStatus === 'verified');
    if (wantOnline === true && !kycOk) {
      return res.status(403).json({
        code: 'KYC_REQUIRED',
        message: 'Onlayn bo‘lish uchun avval shaxsni tasdiqlash (KYC: pasport/ID + jonli selfi) tasdiqlanishi shart',
      });
    }

    const serviceTypes = Array.isArray(req.body?.serviceTypes)
      ? req.body.serviceTypes.map(String).filter((s: string) => (YANDEX_SERVICE_TYPES as readonly string[]).includes(s))
      : undefined;

    const radiusKm =
      req.body?.radiusKm != null ? Math.min(50, Math.max(1, Number(req.body.radiusKm))) : undefined;

    let lat: number | undefined;
    let lng: number | undefined;
    if (req.body?.lat != null && req.body?.lng != null) {
      const parsedLat = Number(req.body.lat);
      const parsedLng = Number(req.body.lng);
      if (!isValidCoord(parsedLat, parsedLng)) {
        return res.status(400).json({ message: 'Koordinatalar noto‘g‘ri' });
      }
      lat = parsedLat;
      lng = parsedLng;
      user.latitude = lat;
      user.longitude = lng;
      user.locationUpdatedAt = nowIso();
      user.locationSharingEnabled = true;
    }

    const backgroundConsent =
      req.body?.backgroundConsent !== undefined ? Boolean(req.body.backgroundConsent) : undefined;

    if (wantOnline !== undefined) {
      user.availability = wantOnline ? 'available' : 'offline';
    }
    user.lastActive = nowIso();
    user.updatedAt = nowIso();
    db.upsertUser(user);

    updateWorkerGeoRow(sqlite, {
      workerId: auth.userId,
      isOnline: wantOnline,
      kycVerified: kycOk,
      serviceTypes,
      radiusKm,
      lat,
      lng,
      backgroundConsent,
    });

    const updated = sqlite
      .prepare('SELECT * FROM ishchi_holati WHERE worker_id = ?')
      .get(auth.userId) as Record<string, unknown>;

    res.json({
      workerId: auth.userId,
      isOnline: Boolean(updated?.is_online),
      kycVerified: Boolean(updated?.kyc_verified),
      serviceTypes: (() => {
        try {
          return JSON.parse(String(updated?.service_types || '[]'));
        } catch {
          return [];
        }
      })(),
      radiusKm: Number(updated?.radius_km ?? 15),
      lat: updated?.lat != null ? Number(updated.lat) : null,
      lng: updated?.lng != null ? Number(updated.lng) : null,
      activeOrderId: updated?.active_order_id ? String(updated.active_order_id) : null,
      backgroundConsent: Boolean(updated?.background_consent),
    });
  });

  // Active incoming offer for worker (exact employer address is stripped until accepted!)
  router.get('/worker/offers/active', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sweepExpiredOffersAndLocations(sqlite);
    const settings = getMatchingSettings(sqlite);

    const row = sqlite
      .prepare(
        `SELECT o.*, b.service_type, b.duration_type, b.payment_method, b.recommended_rate,
                b.district, b.employer_id, b.employer_name, u.rating as employer_rating
         FROM buyurtma_takliflari o
         JOIN ish_buyurtmasi b ON b.id = o.order_id
         LEFT JOIN users u ON u.id = b.employer_id
         WHERE o.worker_id = ?
           AND o.status = 'kutilmoqda'
           AND (? <= 0 OR o.expires_at > ? OR o.expires_at >= '9999-' OR o.search_radius_km = 0)
         ORDER BY o.created_at DESC LIMIT 1`,
      )
      .get(auth.userId, settings.offerTimeoutSec, nowIso()) as Record<string, unknown> | undefined;

    if (!row) return res.json({ offer: null });

    const noExpiry =
      settings.offerTimeoutSec <= 0 ||
      hasNoOfferExpiry(row.expires_at) ||
      Number(row.search_radius_km) === 0;

    res.json({
      offer: {
        id: String(row.id),
        orderId: String(row.order_id),
        serviceType: String(row.service_type),
        durationType: String(row.duration_type),
        paymentMethod: String(row.payment_method || 'cash'),
        recommendedRate: Number(row.recommended_rate || 0),
        distanceKm: Number(row.distance_km || 0),
        etaMin: Number(row.eta_min || 10),
        expiresAt: String(row.expires_at),
        noExpiry,
        district: row.district ? String(row.district) : null,
        employerName: row.employer_name ? String(row.employer_name) : 'Ish beruvchi',
        employerRating: Number(row.employer_rating || 5),
        // PRIVACY: exact lat/lng and address_text are withheld until offer acceptance
      },
    });
  });

  router.post('/worker/offers/:offerId/accept', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const outcome = acceptOfferAtomic(sqlite, req.params.offerId, auth.userId);
    if (!outcome.ok) {
      const status =
        outcome.code === 'OFFER_NOT_FOUND'
          ? 404
          : outcome.code === 'FORBIDDEN' || outcome.code === 'KYC_REQUIRED'
            ? 403
            : outcome.code === 'OFFER_EXPIRED'
              ? 410
              : 409;
      return res.status(status).json({ code: outcome.code, message: outcome.message });
    }

    if (outcome.employerId && outcome.orderId) {
      realtimeHub.emitToUsers([outcome.employerId, outcome.workerId || auth.userId], 'order_updated', {
        orderId: outcome.orderId,
        status: 'qabul_qilindi',
        contractId: outcome.contractId,
      });
      realtimeHub.emitToSuperAdmins('order_updated', {
        orderId: outcome.orderId,
        status: 'qabul_qilindi',
      });
      dispatchPushEvent(db, {
        userId: outcome.employerId,
        title: 'Ishchi topildi!',
        message: 'Ishchi buyurtmangizni qabul qildi. Raqamli shartnomani imzolashga tayyor.',
        eventType: 'accepted',
        orderId: outcome.orderId,
        link: '/',
      });
    }

    res.json({ success: true, ...outcome });
  });

  router.post('/worker/offers/:offerId/reject', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const resReject = rejectOfferForWorker(sqlite, req.params.offerId, auth.userId);
    if (!resReject.ok) {
      return res.status(resReject.code === 'FORBIDDEN' ? 403 : 400).json({ message: resReject.message });
    }

    const next = resReject.nextDispatch;
    if (next) {
      realtimeHub.emitToUser(next.employerId, 'order_updated', {
        orderId: next.orderId,
        status: next.orderStatus,
        radiusKm: next.radiusKm,
        expanded: next.expanded,
      });
      if (next.offer) {
        realtimeHub.emitToUser(next.offer.workerId, 'offer_received', {
          offerId: next.offer.id,
          orderId: next.orderId,
        });
        dispatchPushEvent(db, {
          userId: next.offer.workerId,
          title: 'Yangi ish so‘rovi!',
          message: `Sizga yaqin hududda yangi buyurtma (${next.offer.distanceKm.toFixed(1)} km).`,
          eventType: 'new_offer',
          orderId: next.orderId,
          link: '/',
        });
      }
    }

    res.json({ success: true, penaltyFree: true });
  });

  router.get('/worker/earnings', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare(
        `SELECT id, service_type, duration_type, agreed_rate, recommended_rate, completed_at, employer_name
         FROM ish_buyurtmasi
         WHERE worker_id = ? AND status = 'yakunlandi'
         ORDER BY completed_at DESC`,
      )
      .all(auth.userId) as Array<Record<string, unknown>>;

    const totalEarned = rows.reduce((sum, r) => sum + Number(r.agreed_rate || r.recommended_rate || 0), 0);
    res.json({
      totalEarned,
      completedCount: rows.length,
      items: rows.map((r) => ({
        id: String(r.id),
        serviceType: String(r.service_type),
        durationType: String(r.duration_type),
        amount: Number(r.agreed_rate || r.recommended_rate || 0),
        employerName: r.employer_name ? String(r.employer_name) : null,
        completedAt: r.completed_at ? String(r.completed_at) : null,
      })),
    });
  });

  // --- YANDEX GO STYLE ORDERS ---
  router.post('/orders', orderRateLimit, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const employer = db.getUserById(auth.userId);
    if (!employer) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (employer.role !== 'employer' && employer.role !== 'super_admin') {
      return res.status(403).json({ message: 'Faqat ish beruvchilar buyurtma bera oladi' });
    }
    if (!employer.phoneNumber && !employer.telegramId && !employer.isVerified) {
      return res.status(403).json({
        code: 'EMPLOYER_VERIFICATION_REQUIRED',
        message: 'Buyurtma berish uchun Telegram yoki telefon raqamingiz tasdiqlangan bo‘lishi kerak',
      });
    }

    const serviceType = String(req.body?.serviceType || '');
    const durationType = String(req.body?.durationType || '');
    const paymentMethod = req.body?.paymentMethod === 'card_soon' ? 'card_soon' : 'cash';
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const addressText = req.body?.addressText ? String(req.body.addressText).trim().slice(0, 280) : null;
    const district = req.body?.district ? String(req.body.district).trim().slice(0, 80) : employer.district;
    const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;

    if (!(YANDEX_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
      return res.status(400).json({ message: 'Xizmat turini tanlang' });
    }
    if (!(YANDEX_DURATION_TYPES as readonly string[]).includes(durationType)) {
      return res.status(400).json({ message: 'Ish davomiyligini tanlang' });
    }
    if (!isValidCoord(lat, lng)) {
      return res.status(400).json({ message: 'Xaritadan manzil nuqtasini belgilang' });
    }

    // Prevent spam: only 1 active searching/in-progress order per employer at a time unless previous is closed
    const existingActive = sqlite
      .prepare(
        `SELECT id, status FROM ish_buyurtmasi
         WHERE employer_id = ? AND status IN ('qidirilmoqda','taklif_yuborildi','qabul_qilindi','yolda','yetib_keldi','jarayonda')
         LIMIT 1`,
      )
      .get(auth.userId) as { id: string; status: string } | undefined;
    if (existingActive) {
      return res.status(409).json({
        message: 'Sizda hozir faol buyurtma mavjud. Avval uni yakunlang yoki bekor qiling.',
        activeOrderId: existingActive.id,
      });
    }

    const tariffRow = sqlite
      .prepare('SELECT rate_som FROM tarif_stavkalari WHERE service_type = ? AND duration_type = ?')
      .get(serviceType, durationType) as { rate_som?: number } | undefined;
    const recommendedRate = Number(tariffRow?.rate_som ?? 50000);
    const settings = getMatchingSettings(sqlite);

    const now = nowIso();
    const orderId = `ord_${randomUUID().slice(0, 10)}`;
    const history = [{ status: 'qidirilmoqda', at: now }];

    sqlite
      .prepare(
        `INSERT INTO ish_buyurtmasi (
           id, employer_id, employer_name, service_type, duration_type, payment_method,
           recommended_rate, agreed_rate, lat, lng, address_text, district, note,
           status, current_radius_km, search_step, contract_signed, employer_rated, worker_rated,
           status_history, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'qidirilmoqda', ?, 0, 0, 0, 0, ?, ?, ?)`,
      )
      .run(
        orderId,
        auth.userId,
        employer.companyName || employer.fullName,
        serviceType,
        durationType,
        paymentMethod,
        recommendedRate,
        recommendedRate,
        lat,
        lng,
        addressText,
        district,
        note,
        settings.initialRadiusKm,
        JSON.stringify(history),
        now,
        now,
      );

    // Immediately run first sequential match step
    const dispatch = dispatchNextOfferForOrder(sqlite, orderId);
    if (dispatch?.offer) {
      realtimeHub.emitToUser(dispatch.offer.workerId, 'offer_received', {
        offerId: dispatch.offer.id,
        orderId,
      });
      dispatchPushEvent(db, {
        userId: dispatch.offer.workerId,
        title: 'Yangi ish so‘rovi!',
        message: `Yangi buyurtma (${dispatch.offer.distanceKm.toFixed(1)} km) · ${recommendedRate.toLocaleString('uz-UZ')} so‘m`,
        eventType: 'new_offer',
        orderId,
        link: '/',
      });
    }
    realtimeHub.emitToSuperAdmins('order_updated', {
      orderId,
      status: dispatch?.orderStatus || 'qidirilmoqda',
    });

    const createdRow = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(orderId) as Record<
      string,
      unknown
    >;

    res.status(201).json({
      order: formatOrderRow(createdRow, { includeExactEmployerLocation: true }),
      dispatch,
    });
  });

  router.get('/orders/active', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sweepExpiredOffersAndLocations(sqlite);

    const row = sqlite
      .prepare(
        `SELECT * FROM ish_buyurtmasi
         WHERE (employer_id = ? OR worker_id = ?)
           AND status IN ('qidirilmoqda','taklif_yuborildi','qabul_qilindi','yolda','yetib_keldi','jarayonda')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(auth.userId, auth.userId) as Record<string, unknown> | undefined;

    if (!row) return res.json({ order: null });

    const isEmployer = String(row.employer_id) === auth.userId;
    const isAcceptedWorker = Boolean(row.worker_id && String(row.worker_id) === auth.userId);
    const base = formatOrderRow(row, { includeExactEmployerLocation: isEmployer || isAcceptedWorker });

    const worker = row.worker_id ? db.getUserById(String(row.worker_id)) : null;
    const employer = db.getUserById(String(row.employer_id));
    const contract = row.contract_id ? db.getContract(String(row.contract_id)) : null;
    const liveLoc = sqlite
      .prepare('SELECT lat, lng, updated_at FROM live_order_locations WHERE order_id = ?')
      .get(base.id) as { lat: number; lng: number; updated_at: string } | undefined;

    let distanceKm: number | null = null;
    let etaMin: number | null = null;
    if (liveLoc && isValidCoord(Number(row.lat), Number(row.lng))) {
      distanceKm = Math.round(haversineKm(liveLoc.lat, liveLoc.lng, Number(row.lat), Number(row.lng)) * 10) / 10;
      etaMin = Math.max(2, Math.round((distanceKm / 25) * 60 + 2));
    }

    res.json({
      order: {
        ...base,
        worker: worker
          ? {
              id: worker.id,
              fullName: worker.fullName,
              photoUrl: worker.photoUrl,
              phoneNumber: worker.phoneNumber,
              rating: worker.rating,
              completedJobs: worker.completedJobs,
              isVerified: worker.isVerified,
            }
          : null,
        employer: employer
          ? {
              id: employer.id,
              fullName: employer.companyName || employer.fullName,
              photoUrl: employer.photoUrl,
              phoneNumber: employer.phoneNumber,
              rating: employer.rating,
              isVerified: employer.isVerified,
            }
          : null,
        contract: contract
          ? {
              id: contract.id,
              signedByWorker: contract.signedByWorker,
              signedByEmployer: contract.signedByEmployer,
              status: contract.status,
              terms: contract.terms,
            }
          : null,
        workerLocation: liveLoc ? { lat: liveLoc.lat, lng: liveLoc.lng, updatedAt: liveLoc.updated_at } : null,
        distanceKm,
        etaMin,
      },
    });
  });

  router.get('/orders', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare(
        `SELECT * FROM ish_buyurtmasi
         WHERE employer_id = ? OR worker_id = ?
         ORDER BY created_at DESC LIMIT 100`,
      )
      .all(auth.userId, auth.userId) as Array<Record<string, unknown>>;

    res.json({
      orders: rows.map((r) => formatOrderRow(r, { includeExactEmployerLocation: true })),
    });
  });

  // Strict IDOR-protected single order fetch
  router.get('/orders/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ message: 'Buyurtma topilmadi' });

    const isEmployer = String(row.employer_id) === auth.userId;
    const isWorker = Boolean(row.worker_id && String(row.worker_id) === auth.userId);
    const isAdmin = auth.role === 'super_admin';

    // Check if worker has an active unaccepted offer for this order (then allow minimal preview WITHOUT exact coordinates)
    const hasPendingOffer =
      !isEmployer &&
      !isWorker &&
      !isAdmin &&
      Boolean(
        sqlite
          .prepare(`SELECT id FROM buyurtma_takliflari WHERE order_id = ? AND worker_id = ? AND status = 'kutilmoqda'`)
          .get(req.params.id, auth.userId),
      );

    if (!isEmployer && !isWorker && !isAdmin && !hasPendingOffer) {
      return res.status(403).json({ message: 'Bu buyurtmaga kirishga ruxsat yo‘q' });
    }

    const contract = row.contract_id ? db.getContract(String(row.contract_id)) : null;
    const worker = row.worker_id ? db.getUserById(String(row.worker_id)) : null;
    const employer = db.getUserById(String(row.employer_id));
    const liveLoc = sqlite
      .prepare('SELECT lat, lng, updated_at FROM live_order_locations WHERE order_id = ?')
      .get(req.params.id) as { lat: number; lng: number; updated_at: string } | undefined;

    res.json({
      order: {
        ...formatOrderRow(row, { includeExactEmployerLocation: isEmployer || isWorker || isAdmin }),
        contract,
        worker: worker
          ? {
              id: worker.id,
              fullName: worker.fullName,
              photoUrl: worker.photoUrl,
              phoneNumber: isEmployer || isAdmin ? worker.phoneNumber : null,
              rating: worker.rating,
              isVerified: worker.isVerified,
            }
          : null,
        employer: employer
          ? {
              id: employer.id,
              fullName: employer.companyName || employer.fullName,
              photoUrl: employer.photoUrl,
              phoneNumber: isWorker || isAdmin ? employer.phoneNumber : null,
              rating: employer.rating,
              isVerified: employer.isVerified,
            }
          : null,
        workerLocation: isEmployer || isWorker || isAdmin ? liveLoc || null : null,
      },
    });
  });

  // --- ORDER STATE MACHINE TRANSITIONS ---
  router.post('/orders/:id/transition', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ message: 'Buyurtma topilmadi' });

    const isEmployer = String(row.employer_id) === auth.userId;
    const isWorker = Boolean(row.worker_id && String(row.worker_id) === auth.userId);
    const isAdmin = auth.role === 'super_admin';
    if (!isEmployer && !isWorker && !isAdmin) {
      return res.status(403).json({ message: 'Bu buyurtmani o‘zgartirishga ruxsat yo‘q' });
    }

    const nextStatusRaw = String(req.body?.status || '').trim();
    if (!isOrderState(nextStatusRaw)) {
      return res.status(400).json({ message: 'Noto‘g‘ri buyurtma holati' });
    }
    const currentStatus = String(row.status) as OrderLifecycleStatus;

    // Check digital contract status if transitioning to jarayonda
    const contract = row.contract_id ? db.getContract(String(row.contract_id)) : null;
    const contractSigned = Boolean(
      row.contract_signed || (contract && contract.signedByWorker && contract.signedByEmployer),
    );

    const check = canTransitionOrder(currentStatus, nextStatusRaw, { contractSigned });
    if ('reason' in check) {
      return res.status(400).json({ code: check.code, message: check.reason });
    }

    // Role checks per transition
    if ((nextStatusRaw === 'yolda' || nextStatusRaw === 'yetib_keldi') && !isWorker && !isAdmin) {
      return res.status(403).json({ message: 'Bu holatga faqat ishchi o‘tkaza oladi' });
    }

    const now = nowIso();
    let history: Array<{ status: string; at: string; byRole?: string; reason?: string }> = [];
    try {
      history = JSON.parse(String(row.status_history || '[]'));
    } catch {
      history = [];
    }

    const cancelReason = req.body?.reason ? String(req.body.reason).trim().slice(0, 300) : null;
    history.push({
      status: nextStatusRaw,
      at: now,
      byRole: auth.role,
      ...(cancelReason ? { reason: cancelReason } : {}),
    });

    if (nextStatusRaw === 'bekor_qilindi') {
      sqlite
        .prepare(
          `UPDATE ish_buyurtmasi
           SET status = 'bekor_qilindi', cancel_reason = ?, cancelled_by_role = ?, cancelled_by_id = ?,
               status_history = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(cancelReason || 'Sabab ko‘rsatilmadi', auth.role, auth.userId, JSON.stringify(history), now, req.params.id);

      sqlite
        .prepare(
          `UPDATE buyurtma_takliflari SET status = 'bekor_qilindi', responded_at = ? WHERE order_id = ? AND status = 'kutilmoqda'`,
        )
        .run(now, req.params.id);

      // Immediately release worker and wipe live location
      if (row.worker_id) {
        sqlite
          .prepare(`UPDATE ishchi_holati SET active_order_id = NULL, updated_at = ? WHERE worker_id = ? AND active_order_id = ?`)
          .run(now, String(row.worker_id), req.params.id);
      }
      sqlite.prepare('DELETE FROM live_order_locations WHERE order_id = ?').run(req.params.id);
    } else if (nextStatusRaw === 'yakunlandi') {
      sqlite
        .prepare(
          `UPDATE ish_buyurtmasi
           SET status = 'yakunlandi', completed_at = ?, contract_signed = ?, status_history = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(now, contractSigned ? 1 : 0, JSON.stringify(history), now, req.params.id);

      if (contract) {
        contract.status = 'completed';
        contract.updatedAt = now;
        db.upsertContract(contract);
      }
      if (row.worker_id) {
        const w = db.getUserById(String(row.worker_id));
        if (w) {
          w.completedJobs += 1;
          w.updatedAt = now;
          db.upsertUser(w);
        }
        sqlite
          .prepare(`UPDATE ishchi_holati SET active_order_id = NULL, updated_at = ? WHERE worker_id = ?`)
          .run(now, String(row.worker_id));
      }
      // Wipe live coordinates immediately upon job completion
      sqlite.prepare('DELETE FROM live_order_locations WHERE order_id = ?').run(req.params.id);
    } else {
      const colPatch =
        nextStatusRaw === 'yetib_keldi'
          ? ', arrived_at = COALESCE(arrived_at, ?)'
          : nextStatusRaw === 'jarayonda'
            ? ', started_at = COALESCE(started_at, ?), contract_signed = 1'
            : '';

      if (colPatch) {
        sqlite
          .prepare(
            `UPDATE ish_buyurtmasi SET status = ?${colPatch}, status_history = ?, updated_at = ? WHERE id = ?`,
          )
          .run(nextStatusRaw, now, JSON.stringify(history), now, req.params.id);
      } else {
        sqlite
          .prepare(`UPDATE ish_buyurtmasi SET status = ?, status_history = ?, updated_at = ? WHERE id = ?`)
          .run(nextStatusRaw, JSON.stringify(history), now, req.params.id);
      }
    }

    const targets = [String(row.employer_id)];
    if (row.worker_id) targets.push(String(row.worker_id));
    realtimeHub.emitToUsers(targets, 'order_updated', {
      orderId: req.params.id,
      status: nextStatusRaw,
      byRole: auth.role,
    });
    realtimeHub.emitToSuperAdmins('order_updated', {
      orderId: req.params.id,
      status: nextStatusRaw,
    });

    const otherId = isEmployer ? (row.worker_id ? String(row.worker_id) : null) : String(row.employer_id);
    if (otherId) {
      if (nextStatusRaw === 'yetib_keldi') {
        dispatchPushEvent(db, {
          userId: otherId,
          title: 'Ishchi yetib keldi',
          message: 'Ishchi manzilga yetib keldi. Ishni boshlashdan oldin raqamli shartnomani imzolang.',
          eventType: 'arrived',
          orderId: req.params.id,
          link: '/',
        });
      } else if (nextStatusRaw === 'yakunlandi') {
        dispatchPushEvent(db, {
          userId: otherId,
          title: 'Ish yakunlandi',
          message: 'Ish muvaffaqiyatli yakunlandi. Iltimos, baho bering.',
          eventType: 'completed',
          orderId: req.params.id,
          link: '/',
        });
      }
    }

    const updated = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;
    res.json({ order: formatOrderRow(updated, { includeExactEmployerLocation: true }) });
  });

  // --- LIVE WORKER LOCATION DURING ACTIVE ORDER (Deletes cleanly on end, never logged raw) ---
  router.put('/orders/:id/location', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ message: 'Buyurtma topilmadi' });
    if (String(row.worker_id || '') !== auth.userId) {
      return res.status(403).json({ message: 'Faqat tayinlangan ishchi jonli joylashuvni yubora oladi' });
    }
    const status = String(row.status);
    if (!['qabul_qilindi', 'yolda', 'yetib_keldi', 'jarayonda'].includes(status)) {
      return res.status(400).json({ message: 'Jonli joylashuv faqat faol ish davomida ishlaydi' });
    }

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const heading = req.body?.heading != null ? Number(req.body.heading) : null;
    if (!isValidCoord(lat, lng)) {
      return res.status(400).json({ message: 'Koordinatalar noto‘g‘ri' });
    }

    const now = nowIso();
    const settings = getMatchingSettings(sqlite);
    const expiresAt = new Date(Date.now() + settings.liveLocationTtlSec * 1000).toISOString();

    sqlite
      .prepare(
        `INSERT OR REPLACE INTO live_order_locations (order_id, worker_id, lat, lng, heading, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(req.params.id, auth.userId, lat, lng, heading, now, expiresAt);

    updateWorkerGeoRow(sqlite, { workerId: auth.userId, lat, lng });

    realtimeHub.emitToUser(String(row.employer_id), 'worker_location', {
      orderId: req.params.id,
      lat,
      lng,
      heading,
      updatedAt: now,
    });

    res.json({ success: true, updatedAt: now, ttlSec: settings.liveLocationTtlSec });
  });

  // --- MUTUAL RATING ON ORDER COMPLETION ---
  router.post('/orders/:id/rate', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ message: 'Buyurtma topilmadi' });
    const isEmployer = String(row.employer_id) === auth.userId;
    const isWorker = Boolean(row.worker_id && String(row.worker_id) === auth.userId);
    if (!isEmployer && !isWorker) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    if (String(row.status) !== 'yakunlandi') {
      return res.status(400).json({ message: 'Faqat yakunlangan ishni baholash mumkin' });
    }
    if ((isEmployer && row.employer_rated) || (isWorker && row.worker_rated)) {
      return res.status(409).json({ message: 'Siz bu ish uchun allaqachon baho bergansiz' });
    }

    const revieweeId = isEmployer ? String(row.worker_id || '') : String(row.employer_id);
    const target = db.getUserById(revieweeId);
    if (!target) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating || 5))));
    const comment = req.body?.comment ? String(req.body.comment).trim().slice(0, 1000) : null;
    const revId = `rev_${randomUUID().slice(0, 8)}`;
    const now = nowIso();

    db.insertReview({
      id: revId,
      reviewerId: auth.userId,
      revieweeId,
      reviewerName: db.getUserById(auth.userId)?.fullName || null,
      rating,
      comment,
      contractId: row.contract_id ? String(row.contract_id) : null,
      applicationId: req.params.id,
      createdAt: now,
    });

    const nextCount = target.reviewCount + 1;
    target.rating = Math.round(((target.rating * target.reviewCount + rating) / nextCount) * 10) / 10;
    target.reviewCount = nextCount;
    target.updatedAt = now;
    db.upsertUser(target);

    if (isEmployer) {
      sqlite.prepare('UPDATE ish_buyurtmasi SET employer_rated = 1, updated_at = ? WHERE id = ?').run(now, req.params.id);
    } else {
      sqlite.prepare('UPDATE ish_buyurtmasi SET worker_rated = 1, updated_at = ? WHERE id = ?').run(now, req.params.id);
    }

    res.status(201).json({ success: true, rating, reviewId: revId });
  });

  // --- SAFETY SHARE ("Ulashish") ---
  router.post('/orders/:id/share', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ message: 'Buyurtma topilmadi' });
    if (String(row.employer_id) !== auth.userId && String(row.worker_id || '') !== auth.userId) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const contacts = sqlite
      .prepare('SELECT id, name, phone, telegram_username FROM ishonchli_shaxslar WHERE user_id = ?')
      .all(auth.userId) as Array<{ id: string; name: string; phone: string; telegram_username: string | null }>;

    const shareSummary = `Mehrli Qo‘llar Xavfsiz Ulashish: Buyurtma #${String(row.id)} (${String(row.service_type)}), Holat: ${String(row.status)}, Hamkor: ${auth.userId === String(row.employer_id) ? row.worker_name || 'Ishchi' : row.employer_name || 'Ish beruvchi'}.`;

    res.json({
      success: true,
      orderId: String(row.id),
      shareText: shareSummary,
      trustedContacts: contacts,
    });
  });

  // --- TRUSTED CONTACTS (ishonchli_shaxslar) ---
  router.get('/trusted-contacts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare('SELECT * FROM ishonchli_shaxslar WHERE user_id = ? ORDER BY created_at DESC')
      .all(auth.userId) as Array<Record<string, unknown>>;
    res.json({
      contacts: rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        phone: String(r.phone),
        telegramUsername: r.telegram_username ? String(r.telegram_username) : null,
        createdAt: String(r.created_at),
      })),
    });
  });

  router.post('/trusted-contacts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const phone = normalizePhone(String(req.body?.phone || ''));
    const tg = req.body?.telegramUsername ? String(req.body.telegramUsername).trim().slice(0, 60) : null;
    if (name.length < 2 || !UZ_PHONE_REGEX.test(phone)) {
      return res.status(400).json({ message: 'Ism va +998XXXXXXXXX telefon raqamini kiriting' });
    }
    const id = `tc_${randomUUID().slice(0, 8)}`;
    const now = nowIso();
    sqlite
      .prepare(
        `INSERT INTO ishonchli_shaxslar (id, user_id, name, phone, telegram_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, auth.userId, name, phone, tg, now);
    res.status(201).json({ id, name, phone, telegramUsername: tg, createdAt: now });
  });

  router.delete('/trusted-contacts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sqlite
      .prepare('DELETE FROM ishonchli_shaxslar WHERE id = ? AND user_id = ?')
      .run(req.params.id, auth.userId);
    res.json({ success: true });
  });

  // --- SOS EMERGENCY TRIGGER ---
  router.post('/sos', sosRateLimit, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    const orderId = req.body?.orderId ? String(req.body.orderId) : null;
    const lat = req.body?.lat != null && Number.isFinite(Number(req.body.lat)) ? Number(req.body.lat) : null;
    const lng = req.body?.lng != null && Number.isFinite(Number(req.body.lng)) ? Number(req.body.lng) : null;
    const message = req.body?.message ? String(req.body.message).trim().slice(0, 500) : 'Favqulodda SOS signali';

    const contacts = sqlite
      .prepare('SELECT name, phone FROM ishonchli_shaxslar WHERE user_id = ?')
      .all(auth.userId) as Array<{ name: string; phone: string }>;

    const trustedSummary =
      contacts.length > 0
        ? `Yuborildi: ${contacts.map((c) => `${c.name} (${c.phone})`).join(', ')}`
        : 'Ishonchli shaxs kiritilmagan (faqat administrator ogohlantirildi)';

    const id = `sos_${randomUUID().slice(0, 8)}`;
    const now = nowIso();
    sqlite
      .prepare(
        `INSERT INTO sos_hodisalari (
           id, user_id, user_name, user_role, order_id, lat, lng, message,
           status, trusted_notified, trusted_contact_summary, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yangi', ?, ?, ?, ?)`,
      )
      .run(
        id,
        auth.userId,
        user.fullName,
        user.role,
        orderId,
        lat,
        lng,
        message,
        contacts.length > 0 ? 1 : 0,
        trustedSummary,
        now,
        now,
      );

    // Notify all super admins immediately over SSE + notification queue
    realtimeHub.emitToSuperAdmins('sos_alert', {
      id,
      userId: auth.userId,
      userName: user.fullName,
      userRole: user.role,
      orderId,
      status: 'yangi',
      createdAt: now,
    });
    for (const admin of db.listUsers().filter((u) => u.role === 'super_admin')) {
      dispatchPushEvent(db, {
        userId: admin.id,
        title: 'FAVQULODDA SOS SIGNALI!',
        message: `${user.fullName} SOS tugmasini bosdi (${trustedSummary}).`,
        eventType: 'sos_alert',
        orderId,
        link: '/super-admin/sos',
      });
    }

    res.status(201).json({
      id,
      status: 'yangi',
      trustedNotified: contacts.length > 0,
      trustedSummary,
      createdAt: now,
    });
  });

  // --- ORGANIZATION ANNUAL SUBSCRIPTION (B2B tariff structure; individuals & women are always free) ---
  router.get('/organization/subscription', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = sqlite
      .prepare('SELECT * FROM tashkilot_obunalari WHERE employer_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(auth.userId) as Record<string, unknown> | undefined;
    res.json({
      subscription: row
        ? {
            id: String(row.id),
            employerId: String(row.employer_id),
            companyName: String(row.company_name),
            planName: String(row.plan_name),
            annualPriceSom: Number(row.annual_price_som),
            status: String(row.status),
            startsAt: String(row.starts_at),
            expiresAt: String(row.expires_at),
          }
        : null,
      individualPolicy: 'Ayollar va oilalar uchun platforma doim bepul',
    });
  });

  router.post('/organization/subscription', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user || user.role !== 'employer') {
      return res.status(403).json({ message: 'Faqat tashkilot ish beruvchilari uchun' });
    }
    const companyName = String(req.body?.companyName || user.companyName || user.fullName).trim().slice(0, 120);
    const planName = String(req.body?.planName || 'Yillik Tashkilot Rejasi').trim().slice(0, 100);
    const now = new Date();
    const expires = new Date(now.getTime() + 365 * 86400_000);
    const id = `orgsub_${randomUUID().slice(0, 8)}`;

    sqlite
      .prepare(
        `INSERT INTO tashkilot_obunalari (
           id, employer_id, company_name, plan_name, annual_price_som, status, starts_at, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 15000000, 'pending', ?, ?, ?, ?)`,
      )
      .run(id, auth.userId, companyName, planName, now.toISOString(), expires.toISOString(), now.toISOString(), now.toISOString());

    res.status(201).json({
      id,
      companyName,
      planName,
      annualPriceSom: 15000000,
      status: 'pending',
      startsAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });
  });

  // =====================================================================
  // SUPER ADMIN WEB-ONLY ENDPOINTS (Strict RBAC + Audit Trail Logging)
  // =====================================================================
  function requireSuperAdmin(req: Request, res: Response): AuthPrincipal | null {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (auth.role !== 'super_admin') {
      res.status(403).json({ message: 'Faqat boshqaruv paneli uchun ruxsat etilgan' });
      return null;
    }
    return auth;
  }

  function logAdmin(
    adminId: string,
    action: string,
    opts?: { targetType?: string; targetId?: string; details?: unknown; viewedExactCoords?: boolean },
  ) {
    const admin = db.getUserById(adminId);
    db.recordAdminAudit({
      id: `aud_${randomUUID().slice(0, 10)}`,
      adminId,
      adminName:
        admin?.fullName && !/^super[\s_-]?admin$/i.test(admin.fullName) ? admin.fullName : 'Admin',
      action,
      targetType: opts?.targetType || null,
      targetId: opts?.targetId || null,
      details: opts?.details ? redactCoordinatesFromLogPayload(opts.details) : null,
      viewedExactCoords: Boolean(opts?.viewedExactCoords),
    });
  }

  // 1. Dashboard KPIs (Real SQL counts)
  router.get('/admin/dashboard/kpi', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    sweepExpiredOffersAndLocations(sqlite);

    const todayPrefix = nowIso().slice(0, 10);
    const onlineWorkers = Number(
      (sqlite.prepare('SELECT COUNT(*) as c FROM ishchi_holati WHERE is_online = 1').get() as { c: number })?.c ?? 0,
    );
    const activeOrders = Number(
      (
        sqlite
          .prepare(
            `SELECT COUNT(*) as c FROM ish_buyurtmasi WHERE status IN ('qidirilmoqda','taklif_yuborildi','qabul_qilindi','yolda','yetib_keldi','jarayonda')`,
          )
          .get() as { c: number }
      )?.c ?? 0,
    );
    const todayOrders = Number(
      (sqlite.prepare('SELECT COUNT(*) as c FROM ish_buyurtmasi WHERE created_at LIKE ?').get(`${todayPrefix}%`) as { c: number })?.c ?? 0,
    );
    const totalOrders = Number(
      (sqlite.prepare('SELECT COUNT(*) as c FROM ish_buyurtmasi').get() as { c: number })?.c ?? 0,
    );
    const cancelledOrders = Number(
      (sqlite.prepare(`SELECT COUNT(*) as c FROM ish_buyurtmasi WHERE status = 'bekor_qilindi'`).get() as { c: number })?.c ?? 0,
    );
    const openSos = Number(
      (sqlite.prepare(`SELECT COUNT(*) as c FROM sos_hodisalari WHERE status != 'yopildi'`).get() as { c: number })?.c ?? 0,
    );
    const pendingKyc = db
      .listVerifications()
      .filter((v) => v.status === 'pending' || v.status === 'under_review').length;

    const avgRow = sqlite
      .prepare(
        `SELECT AVG((julianday(accepted_at) - julianday(created_at)) * 86400.0) as avg_sec
         FROM ish_buyurtmasi WHERE accepted_at IS NOT NULL`,
      )
      .get() as { avg_sec?: number | null } | undefined;

    res.json({
      onlineWorkers,
      activeOrders,
      todayOrders,
      totalOrders,
      cancelRatePercent: totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 1000) / 10 : 0,
      avgMatchSeconds: avgRow?.avg_sec != null ? Math.max(1, Math.round(avgRow.avg_sec)) : 0,
      openSos,
      pendingKyc,
    });
  });

  // Live map data (new models + existing users fallback) — logs coordinate viewing to audit journal
  router.get('/admin/live-map', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;

    const onlineWorkers = sqlite
      .prepare(
        `SELECT ih.*, u.full_name, u.rating, u.completed_jobs, u.phone_number, u.district
         FROM ishchi_holati ih JOIN users u ON u.id = ih.worker_id
         WHERE ih.lat IS NOT NULL AND ih.lng IS NOT NULL`,
      )
      .all() as Array<Record<string, unknown>>;

    const activeOrders = sqlite
      .prepare(
        `SELECT * FROM ish_buyurtmasi
         WHERE status IN ('qidirilmoqda','taklif_yuborildi','qabul_qilindi','yolda','yetib_keldi','jarayonda')`,
      )
      .all() as Array<Record<string, unknown>>;

    const openSos = sqlite
      .prepare(`SELECT * FROM sos_hodisalari WHERE status != 'yopildi' AND lat IS NOT NULL`)
      .all() as Array<Record<string, unknown>>;

    logAdmin(auth.userId, 'VIEW_ADMIN_LIVE_MAP', { targetType: 'live_map', viewedExactCoords: true });

    res.json({
      workers: onlineWorkers.map((w) => ({
        uid: String(w.worker_id),
        fullName: String(w.full_name),
        isOnline: Boolean(w.is_online),
        kycVerified: Boolean(w.kyc_verified),
        rating: Number(w.rating || 0),
        completedJobs: Number(w.completed_jobs || 0),
        phoneNumber: w.phone_number ? String(w.phone_number) : null,
        district: w.district ? String(w.district) : null,
        activeOrderId: w.active_order_id ? String(w.active_order_id) : null,
        lat: Number(w.lat),
        lng: Number(w.lng),
      })),
      orders: activeOrders.map((o) => formatOrderRow(o, { includeExactEmployerLocation: true })),
      sos: openSos.map((s) => ({
        id: String(s.id),
        userId: String(s.user_id),
        userName: s.user_name ? String(s.user_name) : null,
        status: String(s.status),
        lat: Number(s.lat),
        lng: Number(s.lng),
        message: s.message ? String(s.message) : null,
        createdAt: String(s.created_at),
      })),
    });
  });

  // 2. Orders list & deep detail with timeline + offer queue + contract + ratings
  router.get('/admin/orders', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const statusFilter = req.query.status ? String(req.query.status) : '';
    const serviceFilter = req.query.serviceType ? String(req.query.serviceType) : '';
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : '';
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : '';

    const pendingOffers = new Map<string, { workerId: string; workerName: string | null }>();
    for (const p of sqlite
      .prepare(
        `SELECT o.order_id, o.worker_id, u.full_name as worker_name
         FROM buyurtma_takliflari o
         LEFT JOIN users u ON u.id = o.worker_id
         WHERE o.status = 'kutilmoqda'
         ORDER BY o.created_at DESC`,
      )
      .all() as Array<{ order_id: string; worker_id: string; worker_name: string | null }>) {
      if (!pendingOffers.has(p.order_id)) {
        pendingOffers.set(p.order_id, {
          workerId: String(p.worker_id),
          workerName: p.worker_name ? String(p.worker_name) : null,
        });
      }
    }

    const rows = (sqlite.prepare('SELECT * FROM ish_buyurtmasi ORDER BY created_at DESC LIMIT 300').all() as Array<Record<string, unknown>>)
      .filter((r) => {
        if (statusFilter && String(r.status) !== statusFilter) return false;
        if (serviceFilter && String(r.service_type) !== serviceFilter) return false;
        if (dateFrom && String(r.created_at) < dateFrom) return false;
        if (dateTo && String(r.created_at) > `${dateTo}T23:59:59Z`) return false;
        return true;
      });

    res.json({
      orders: rows.map((r) => {
        const pending = pendingOffers.get(String(r.id));
        return {
          ...formatOrderRow(r, { includeExactEmployerLocation: false }),
          pendingOfferWorkerId: pending?.workerId ?? null,
          pendingOfferWorkerName: pending?.workerName ?? null,
        };
      }),
    });
  });

  router.get('/admin/orders/:id/detail', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const order = sqlite.prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!order) return res.status(404).json({ message: 'Buyurtma topilmadi' });

    const includeCoords = req.query.includeCoords === '1';
    if (includeCoords) {
      logAdmin(auth.userId, 'VIEW_ORDER_EXACT_COORDS', {
        targetType: 'order',
        targetId: req.params.id,
        viewedExactCoords: true,
      });
    }

    const offers = sqlite
      .prepare(
        `SELECT o.*, u.full_name as worker_name, u.rating as worker_rating
         FROM buyurtma_takliflari o
         LEFT JOIN users u ON u.id = o.worker_id
         WHERE o.order_id = ?
         ORDER BY o.created_at ASC`,
      )
      .all(req.params.id) as Array<Record<string, unknown>>;

    const contract = order.contract_id ? db.getContract(String(order.contract_id)) : null;
    const reviews = [
      ...(order.worker_id ? db.listReviewsFor(String(order.worker_id)) : []),
      ...db.listReviewsFor(String(order.employer_id)),
    ].filter((r) => r.applicationId === req.params.id);

    res.json({
      order: formatOrderRow(order, { includeExactEmployerLocation: includeCoords }),
      offers: offers.map((o) => ({
        id: String(o.id),
        workerId: String(o.worker_id),
        workerName: o.worker_name ? String(o.worker_name) : null,
        workerRating: Number(o.worker_rating || 0),
        status: String(o.status),
        score: Number(o.score || 0),
        distanceKm: Number(o.distance_km || 0),
        etaMin: Number(o.eta_min || 0),
        searchRadiusKm: Number(o.search_radius_km || 0),
        expiresAt: String(o.expires_at),
        respondedAt: o.responded_at ? String(o.responded_at) : null,
        createdAt: String(o.created_at),
      })),
      contract,
      reviews,
    });
  });

  // Control Panel: Assign or route an order directly to a chosen worker (e.g. Karimova Dilnoza)
  router.post('/admin/orders/:id/assign', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;

    const workerId = String(req.body?.workerId || '').trim();
    const mode: 'direct' | 'offer' = req.body?.mode === 'offer' ? 'offer' : 'direct';
    if (!workerId) {
      return res.status(400).json({ message: 'Ishchini tanlang' });
    }

    const result = assignOrderToWorkerByAdmin(sqlite, {
      orderId: req.params.id,
      workerId,
      mode,
    });

    if (!result.ok) {
      const status =
        result.code === 'ORDER_NOT_FOUND' || result.code === 'WORKER_NOT_FOUND'
          ? 404
          : result.code === 'WORKER_BUSY' || result.code === 'ORDER_NOT_ASSIGNABLE'
            ? 409
            : 400;
      return res.status(status).json({ code: result.code, message: result.message });
    }

    logAdmin(auth.userId, mode === 'offer' ? 'ADMIN_DISPATCH_OFFER' : 'ADMIN_ASSIGN_ORDER', {
      targetType: 'order',
      targetId: req.params.id,
      details: {
        workerId: result.workerId,
        workerName: result.workerName,
        mode,
        orderStatus: result.orderStatus,
      },
    });

    if (result.workerId && result.employerId) {
      if (mode === 'offer') {
        realtimeHub.emitToUser(result.workerId, 'offer_received', {
          offerId: result.offerId,
          orderId: result.orderId,
          assignedByAdmin: true,
        });
        dispatchPushEvent(db, {
          userId: result.workerId,
          title: 'Sizga yangi buyurtma yo‘naltirildi',
          message: 'Boshqaruv paneli sizga yangi ish taklifini yubordi.',
          eventType: 'new_offer',
          orderId: result.orderId,
          link: '/',
        });
      } else {
        realtimeHub.emitToUsers([result.employerId, result.workerId], 'order_updated', {
          orderId: result.orderId,
          status: 'qabul_qilindi',
          contractId: result.contractId,
        });
        dispatchPushEvent(db, {
          userId: result.workerId,
          title: 'Sizga buyurtma biriktirildi',
          message: 'Boshqaruv paneli sizni yangi buyurtmaga biriktirdi.',
          eventType: 'accepted',
          orderId: result.orderId,
          link: '/',
        });
        dispatchPushEvent(db, {
          userId: result.employerId,
          title: 'Ishchi biriktirildi',
          message: `${result.workerName || 'Ishchi'} buyurtmangizga biriktirildi.`,
          eventType: 'accepted',
          orderId: result.orderId,
          link: '/',
        });
      }
      realtimeHub.emitToSuperAdmins('order_updated', {
        orderId: result.orderId,
        status: result.orderStatus,
      });
    }

    const updatedOrderRow = sqlite
      .prepare('SELECT * FROM ish_buyurtmasi WHERE id = ?')
      .get(req.params.id) as Record<string, unknown>;

    res.json({
      success: true,
      assignment: result,
      order: {
        ...formatOrderRow(updatedOrderRow, { includeExactEmployerLocation: false }),
        pendingOfferWorkerId: mode === 'offer' ? result.workerId || null : null,
        pendingOfferWorkerName: mode === 'offer' ? result.workerName || null : null,
      },
    });
  });

  // 3. Workers & 4. Employers management + Edit + Block/Unblock
  router.get('/admin/workers', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const states = new Map<string, Record<string, unknown>>();
    for (const s of sqlite.prepare('SELECT * FROM ishchi_holati').all() as Array<Record<string, unknown>>) {
      states.set(String(s.worker_id), s);
    }
    const workers = db
      .listUsers()
      .filter((u) => u.role === 'worker')
      .map((u) => {
        const st = states.get(u.id);
        return {
          uid: u.id,
          fullName: u.fullName,
          email: u.email,
          phoneNumber: u.phoneNumber,
          region: u.region,
          district: u.district,
          profession: u.profession,
          skills: u.skills,
          bio: u.bio,
          isVerified: u.isVerified,
          verificationStatus: u.verificationStatus,
          isBlocked: u.isBlocked,
          blockReason: u.blockReason,
          rating: u.rating,
          reviewCount: u.reviewCount,
          completedJobs: u.completedJobs,
          isOnline: Boolean(st?.is_online),
          acceptanceRate: Number(st?.acceptance_rate ?? 1),
          totalOffers: Number(st?.total_offers ?? 0),
          acceptedOffers: Number(st?.accepted_offers ?? 0),
          rejectedOffers: Number(st?.rejected_offers ?? 0),
          activeOrderId: st?.active_order_id ? String(st.active_order_id) : null,
          createdAt: u.createdAt,
        };
      });
    res.json({ workers });
  });

  router.get('/admin/employers', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const orderCounts = new Map<string, number>();
    for (const r of sqlite
      .prepare('SELECT employer_id, COUNT(*) as cnt FROM ish_buyurtmasi GROUP BY employer_id')
      .all() as Array<{ employer_id: string; cnt: number }>) {
      orderCounts.set(r.employer_id, Number(r.cnt));
    }
    const employers = db
      .listUsers()
      .filter((u) => u.role === 'employer')
      .map((u) => ({
        uid: u.id,
        fullName: u.fullName,
        companyName: u.companyName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        region: u.region,
        district: u.district,
        bio: u.bio,
        telegram: u.telegram,
        telegramVerified: Boolean(u.telegramId),
        isVerified: u.isVerified,
        verificationStatus: u.verificationStatus,
        isBlocked: u.isBlocked,
        blockReason: u.blockReason,
        rating: u.rating,
        reviewCount: u.reviewCount,
        ordersCount: orderCounts.get(u.id) || 0,
        createdAt: u.createdAt,
      }));
    res.json({ employers });
  });

  // Full User Edit for Control Panel
  router.patch('/admin/users/:id', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    const body = (req.body || {}) as Record<string, unknown>;
    const prevRole = user.role;
    const prevBlocked = user.isBlocked;

    if (typeof body.fullName === 'string') {
      const cleanName = body.fullName.trim().slice(0, 120);
      if (cleanName.length < 2) {
        return res.status(400).json({ message: 'Ism kamida 2 ta belgidan iborat bo‘lishi kerak' });
      }
      const parts = splitName(cleanName);
      user.fullName = parts.fullName;
      user.firstName = parts.firstName || user.firstName;
      user.lastName = parts.lastName || user.lastName;
    }

    if (body.phoneNumber !== undefined) {
      const rawPhone = String(body.phoneNumber || '').trim();
      if (!rawPhone) {
        user.phoneNumber = null;
      } else {
        const normalized = normalizePhone(rawPhone);
        if (!UZ_PHONE_REGEX.test(normalized)) {
          return res.status(400).json({ message: 'Telefon raqami +998XXXXXXXXX formatida bo‘lishi kerak' });
        }
        const owner = db.getUserByPhone(normalized);
        if (owner && owner.id !== user.id) {
          return res.status(409).json({ message: 'Bu telefon raqami boshqa foydalanuvchiga biriktirilgan' });
        }
        user.phoneNumber = normalized;
      }
    }

    if (body.email !== undefined) {
      const rawEmail = String(body.email || '').trim();
      if (!rawEmail) {
        user.email = null;
      } else {
        const normalized = normalizeEmail(rawEmail);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
          return res.status(400).json({ message: 'Email manzili noto‘g‘ri' });
        }
        const owner = db.getUserByEmail(normalized);
        if (owner && owner.id !== user.id) {
          return res.status(409).json({ message: 'Bu email manzili boshqa foydalanuvchiga biriktirilgan' });
        }
        user.email = normalized;
      }
    }

    if (typeof body.role === 'string') {
      const nextRole = body.role as UserRole;
      if (!['worker', 'employer', 'admin', 'super_admin'].includes(nextRole)) {
        return res.status(400).json({ message: 'Noto‘g‘ri rol' });
      }
      if (user.id === auth.userId && nextRole !== 'super_admin') {
        return res.status(400).json({ message: 'O‘z rolingizni pasaytira olmaysiz' });
      }
      if (user.role === 'super_admin' && nextRole !== 'super_admin') {
        const superAdmins = db.listUsers().filter((u) => u.role === 'super_admin');
        if (superAdmins.length <= 1) {
          return res.status(400).json({ message: 'Oxirgi boshqaruv paneli hisobini pasaytirib bo‘lmaydi' });
        }
      }
      user.role = nextRole;
    }

    if (typeof body.region === 'string') {
      user.region = body.region.trim().slice(0, 80) || user.region;
    }
    if (body.district !== undefined) {
      user.district = body.district ? String(body.district).trim().slice(0, 80) : null;
    }
    if (body.neighborhood !== undefined) {
      user.neighborhood = body.neighborhood ? String(body.neighborhood).trim().slice(0, 120) : null;
    }
    if (body.profession !== undefined) {
      user.profession = body.profession ? String(body.profession).trim().slice(0, 120) : null;
    }
    if (body.companyName !== undefined) {
      user.companyName = body.companyName ? String(body.companyName).trim().slice(0, 120) : null;
    }
    if (body.bio !== undefined) {
      user.bio = body.bio ? String(body.bio).trim().slice(0, 1000) : null;
    }
    if (Array.isArray(body.skills)) {
      user.skills = body.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
    } else if (typeof body.skills === 'string') {
      user.skills = body.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
    }

    if (typeof body.isVerified === 'boolean') {
      user.isVerified = body.isVerified;
      user.verificationStatus = body.isVerified ? 'verified' : 'none';
    }
    if (typeof body.isBlocked === 'boolean') {
      if (user.role === 'super_admin' && body.isBlocked) {
        return res.status(400).json({ message: 'Adminni bloklab bo‘lmaydi' });
      }
      user.isBlocked = body.isBlocked;
      user.blockReason = body.isBlocked
        ? (typeof body.blockReason === 'string' && body.blockReason.trim()) || 'Administrator qarori'
        : null;
    }

    if (user.role !== prevRole || (user.isBlocked && !prevBlocked)) {
      user.sessionValidAfter = nowIso();
    }
    user.updatedAt = nowIso();
    db.upsertUser(user);

    if (user.role === 'worker') {
      updateWorkerGeoRow(sqlite, {
        workerId: user.id,
        kycVerified: Boolean(user.isVerified && !user.isBlocked),
      });
    }

    logAdmin(auth.userId, 'EDIT_USER', {
      targetType: user.role,
      targetId: user.id,
      details: {
        fullName: user.fullName,
        role: user.role,
        isVerified: user.isVerified,
        isBlocked: user.isBlocked,
      },
    });

    res.json({
      success: true,
      user: {
        uid: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        region: user.region,
        district: user.district,
        profession: user.profession,
        skills: user.skills,
        companyName: user.companyName,
        bio: user.bio,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        isBlocked: user.isBlocked,
        blockReason: user.blockReason,
      },
    });
  });

  router.patch('/admin/users/:id/block', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (user.role === 'super_admin') {
      return res.status(400).json({ message: 'Adminni bloklab bo‘lmaydi' });
    }
    const isBlocked = Boolean(req.body?.isBlocked);
    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 300) : null;
    user.isBlocked = isBlocked;
    user.blockReason = isBlocked ? reason || 'Administrator qarori' : null;
    if (isBlocked) user.sessionValidAfter = nowIso();
    user.updatedAt = nowIso();
    db.upsertUser(user);

    logAdmin(auth.userId, isBlocked ? 'BLOCK_USER' : 'UNBLOCK_USER', {
      targetType: user.role,
      targetId: user.id,
      details: { reason: user.blockReason },
    });

    res.json({ success: true, isBlocked: user.isBlocked, blockReason: user.blockReason });
  });

  // 8. SOS incidents list + update status (logs exact coordinate view)
  router.get('/admin/sos', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare('SELECT * FROM sos_hodisalari ORDER BY created_at DESC LIMIT 200')
      .all() as Array<Record<string, unknown>>;

    logAdmin(auth.userId, 'VIEW_SOS_LIST', {
      targetType: 'sos',
      viewedExactCoords: rows.some((r) => r.lat != null && r.lng != null),
    });

    res.json({
      incidents: rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        userName: r.user_name ? String(r.user_name) : null,
        userRole: String(r.user_role),
        orderId: r.order_id ? String(r.order_id) : null,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        message: r.message ? String(r.message) : null,
        status: String(r.status),
        trustedNotified: Boolean(r.trusted_notified),
        trustedContactSummary: r.trusted_contact_summary ? String(r.trusted_contact_summary) : null,
        adminNote: r.admin_note ? String(r.admin_note) : null,
        handledBy: r.handled_by ? String(r.handled_by) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
    });
  });

  router.patch('/admin/sos/:id', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const status = String(req.body?.status || '').trim();
    if (!['yangi', 'korilmoqda', 'yopildi'].includes(status)) {
      return res.status(400).json({ message: 'Noto‘g‘ri SOS holati' });
    }
    const note = req.body?.adminNote ? String(req.body.adminNote).trim().slice(0, 500) : null;
    const now = nowIso();
    sqlite
      .prepare(
        `UPDATE sos_hodisalari SET status = ?, admin_note = COALESCE(?, admin_note), handled_by = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, note, auth.userId, now, req.params.id);

    logAdmin(auth.userId, 'UPDATE_SOS_STATUS', {
      targetType: 'sos',
      targetId: req.params.id,
      details: { status, note },
    });

    res.json({ success: true, status });
  });

  // 9. Tariffs CRUD + change history
  router.get('/admin/tariffs', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const rates = sqlite
      .prepare('SELECT * FROM tarif_stavkalari ORDER BY service_type, duration_type')
      .all() as Array<Record<string, unknown>>;
    const history = sqlite
      .prepare('SELECT * FROM tarif_stavkalari_tarixi ORDER BY changed_at DESC LIMIT 100')
      .all() as Array<Record<string, unknown>>;
    res.json({
      rates: rates.map((r) => ({
        id: String(r.id),
        serviceType: String(r.service_type),
        durationType: String(r.duration_type),
        rateSom: Number(r.rate_som),
        updatedBy: r.updated_by ? String(r.updated_by) : null,
        updatedAt: String(r.updated_at),
      })),
      history: history.map((h) => ({
        id: String(h.id),
        serviceType: String(h.service_type),
        durationType: String(h.duration_type),
        oldRateSom: Number(h.old_rate_som),
        newRateSom: Number(h.new_rate_som),
        changedBy: h.changed_by ? String(h.changed_by) : null,
        changedByName: h.changed_by_name ? String(h.changed_by_name) : null,
        changedAt: String(h.changed_at),
      })),
    });
  });

  router.put('/admin/tariffs', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const serviceType = String(req.body?.serviceType || '');
    const durationType = String(req.body?.durationType || '');
    const rateSom = Math.round(Number(req.body?.rateSom || 0));
    if (
      !(YANDEX_SERVICE_TYPES as readonly string[]).includes(serviceType) ||
      !(YANDEX_DURATION_TYPES as readonly string[]).includes(durationType) ||
      !Number.isFinite(rateSom) ||
      rateSom < 5000 ||
      rateSom > 50_000_000
    ) {
      return res.status(400).json({ message: 'Stavka qiymati noto‘g‘ri' });
    }

    const existing = sqlite
      .prepare('SELECT rate_som FROM tarif_stavkalari WHERE service_type = ? AND duration_type = ?')
      .get(serviceType, durationType) as { rate_som?: number } | undefined;
    const oldRate = Number(existing?.rate_som ?? 0);
    const now = nowIso();
    const rawAdminName = db.getUserById(auth.userId)?.fullName;
    const adminName = rawAdminName && !/^super[\s_-]?admin$/i.test(rawAdminName) ? rawAdminName : 'Admin';

    sqlite
      .prepare(
        `INSERT INTO tarif_stavkalari (id, service_type, duration_type, rate_som, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(service_type, duration_type) DO UPDATE SET
           rate_som = excluded.rate_som,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .run(`${serviceType}__${durationType}`, serviceType, durationType, rateSom, auth.userId, now);

    sqlite
      .prepare(
        `INSERT INTO tarif_stavkalari_tarixi (
           id, service_type, duration_type, old_rate_som, new_rate_som, changed_by, changed_by_name, changed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(`th_${randomUUID().slice(0, 8)}`, serviceType, durationType, oldRate, rateSom, auth.userId, adminName, now);

    logAdmin(auth.userId, 'UPDATE_TARIFF', {
      targetType: 'tariff',
      targetId: `${serviceType}:${durationType}`,
      details: { oldRate, newRate: rateSom },
    });

    res.json({ success: true, serviceType, durationType, oldRate, newRate: rateSom, updatedAt: now });
  });

  // 10. Matching algorithm settings
  router.get('/admin/matching-settings', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    res.json(getMatchingSettings(sqlite));
  });

  router.put('/admin/matching-settings', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const cur = getMatchingSettings(sqlite);
    const rawTimeout = Math.round(Number(req.body?.offerTimeoutSec ?? cur.offerTimeoutSec));
    const offerTimeoutSec = !Number.isFinite(rawTimeout) || rawTimeout <= 0 ? 0 : Math.max(15, Math.min(86400, rawTimeout));
    const next = {
      weightDistance: Math.max(0, Math.min(100, Number(req.body?.weightDistance ?? cur.weightDistance))),
      weightRating: Math.max(0, Math.min(100, Number(req.body?.weightRating ?? cur.weightRating))),
      weightAcceptance: Math.max(0, Math.min(100, Number(req.body?.weightAcceptance ?? cur.weightAcceptance))),
      weightService: Math.max(0, Math.min(100, Number(req.body?.weightService ?? cur.weightService))),
      initialRadiusKm: Math.max(1, Math.min(50, Number(req.body?.initialRadiusKm ?? cur.initialRadiusKm))),
      radiusStepKm: Math.max(1, Math.min(25, Number(req.body?.radiusStepKm ?? cur.radiusStepKm))),
      maxRadiusKm: Math.max(5, Math.min(100, Number(req.body?.maxRadiusKm ?? cur.maxRadiusKm))),
      offerTimeoutSec,
      liveLocationTtlSec: Math.max(60, Math.min(3600, Math.round(Number(req.body?.liveLocationTtlSec ?? cur.liveLocationTtlSec)))),
      updatedAt: nowIso(),
    };

    sqlite
      .prepare(
        `UPDATE matching_sozlamalari
         SET weight_distance = ?, weight_rating = ?, weight_acceptance = ?, weight_service = ?,
             initial_radius_km = ?, radius_step_km = ?, max_radius_km = ?,
             offer_timeout_sec = ?, live_location_ttl_sec = ?, updated_by = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(
        next.weightDistance,
        next.weightRating,
        next.weightAcceptance,
        next.weightService,
        next.initialRadiusKm,
        next.radiusStepKm,
        next.maxRadiusKm,
        next.offerTimeoutSec,
        next.liveLocationTtlSec,
        auth.userId,
        next.updatedAt,
      );

    logAdmin(auth.userId, 'UPDATE_MATCHING_SETTINGS', { targetType: 'matching_settings', details: next });
    res.json({ ...next, updatedBy: auth.userId });
  });

  // 11. Organizations & annual subscriptions
  router.get('/admin/organizations/subscriptions', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare('SELECT * FROM tashkilot_obunalari ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    res.json({
      subscriptions: rows.map((r) => ({
        id: String(r.id),
        employerId: String(r.employer_id),
        companyName: String(r.company_name),
        planName: String(r.plan_name),
        annualPriceSom: Number(r.annual_price_som),
        status: String(r.status),
        startsAt: String(r.starts_at),
        expiresAt: String(r.expires_at),
        createdAt: String(r.created_at),
      })),
    });
  });

  router.post('/admin/organizations/subscriptions', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const employerId = String(req.body?.employerId || '').trim();
    const companyName = String(req.body?.companyName || 'Tashkilot').trim().slice(0, 120);
    const planName = String(req.body?.planName || 'Yillik Tashkilot Rejasi').trim().slice(0, 100);
    const annualPriceSom = Math.max(0, Math.round(Number(req.body?.annualPriceSom || 15000000)));
    const status = ['active', 'pending', 'expired', 'cancelled'].includes(String(req.body?.status))
      ? String(req.body.status)
      : 'active';
    if (!employerId) return res.status(400).json({ message: 'Tashkilot ID majburiy' });

    const now = new Date();
    const expires = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : new Date(now.getTime() + 365 * 86400_000);
    const id = `orgsub_${randomUUID().slice(0, 8)}`;

    sqlite
      .prepare(
        `INSERT INTO tashkilot_obunalari (
           id, employer_id, company_name, plan_name, annual_price_som, status, starts_at, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, employerId, companyName, planName, annualPriceSom, status, now.toISOString(), expires.toISOString(), now.toISOString(), now.toISOString());

    logAdmin(auth.userId, 'CREATE_ORG_SUBSCRIPTION', { targetType: 'organization', targetId: id, details: { companyName, planName, status } });
    res.status(201).json({ id, employerId, companyName, planName, annualPriceSom, status, startsAt: now.toISOString(), expiresAt: expires.toISOString() });
  });

  router.patch('/admin/organizations/subscriptions/:id', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const status = String(req.body?.status || '').trim();
    if (!['active', 'pending', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Noto‘g‘ri obuna holati' });
    }
    const now = nowIso();
    sqlite
      .prepare('UPDATE tashkilot_obunalari SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, req.params.id);

    logAdmin(auth.userId, 'UPDATE_ORG_SUBSCRIPTION', { targetType: 'organization', targetId: req.params.id, details: { status } });
    res.json({ success: true, status });
  });

  // 12. Real Yandex-order analytics
  router.get('/admin/analytics', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const orders = sqlite.prepare('SELECT * FROM ish_buyurtmasi').all() as Array<Record<string, unknown>>;
    const totalOrders = orders.length;
    const matchedCount = orders.filter((o) => Boolean(o.worker_id)).length;
    const completed = orders.filter((o) => o.status === 'yakunlandi');
    const cancelled = orders.filter((o) => o.status === 'bekor_qilindi');
    const totalWorkerEarnings = completed.reduce((sum, o) => sum + Number(o.agreed_rate || o.recommended_rate || 0), 0);

    const cancelReasons: Record<string, number> = {};
    for (const c of cancelled) {
      const key = String(c.cancel_reason || 'Sabab ko‘rsatilmagan');
      cancelReasons[key] = (cancelReasons[key] || 0) + 1;
    }

    const byService: Record<string, number> = {};
    for (const o of orders) {
      const s = String(o.service_type || 'other');
      byService[s] = (byService[s] || 0) + 1;
    }

    const workers = db.listUsers().filter((u) => u.role === 'worker');
    const avgWorkerRating = workers.length
      ? Math.round((workers.reduce((s, w) => s + Number(w.rating || 0), 0) / workers.length) * 10) / 10
      : 0;

    res.json({
      totalOrders,
      matchedCount,
      matchRatePercent: totalOrders > 0 ? Math.round((matchedCount / totalOrders) * 1000) / 10 : 0,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      totalWorkerEarnings,
      avgWorkerRating,
      cancelReasons: Object.entries(cancelReasons).map(([reason, count]) => ({ reason, count })),
      byService: Object.entries(byService).map(([serviceType, count]) => ({ serviceType, count })),
    });
  });

  // 13. Super Admin Audit Journal (including coordinate access logs)
  router.get('/admin/audit-logs', (req, res) => {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;
    const rows = sqlite
      .prepare('SELECT * FROM admin_audit_jurnali ORDER BY created_at DESC LIMIT 300')
      .all() as Array<Record<string, unknown>>;
    res.json({
      logs: rows.map((r) => ({
        id: String(r.id),
        adminId: String(r.admin_id),
        adminName: r.admin_name ? String(r.admin_name) : null,
        action: String(r.action),
        targetType: r.target_type ? String(r.target_type) : null,
        targetId: r.target_id ? String(r.target_id) : null,
        details: r.details ? String(r.details) : null,
        viewedExactCoords: Boolean(r.viewed_exact_coords),
        createdAt: String(r.created_at),
      })),
    });
  });
}
