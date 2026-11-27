import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import {
  AppDatabase,
  makeUser,
  normalizeEmail,
  normalizePhone,
  nowIso,
  splitName,
  type StoredApplication,
  type StoredContract,
  type StoredDispute,
  type StoredJob,
  type StoredMessage,
  type StoredNotification,
  type StoredReview,
  type StoredServicePost,
  type StoredUser,
  type StoredVerification,
  type UserRole,
} from './server/db';
import {
  buildTelegramAuthUrl,
  exchangeTelegramCode,
  generatePkcePair,
  getTelegramConfig,
  verifyTelegramIdToken,
} from './server/telegramAuth';
import { calculateMatchScore, getCoordsForUser, haversineKm } from './server/matching';
import { attachYandexRoutes } from './server/yandexRoutes';
import { sweepExpiredOffersAndLocations } from './server/matching';
import { dispatchPushEvent, realtimeHub } from './server/realtime';
import { redactCoordinatesFromLogPayload } from './server/privacyAndCoords';

const SESSION_COOKIE_NAME = 'mq_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UZ_PHONE_REGEX = /^\+998\d{9}$/;
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]{1,120}$/;

const RUNTIME_JWT_SECRET = process.env.JWT_SECRET?.trim() || randomBytes(32).toString('hex');

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function safeEqualStrings(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function detectUploadedFileType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  // WebP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // GIF87a / GIF89a
  if (buf.length >= 6) {
    const hdr = buf.subarray(0, 6).toString('ascii');
    if (hdr === 'GIF87a' || hdr === 'GIF89a') {
      return { mime: 'image/gif', ext: 'gif' };
    }
  }
  // PDF: %PDF-
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
}

/** Recovers raw file bytes if an older upload row accidentally stored the raw multipart/form-data body. */
function recoverLegacyMultipartBytes(buf: Buffer): { data: Buffer; mime: string } | null {
  const head = buf.subarray(0, 128).toString('latin1');
  if (!head.startsWith('--')) return null;
  const firstEol = buf.indexOf(Buffer.from('\r\n'));
  if (firstEol <= 2) return null;
  const boundary = buf.subarray(0, firstEol);
  const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), firstEol);
  if (headerEnd === -1) return null;
  const bodyStart = headerEnd + 4;
  const nextBoundary = buf.indexOf(Buffer.concat([Buffer.from('\r\n'), boundary]), bodyStart);
  const extracted = nextBoundary > bodyStart ? buf.subarray(bodyStart, nextBoundary) : buf.subarray(bodyStart);
  const detected = detectUploadedFileType(extracted);
  if (!detected) return null;
  return { data: extracted, mime: detected.mime };
}

function isOwnedPrivateUploadUrl(url: string, userId: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const prefix = `/api/uploads/private/${userId}/`;
  if (!trimmed.startsWith(prefix)) return false;
  const filePart = trimmed.slice(prefix.length);
  return SAFE_FILENAME_REGEX.test(filePart);
}

function sanitizePassportData(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const series = String(r.series || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const number = String(r.number || '').trim().replace(/\D/g, '').slice(0, 7);
  const pinfl = String(r.pinfl || '').trim().replace(/\D/g, '').slice(0, 14);
  const fullName = String(r.fullName || '').trim().slice(0, 120);
  const issueDate = r.issueDate ? String(r.issueDate).trim().slice(0, 32) : '';
  const expiryDate = r.expiryDate ? String(r.expiryDate).trim().slice(0, 32) : '';
  if (!series && !number && !pinfl && !fullName) return undefined;
  return {
    series,
    number,
    pinfl,
    fullName,
    ...(issueDate ? { issueDate } : {}),
    ...(expiryDate ? { expiryDate } : {}),
  };
}

function signJwt(payload: Record<string, unknown>, expiresInSec = SESSION_MAX_AGE_SEC): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const body = base64UrlEncode(
    JSON.stringify({ ...payload, iat: now, iatMs: nowMs, exp: now + expiresInSec }),
  );
  const sig = base64UrlEncode(createHmac('sha256', RUNTIME_JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyJwt(
  token: string,
): { sub: string; role: UserRole; email?: string | null; iat?: number; iatMs?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = base64UrlEncode(
      createHmac('sha256', RUNTIME_JWT_SECRET).update(`${header}.${body}`).digest(),
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(base64UrlDecode(body)) as {
      sub?: string;
      role?: UserRole;
      email?: string | null;
      iat?: number;
      iatMs?: number;
      exp?: number;
    };
    if (!parsed.sub || !parsed.role) return null;
    if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) return null;
    return {
      sub: parsed.sub,
      role: parsed.role,
      email: parsed.email,
      iat: parsed.iat,
      iatMs: parsed.iatMs,
    };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req.secure || forwardedProto === 'https';
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api',
    'HttpOnly',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    secure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/api',
    'HttpOnly',
    'Max-Age=0',
    secure ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isStaff(role?: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

function sanitizeUser(
  u: StoredUser,
  opts?: { includePrivate?: boolean; includePersonal?: boolean; includeCore?: boolean },
) {
  const {
    passwordHash: _pw,
    pinHash: _pin,
    personalInfo,
    coreIndicators,
    latitude: _lat,
    longitude: _lng,
    sessionValidAfter: _sva,
    ...rest
  } = u;
  const piObj = personalInfo && typeof personalInfo === 'object' ? (personalInfo as Record<string, unknown>) : null;
  const out: Record<string, unknown> = {
    ...rest,
    hasPin: Boolean(_pin),
    hasTelegram: Boolean(u.telegramId),
    onboardingCompleted: Boolean(piObj?.onboardingCompleted),
    permissionsAcknowledged: Boolean(piObj?.permissionsAcknowledged),
  };
  if (opts?.includePersonal) out.personalInfo = personalInfo;
  if (opts?.includeCore) out.coreIndicators = coreIndicators;
  if (!opts?.includePrivate) {
    delete out.companyDocuments;
    delete out.tin;
    delete out.registrationNumber;
    delete out.recruiterContacts;
    delete out.riskScore;
    delete out.behaviorFlags;
    delete out.violationCount;
    delete out.blockReason;
  }
  return out;
}

function parseIdentifier(raw: string): { kind: 'email' | 'phone'; email: string | null; phoneNumber: string | null } | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    const email = normalizeEmail(trimmed);
    if (!EMAIL_REGEX.test(email) || email.length > 254) return null;
    return { kind: 'email', email, phoneNumber: null };
  }
  const phone = normalizePhone(trimmed);
  if (!UZ_PHONE_REGEX.test(phone)) return null;
  return { kind: 'phone', email: null, phoneNumber: phone };
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({
        message: 'Juda ko‘p urinish. Iltimos, birozdan keyin qayta urinib ko‘ring.',
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

const ALLOWED_SELF_PROFILE_FIELDS = new Set([
  'fullName',
  'firstName',
  'lastName',
  'region',
  'district',
  'neighborhood',
  'bio',
  'skills',
  'profession',
  'educationLevel',
  'photoUrl',
  'coverUrl',
  'telegram',
  'languages',
  'availability',
  'lookingForWork',
  'professionalSummary',
  'preferredContact',
  'experienceLevel',
  'education',
  'experience',
  'certificates',
  'portfolio',
  'resumeTemplate',
  'companyName',
  'businessType',
  'industry',
  'registrationNumber',
  'tin',
  'website',
  'foundedYear',
  'employeeCount',
  'officeAddress',
  'companyGallery',
  'companyDocuments',
  'recruiterContacts',
]);

const ALLOWED_STAFF_USER_FIELDS = new Set([
  ...ALLOWED_SELF_PROFILE_FIELDS,
  'isBlocked',
  'blockReason',
  'isVerified',
  'verificationStatus',
  'isPremium',
  'trustScore',
  'riskScore',
  'behaviorFlags',
  'violationCount',
]);

const ALLOWED_JOB_UPDATE_FIELDS = new Set([
  'title',
  'description',
  'category',
  'region',
  'district',
  'neighborhood',
  'salary',
  'price',
  'salaryType',
  'workType',
  'scheduledAt',
  'status',
  'requirements',
  'images',
]);

const ALLOWED_SERVICE_POST_FIELDS = new Set([
  'title',
  'description',
  'category',
  'price',
  'expectedPrice',
  'priceType',
  'region',
  'district',
  'images',
  'isActive',
  'status',
]);

function pickFields(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source || {})) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function getDefaultGlobalSettings() {
  return {
    id: 'global_config',
    maxJobPostsPerWeek: 5,
    maxServicePostsPerWeek: 5,
    maxApplicationsPerDay: 10,
    enableNotifications: true,
    enableModeration: true,
    maintenanceMode: false,
    updatedBy: null as string | null,
    updatedAt: nowIso(),
  };
}

function getDefaultSubscriptionState() {
  return {
    status: 'active' as 'active' | 'expired',
    freeUntil: new Date(Date.now() + 30 * 86400_000).toISOString(),
    paidUntil: new Date(Date.now() + 30 * 86400_000).toISOString(),
    effectiveUntil: new Date(Date.now() + 30 * 86400_000).toISOString(),
    lastPaymentAt: null as string | null,
    priceSom: Number(process.env.SUBSCRIPTION_PRICE || 250000),
    daysRemaining: 30,
    inWarningWindow: false,
    blocked: false,
    priceRange: { min: 100000, max: 500000 },
    warningDays: 5,
    blockedPaths: [] as string[],
  };
}

export function buildApiRouter(db: AppDatabase) {
  const router = express.Router();
  const authRateLimit = createRateLimiter(15 * 60_000, 25);

  const isAllowedCorsOrigin = (origin: string): boolean => {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();
      if (
        origin === 'https://localhost' ||
        origin === 'http://localhost' ||
        origin === 'capacitor://localhost' ||
        origin === 'ionic://localhost' ||
        (host === 'localhost' && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) ||
        (host === '127.0.0.1' && (parsed.protocol === 'http:' || parsed.protocol === 'https:'))
      ) {
        return true;
      }
      if (parsed.protocol !== 'https:') return false;
      if (host === 'mexrliqollar.uz' || host.endsWith('.mexrliqollar.uz')) return true;
      if (host.endsWith('.ai.studio') || host.endsWith('.run.app')) return true;
      const configured = [process.env.APP_URL || '', process.env.PUBLIC_API_URL || '', ...(process.env.CORS_ORIGIN || '').split(',')]
        .map((s) => s.trim())
        .filter(Boolean);
      for (const candidate of configured) {
        try {
          if (new URL(candidate).origin === parsed.origin) return true;
        } catch {
          /* ignore malformed env entry */
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  router.use((req, res, next) => {
    const origin = String(req.headers.origin || '').trim();
    if (origin && isAllowedCorsOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  router.use(express.json({ limit: '15mb' }));
  router.use(express.urlencoded({ extended: false }));

  // CSRF check for cookie-authenticated mutations (Bearer requests are naturally CSRF-safe)
  router.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) return next();
    const cookies = parseCookies(req.headers.cookie);
    if (!cookies[SESSION_COOKIE_NAME]) return next();

    const xrw = req.headers['x-requested-with'];
    if (xrw) return next();

    const origin = req.headers.origin;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (origin && host) {
      try {
        if (new URL(origin).host === host) return next();
      } catch {
        /* invalid origin */
      }
    }
    return res.status(403).json({ message: 'So‘rov manbasi tasdiqlanmadi (CSRF himoyasi)' });
  });

  function getAuth(req: Request): { userId: string; role: UserRole; email?: string | null } | null {
    const rawAuth = req.headers.authorization || '';
    let token = '';
    if (rawAuth.startsWith('Bearer ')) {
      token = rawAuth.slice(7).trim();
    } else {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies[SESSION_COOKIE_NAME] || '';
    }
    if (!token) return null;
    const payload = verifyJwt(token);
    if (!payload) return null;
    const user = db.getUserById(payload.sub);
    if (!user || user.isBlocked) return null;
    if (user.sessionValidAfter) {
      const validAfterMs = new Date(user.sessionValidAfter).getTime();
      const issuedAtMs = typeof payload.iatMs === 'number' ? payload.iatMs : (payload.iat ?? 0) * 1000;
      if (issuedAtMs < validAfterMs) return null;
    }
    return { userId: user.id, role: user.role, email: user.email };
  }

  function requireAuth(req: Request, res: Response): { userId: string; role: UserRole; email?: string | null } | null {
    const auth = getAuth(req);
    if (!auth) {
      res.status(401).json({ message: 'Avtorizatsiya talab qilinadi' });
      return null;
    }
    return auth;
  }

  function issueSession(req: Request, res: Response, user: StoredUser) {
    const accessToken = signJwt({ sub: user.id, role: user.role, email: user.email });
    setSessionCookie(req, res, accessToken);
    return {
      accessToken,
      user: sanitizeUser(user, {
        includePrivate: true,
        includePersonal: user.role === 'worker' || user.role === 'super_admin',
        includeCore: user.role === 'super_admin',
      }),
    };
  }

  router.get('/health', (_req, res) => {
    res.json({ ok: true, status: 'healthy', database: 'sqlite', timestamp: nowIso() });
  });

  router.get('/gate', (_req, res) => {
    res.json({
      state: 'live',
      sections: {
        register: true,
        login: true,
        workers: true,
        jobs: true,
        chat: true,
        calls: true,
        verification: true,
        admin: true,
        superAdmin: true,
      },
      notice: '',
    });
  });

  router.get('/stats/counts', (_req, res) => {
    const allUsers = db.listUsers().filter((u) => !u.isBlocked);
    const allJobs = db.listJobs();
    const allApps = db.listApplications();
    const allContracts = db.listContracts();
    res.json({
      users: allUsers.length,
      jobs: allJobs.length,
      applications: allApps.length,
      contracts: allContracts.length,
      workers: allUsers.filter((u) => u.role === 'worker').length,
      employers: allUsers.filter((u) => u.role === 'employer').length,
      activeJobs: allJobs.filter((j) => j.status === 'active' || j.status === 'open').length,
      pendingApplications: allApps.filter((a) => a.status === 'pending').length,
      activeContracts: allContracts.filter((c) => c.status === 'active').length,
      completedContracts: allContracts.filter((c) => c.status === 'completed').length,
    });
  });

  // --- AUTH (Email or Phone + Password, persisted in SQLite) ---
  router.post('/auth/register', authRateLimit, asyncHandler(async (req, res) => {
    const rawIdentifier = String(
      req.body?.identifier || req.body?.emailOrPhone || req.body?.email || req.body?.phone || req.body?.phoneNumber || '',
    ).trim();
    const password = String(req.body?.password || '');

    if (!rawIdentifier) {
      return res.status(400).json({ message: 'Email yoki telefon raqamini kiriting' });
    }
    const parsedId = parseIdentifier(rawIdentifier);
    if (!parsedId) {
      return res.status(400).json({
        message: 'To‘g‘ri email manzili yoki +998XXXXXXXXX formatida telefon raqami kiriting',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak' });
    }
    if (password.length > 128) {
      return res.status(400).json({ message: 'Parol 128 ta belgidan oshmasligi kerak' });
    }

    // Optional secondary email/phone validation
    let email = parsedId.email;
    let phoneNumber = parsedId.phoneNumber;
    if (!email && req.body?.email) {
      const e = normalizeEmail(String(req.body.email));
      if (!EMAIL_REGEX.test(e)) {
        return res.status(400).json({ message: 'Email manzili noto‘g‘ri' });
      }
      email = e;
    }
    if (!phoneNumber && (req.body?.phone || req.body?.phoneNumber)) {
      const p = normalizePhone(String(req.body.phone || req.body.phoneNumber));
      if (!UZ_PHONE_REGEX.test(p)) {
        return res.status(400).json({ message: 'Telefon raqami +998XXXXXXXXX formatida bo‘lishi kerak' });
      }
      phoneNumber = p;
    }

    if (email && db.getUserByEmail(email)) {
      return res.status(409).json({ message: 'Bu email manzili bilan hisob allaqachon mavjud' });
    }
    if (phoneNumber && db.getUserByPhone(phoneNumber)) {
      return res.status(409).json({ message: 'Bu telefon raqami bilan hisob allaqachon mavjud' });
    }

    // Self-registration strictly allows least-privilege roles only
    const requestedRole = String(req.body?.role || 'worker').trim();
    const role: UserRole = requestedRole === 'employer' ? 'employer' : 'worker';

    const firstNameInput = String(req.body?.firstName || '').trim();
    const lastNameInput = String(req.body?.lastName || '').trim();
    const combinedName =
      String(req.body?.fullName || req.body?.name || '').trim() ||
      `${firstNameInput} ${lastNameInput}`.trim() ||
      (email ? email.split('@')[0] : 'Foydalanuvchi');
    const nameParts = splitName(combinedName);

    const passwordHash = await bcrypt.hash(password, 10);
    const id = `${role}_${randomUUID().slice(0, 12)}`;
    const profession = req.body?.profession ? String(req.body.profession).trim().slice(0, 80) : null;
    const educationLevel = req.body?.educationLevel ? String(req.body.educationLevel).trim().slice(0, 50) : null;
    const district = req.body?.district ? String(req.body.district).trim().slice(0, 60) : 'samarkand_city';

    const user = makeUser({
      id,
      email,
      phoneNumber,
      passwordHash,
      fullName: nameParts.fullName.slice(0, 120),
      firstName: (firstNameInput || nameParts.firstName || '').slice(0, 60) || null,
      lastName: (lastNameInput || nameParts.lastName || '').slice(0, 60) || null,
      role,
      district,
      profession,
      skills: profession ? [profession] : [],
      educationLevel,
      companyName: role === 'employer' ? nameParts.fullName.slice(0, 120) : null,
      personalInfo: { onboardingCompleted: true, permissionsAcknowledged: true },
    });

    try {
      db.upsertUser(user);
    } catch {
      return res.status(409).json({ message: 'Bu foydalanuvchi allaqachon ro‘yxatdan o‘tgan' });
    }

    return res.status(201).json(issueSession(req, res, user));
  }));

  router.post('/auth/login', authRateLimit, asyncHandler(async (req, res) => {
    const identifier = String(
      req.body?.identifier || req.body?.emailOrPhone || req.body?.email || req.body?.phone || '',
    ).trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email/telefon va parolni kiriting' });
    }

    const user = db.findUserByIdentifier(identifier);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Email/telefon yoki parol noto‘g‘ri' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Hisobingiz bloklangan. Administrator bilan bog‘laning.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Email/telefon yoki parol noto‘g‘ri' });
    }

    user.lastActive = nowIso();
    db.upsertUser(user);
    return res.json(issueSession(req, res, user));
  }));

  router.get('/auth/me', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(401).json({ message: 'Foydalanuvchi topilmadi' });
    res.json(
      sanitizeUser(user, {
        includePrivate: true,
        includePersonal: user.role === 'worker' || user.role === 'super_admin',
        includeCore: user.role === 'super_admin',
      }),
    );
  });

  router.get('/auth/session', (req, res) => {
    const auth = getAuth(req);
    if (!auth) {
      return res.json({ authenticated: false, user: null });
    }
    const user = db.getUserById(auth.userId);
    if (!user) {
      return res.json({ authenticated: false, user: null });
    }
    return res.json({ authenticated: true, ...issueSession(req, res, user) });
  });

  router.post('/auth/refresh', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(401).json({ message: 'Foydalanuvchi topilmadi' });
    res.json(issueSession(req, res, user));
  });

  router.post('/auth/logout', (req, res) => {
    const auth = getAuth(req);
    if (auth) {
      const user = db.getUserById(auth.userId);
      if (user) {
        user.sessionValidAfter = new Date(Date.now() + 1).toISOString();
        user.locationSharingEnabled = false;
        user.availability = 'offline';
        db.upsertUser(user);
      }
      db.deletePushTokensForUser(auth.userId);
      db.sqlite.prepare('DELETE FROM live_order_locations WHERE worker_id = ?').run(auth.userId);
      db.sqlite
        .prepare('UPDATE ishchi_holati SET is_online = 0, updated_at = ? WHERE worker_id = ?')
        .run(nowIso(), auth.userId);
    }
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  router.post('/auth/change-password', authRateLimit, asyncHandler(async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ message: 'Yangi parol 8–128 ta belgidan iborat bo‘lishi kerak' });
    }
    const user = db.getUserById(auth.userId);
    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Joriy parol noto‘g‘ri' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.sessionValidAfter = nowIso();
    user.updatedAt = nowIso();
    db.upsertUser(user);
    return res.json({ success: true, ...issueSession(req, res, user) });
  }));

  // --- 4-DIGIT BANK-STYLE PIN AUTHENTICATION ---
  const pinFailures = new Map<string, { count: number; lockedUntil: number }>();

  router.post('/auth/pin/setup', authRateLimit, asyncHandler(async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN-kod aynan 4 ta raqamdan iborat bo‘lishi kerak' });
    }
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Hisobingiz bloklangan' });
    }
    user.pinHash = await bcrypt.hash(pin, 10);
    user.updatedAt = nowIso();
    db.upsertUser(user);
    pinFailures.delete(user.id);
    return res.json({
      hasPin: true,
      user: sanitizeUser(user, {
        includePrivate: true,
        includePersonal: user.role === 'worker' || user.role === 'super_admin',
        includeCore: user.role === 'super_admin',
      }),
    });
  }));

  router.post('/auth/pin/verify', authRateLimit, asyncHandler(async (req, res) => {
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: '4 xonali PIN-kod kiriting' });
    }
    const userIdParam = String(req.body?.userId || '').trim();
    const identifierParam = String(req.body?.identifier || '').trim();
    const auth = getAuth(req);

    const user = userIdParam
      ? db.getUserById(userIdParam)
      : identifierParam
        ? db.findUserByIdentifier(identifierParam)
        : auth
          ? db.getUserById(auth.userId)
          : null;

    if (!user || !user.pinHash) {
      return res.status(401).json({ message: 'Ushbu hisob uchun PIN-kod o‘rnatilmagan' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Hisobingiz bloklangan. Administrator bilan bog‘laning.' });
    }

    const failState = pinFailures.get(user.id);
    if (failState && failState.lockedUntil > Date.now()) {
      const waitSec = Math.ceil((failState.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        message: `PIN-kod ko‘p marta noto‘g‘ri kiritildi. ${waitSec} soniyadan keyin urinib ko‘ring yoki parol bilan kiring.`,
      });
    }

    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) {
      const nextCount = (failState?.count || 0) + 1;
      pinFailures.set(user.id, {
        count: nextCount,
        lockedUntil: nextCount >= 5 ? Date.now() + 5 * 60_000 : 0,
      });
      return res.status(401).json({ message: 'PIN-kod noto‘g‘ri' });
    }

    pinFailures.delete(user.id);
    user.lastActive = nowIso();
    db.upsertUser(user);
    return res.json(issueSession(req, res, user));
  }));

  router.delete('/auth/pin', authRateLimit, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    user.pinHash = null;
    user.updatedAt = nowIso();
    db.upsertUser(user);
    pinFailures.delete(user.id);
    return res.json({
      hasPin: false,
      user: sanitizeUser(user, {
        includePrivate: true,
        includePersonal: user.role === 'worker' || user.role === 'super_admin',
        includeCore: user.role === 'super_admin',
      }),
    });
  });

  // Super Admin status & first-run claim (when env secret is not set)
  router.get('/auth/super-admin/status', (_req, res) => {
    const envPassword = process.env.SUPER_ADMIN_PASSWORD || '';
    const existingAdmin = db.listUsers().find((u) => u.role === 'super_admin' && u.passwordHash);
    res.json({
      configuredByEnv: Boolean(envPassword),
      needsSetup: !envPassword && !existingAdmin,
    });
  });

  router.post('/auth/super-admin/setup', authRateLimit, asyncHandler(async (req, res) => {
    if (process.env.SUPER_ADMIN_PASSWORD) {
      return res.status(403).json({ message: 'Boshqaruv paneli muhit o‘zgaruvchilari orqali sozlangan' });
    }
    const existingAdmin = db.listUsers().find((u) => u.role === 'super_admin' && u.passwordHash);
    if (existingAdmin) {
      return res.status(409).json({ message: 'Boshqaruv paneli allaqachon o‘rnatilgan' });
    }
    const login = String(req.body?.login || req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const parsed = parseIdentifier(login);
    if (!parsed) {
      return res.status(400).json({ message: 'To‘g‘ri email yoki +998 telefon raqami kiriting' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak' });
    }
    const emailCandidate = parsed.email || 'superadmin@mexrliqollar.uz';
    const existingByEmail = db.getUserByEmail(emailCandidate);
    if (existingByEmail && existingByEmail.id !== 'super_admin_1') {
      return res.status(409).json({ message: 'Bu email boshqa foydalanuvchi tomonidan band qilingan' });
    }
    if (parsed.phoneNumber) {
      const existingByPhone = db.getUserByPhone(parsed.phoneNumber);
      if (existingByPhone && existingByPhone.id !== 'super_admin_1') {
        return res.status(409).json({ message: 'Bu telefon raqami boshqa foydalanuvchi tomonidan band qilingan' });
      }
    }
    const admin = makeUser({
      id: 'super_admin_1',
      fullName: 'Admin',
      firstName: 'Admin',
      lastName: '',
      email: emailCandidate,
      phoneNumber: parsed.phoneNumber,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'super_admin',
      isVerified: true,
      verificationStatus: 'verified',
    });
    db.upsertUser(admin);
    return res.status(201).json(issueSession(req, res, admin));
  }));

  router.post('/auth/super-admin/login', authRateLimit, asyncHandler(async (req, res) => {
    const login = String(req.body?.login || req.body?.email || req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    if (!login || !password) {
      return res.status(400).json({ message: 'Login va parol majburiy' });
    }

    const envEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim();
    const envPhone = (process.env.SUPER_ADMIN_PHONE || '').trim();
    const envPassword = process.env.SUPER_ADMIN_PASSWORD || '';

    if (envPassword) {
      const defaultEmail = 'superadmin@mexrliqollar.uz';
      const hasConfiguredId = Boolean(envEmail || envPhone);
      const loginOk =
        (envEmail && login.toLowerCase() === envEmail.toLowerCase()) ||
        (envPhone && normalizePhone(login) === normalizePhone(envPhone)) ||
        (!hasConfiguredId && (login.toLowerCase() === defaultEmail || login.toLowerCase() === 'admin@mexrliqollar.uz'));
      if (!loginOk || !safeEqualStrings(password, envPassword)) {
        return res.status(401).json({ message: 'Boshqaruv paneli login yoki parol noto‘g‘ri' });
      }
      let admin = db.getUserById('super_admin_1') || db.listUsers().find((u) => u.role === 'super_admin');
      if (!admin) {
        // Avoid SQLite UNIQUE constraint crashes if the owner also registered a regular account with the same email/phone
        const desiredEmail = envEmail ? normalizeEmail(envEmail) : defaultEmail;
        const emailOwner = desiredEmail ? db.getUserByEmail(desiredEmail) : null;
        const safeEmail =
          !emailOwner || emailOwner.id === 'super_admin_1'
            ? desiredEmail
            : !db.getUserByEmail(defaultEmail)
              ? defaultEmail
              : `superadmin+${randomUUID().slice(0, 6)}@mexrliqollar.uz`;

        const desiredPhone = envPhone ? normalizePhone(envPhone) : null;
        const phoneOwner = desiredPhone ? db.getUserByPhone(desiredPhone) : null;
        const safePhone = !phoneOwner || phoneOwner.id === 'super_admin_1' ? desiredPhone : null;

        admin = makeUser({
          id: 'super_admin_1',
          fullName: 'Admin',
          firstName: 'Admin',
          lastName: '',
          email: safeEmail,
          phoneNumber: safePhone,
          passwordHash: await bcrypt.hash(envPassword, 10),
          role: 'super_admin',
          isVerified: true,
          verificationStatus: 'verified',
        });
        db.upsertUser(admin);
      } else if (/^super[\s_-]?admin$/i.test(admin.fullName || '')) {
        admin.fullName = 'Admin';
        admin.firstName = 'Admin';
        admin.lastName = '';
        db.upsertUser(admin);
      }
      return res.json(issueSession(req, res, admin));
    }

    // Fallback to DB-claimed admin panel account
    const admin = db.findUserByIdentifier(login);
    if (!admin || admin.role !== 'super_admin' || !admin.passwordHash) {
      return res.status(401).json({ message: 'Boshqaruv paneli login yoki parol noto‘g‘ri' });
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Boshqaruv paneli login yoki parol noto‘g‘ri' });
    }
    if (/^super[\s_-]?admin$/i.test(admin.fullName || '')) {
      admin.fullName = 'Admin';
      admin.firstName = 'Admin';
      admin.lastName = '';
      db.upsertUser(admin);
    }
    return res.json(issueSession(req, res, admin));
  }));

  // --- PASSWORDLESS TELEGRAM AUTH HELPERS ---
  const TG_NONCE_COOKIE = 'mq_tg_nonce';

  function isTrustedOriginUrl(originStr: string, req: Request): boolean {
    try {
      const parsed = new URL(originStr);
      const hostname = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
        return true;
      }
      if (parsed.protocol !== 'https:') return false;

      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      if (reqHost && parsed.host.toLowerCase() === reqHost) return true;

      if (hostname.endsWith('.ai.studio') || hostname.endsWith('.run.app')) return true;

      const configuredOrigins = [process.env.APP_URL || '', ...(process.env.CORS_ORIGIN || '').split(',')]
        .map((s) => s.trim())
        .filter(Boolean);
      for (const candidate of configuredOrigins) {
        try {
          if (new URL(candidate).origin === parsed.origin) return true;
        } catch {
          /* ignore invalid env URL */
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  function resolveAppOrigin(req: Request): string {
    const headerOrigin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
    if (headerOrigin && isTrustedOriginUrl(headerOrigin, req)) {
      return headerOrigin;
    }
    const envUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl) return envUrl;
    const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'))
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000')
      .split(',')[0]
      .trim();
    return `${proto}://${host}`;
  }

  function renderTelegramPopupHtml(payload: Record<string, unknown>): string {
    const safeJson = JSON.stringify(payload)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    return `<!doctype html>
<html lang="uz">
<head><meta charset="utf-8"><title>Telegram orqali kirish — Mehrli Qo‘llar</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a">
  <div style="text-align:center;padding:24px">
    <p style="font-size:15px;font-weight:600">Kirish yakunlanmoqda...</p>
    <p style="font-size:13px;color:#64748b">Ushbu oyna avtomatik yopiladi.</p>
  </div>
  <script>
    (function () {
      var data = ${safeJson};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, '*');
          window.close();
          return;
        }
      } catch (e) {}
      window.location.replace('/auth');
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Unified account resolution across Telegram Login and SMS OTP.
   * Phone number (+998XXXXXXXXX) is always the single canonical key so a user who
   * logs in via Telegram one day and SMS OTP another day never gets duplicate accounts.
   */
  function findOrCreateUnifiedUser(params: {
    telegramId?: string | null;
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    telegramUsername?: string | null;
    photoUrl?: string | null;
    role?: string | null;
    district?: string | null;
    educationLevel?: string | null;
    profession?: string | null;
  }): { user: StoredUser; isNew: boolean; blocked?: boolean } {
    const normalizedPhone = params.phoneNumber ? normalizePhone(params.phoneNumber) : null;
    const validPhone = normalizedPhone && UZ_PHONE_REGEX.test(normalizedPhone) ? normalizedPhone : null;
    const cleanTgId = params.telegramId ? String(params.telegramId).trim() : null;

    const byTg = cleanTgId ? db.getUserByTelegramId(cleanTgId) : null;
    const byPhone = validPhone ? db.getUserByPhone(validPhone) : null;

    // Prefer existing phone-linked account when unifying, or Telegram-linked account
    const existing = byTg || byPhone;
    if (existing) {
      if (existing.isBlocked) {
        return { user: existing, isNew: false, blocked: true };
      }
      let changed = false;

      // Link Telegram ID onto an existing phone-registered account (if not taken by another row)
      if (cleanTgId && !existing.telegramId && !byTg) {
        existing.telegramId = cleanTgId;
        changed = true;
      }
      // Link normalized phone onto an existing Telegram-registered account (if not taken by another row)
      if (validPhone && !existing.phoneNumber && !byPhone) {
        existing.phoneNumber = validPhone;
        changed = true;
      }
      if (params.telegramUsername && !existing.telegram) {
        existing.telegram = `@${params.telegramUsername.replace(/^@/, '')}`;
        changed = true;
      }
      if (params.photoUrl && !existing.photoUrl) {
        existing.photoUrl = params.photoUrl;
        changed = true;
      }
      // If user explicitly provided firstName/lastName during auth and current name is placeholder
      if (
        params.firstName &&
        (!existing.firstName || existing.fullName === 'Foydalanuvchi' || existing.fullName === 'Telegram foydalanuvchi')
      ) {
        const mergedFull = `${params.firstName} ${params.lastName || ''}`.trim();
        existing.firstName = params.firstName.slice(0, 60);
        existing.lastName = params.lastName ? params.lastName.slice(0, 60) : existing.lastName;
        existing.fullName = mergedFull.slice(0, 120);
        changed = true;
      }

      existing.lastActive = nowIso();
      if (changed) {
        existing.updatedAt = nowIso();
      }
      db.upsertUser(existing);
      return { user: existing, isNew: false };
    }

    // Create a brand new passwordless user (strictly least-privilege: worker or employer)
    const role: UserRole = params.role === 'employer' ? 'employer' : 'worker';
    const firstInput = String(params.firstName || '').trim();
    const lastInput = String(params.lastName || '').trim();
    const combinedName =
      `${firstInput} ${lastInput}`.trim() ||
      String(params.fullName || '').trim() ||
      'Foydalanuvchi';
    const nameParts = splitName(combinedName);
    const profession = params.profession ? String(params.profession).trim().slice(0, 80) : null;
    const educationLevel = params.educationLevel ? String(params.educationLevel).trim().slice(0, 50) : null;
    const district = params.district ? String(params.district).trim().slice(0, 60) : 'samarkand_city';

    const newUser = makeUser({
      id: `${role}_${randomUUID().slice(0, 12)}`,
      email: null,
      phoneNumber: validPhone,
      telegramId: cleanTgId,
      passwordHash: null,
      fullName: nameParts.fullName.slice(0, 120),
      firstName: (firstInput || nameParts.firstName || '').slice(0, 60) || null,
      lastName: (lastInput || nameParts.lastName || '').slice(0, 60) || null,
      role,
      district,
      profession: role === 'worker' ? profession : null,
      skills: role === 'worker' && profession ? [profession] : [],
      educationLevel: role === 'worker' ? educationLevel : null,
      telegram: params.telegramUsername ? `@${params.telegramUsername.replace(/^@/, '')}` : null,
      photoUrl: params.photoUrl || null,
      preferredContact: cleanTgId ? 'telegram' : 'phone',
      companyName: role === 'employer' ? nameParts.fullName.slice(0, 120) : null,
    });

    db.upsertUser(newUser);
    return { user: newUser, isNew: true };
  }

  // Public auth provider capability discovery (never leaks secrets)
  router.get('/auth/providers', (_req, res) => {
    const tg = getTelegramConfig();
    res.json({
      telegram: {
        enabled: tg.enabled,
        widgetEnabled: tg.widgetOnlyEnabled,
        clientId: tg.clientId || null,
        botUsername: tg.botUsername || null,
      },
      password: {
        enabled: true,
      },
    });
  });

  // Step 1 of Telegram Login: generate single-use cryptographic nonce (replay protection)
  router.get('/auth/nonce', authRateLimit, (req, res) => {
    const nonce = randomBytes(16).toString('hex');
    db.createAuthNonce({ nonce, ttlMs: 10 * 60_000 });
    const secure = isHttpsRequest(req);
    const cookieParts = [
      `${TG_NONCE_COOKIE}=${encodeURIComponent(nonce)}`,
      'Path=/api',
      'HttpOnly',
      'Max-Age=600',
      secure ? 'SameSite=None' : 'SameSite=Lax',
    ];
    if (secure) cookieParts.push('Secure', 'Partitioned');
    res.append('Set-Cookie', cookieParts.join('; '));
    const tg = getTelegramConfig();
    res.json({ nonce, clientId: tg.clientId || null });
  });

  // Start Telegram OIDC popup flow (returns direct oauth.telegram.org authorization URL for popup)
  router.post('/auth/telegram/start', authRateLimit, (req, res) => {
    const tg = getTelegramConfig();
    if (!tg.enabled) {
      return res.status(503).json({
        message:
          'Telegram orqali kirish hali sozlanmagan. Settings → Secrets bo‘limiga TELEGRAM_CLIENT_ID va TELEGRAM_CLIENT_SECRET ni kiriting.',
      });
    }

    const nonce = randomBytes(16).toString('hex');
    const state = randomBytes(16).toString('hex');
    const { codeVerifier, codeChallenge } = generatePkcePair();

    const firstName = String(req.body?.firstName || '').trim().slice(0, 60) || null;
    const lastName = String(req.body?.lastName || '').trim().slice(0, 60) || null;
    const role = req.body?.role === 'employer' ? 'employer' : 'worker';
    const district = String(req.body?.district || '').trim().slice(0, 60) || null;
    const educationLevel = String(req.body?.educationLevel || '').trim().slice(0, 50) || null;
    const profession = String(req.body?.profession || '').trim().slice(0, 80) || null;

    const redirectUri = `${resolveAppOrigin(req)}/api/auth/telegram/callback`;

    db.createAuthNonce({
      nonce,
      state,
      codeVerifier,
      payload: { firstName, lastName, role, district, educationLevel, profession, redirectUri },
      ttlMs: 10 * 60_000,
    });

    const authUrl = buildTelegramAuthUrl({
      clientId: tg.clientId,
      redirectUri,
      state,
      nonce,
      codeChallenge,
    });

    return res.json({ authUrl, state, nonce, redirectUri });
  });

  // Telegram OIDC callback (handles both with and without trailing slash)
  router.get(['/auth/telegram/callback', '/auth/telegram/callback/'], asyncHandler(async (req, res) => {
    const oauthError = String(req.query.error || '').trim();
    if (oauthError) {
      return res.send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_ERROR',
          error: 'Telegram orqali kirish bekor qilindi yoki rad etildi.',
        }),
      );
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      return res.status(400).send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_ERROR',
          error: 'Telegram javobi to‘liq emas (code yoki state yetishmayapti).',
        }),
      );
    }

    // Consume state atomically (single-use replay protection)
    const nonceRecord = db.consumeAuthNonceByState(state);
    if (!nonceRecord) {
      return res.status(400).send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_ERROR',
          error: 'Kirish sessiyasi eskirgan yoki qayta ishlatilgan. Qaytadan urinib ko‘ring.',
        }),
      );
    }

    const tg = getTelegramConfig();
    if (!tg.enabled) {
      return res.status(503).send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_ERROR',
          error: 'Telegram sozlamalari topilmadi.',
        }),
      );
    }

    try {
      const formMeta = (nonceRecord.payload || {}) as Record<string, string | null>;
      const redirectUri = formMeta.redirectUri || `${resolveAppOrigin(req)}/api/auth/telegram/callback`;
      const tokens = await exchangeTelegramCode({
        code,
        redirectUri,
        codeVerifier: nonceRecord.codeVerifier,
        clientId: tg.clientId,
        clientSecret: tg.clientSecret,
      });

      const verified = await verifyTelegramIdToken(tokens.id_token, {
        expectedClientId: tg.clientId,
        expectedNonce: nonceRecord.nonce,
        requireNonceClaim: false,
      });

      const resolved = findOrCreateUnifiedUser({
        telegramId: verified.telegramId,
        phoneNumber: verified.phoneNumber,
        firstName: formMeta.firstName || verified.firstName,
        lastName: formMeta.lastName || verified.lastName,
        fullName: verified.fullName,
        telegramUsername: verified.username,
        photoUrl: verified.photoUrl,
        role: formMeta.role,
        district: formMeta.district,
        educationLevel: formMeta.educationLevel,
        profession: formMeta.profession,
      });

      if (resolved.blocked) {
        return res.status(403).send(
          renderTelegramPopupHtml({
            type: 'TELEGRAM_AUTH_ERROR',
            error: 'Hisobingiz bloklangan. Administrator bilan bog‘laning.',
          }),
        );
      }

      const session = issueSession(req, res, resolved.user);
      return res.send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_SUCCESS',
          accessToken: session.accessToken,
          user: session.user,
          isNew: resolved.isNew,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Telegram tasdiqlashda xatolik yuz berdi';
      return res.status(401).send(
        renderTelegramPopupHtml({
          type: 'TELEGRAM_AUTH_ERROR',
          error: msg,
        }),
      );
    }
  }));

  // Step 2 of direct Telegram OIDC id_token flow (widget / SDK post_message flow)
  router.post('/auth/telegram', authRateLimit, asyncHandler(async (req, res) => {
    const idToken = String(req.body?.id_token || req.body?.idToken || '').trim();
    if (!idToken) {
      return res.status(400).json({ message: 'Telegram id_token majburiy' });
    }

    const cookies = parseCookies(req.headers.cookie);
    const expectedNonce = String(req.body?.nonce || cookies[TG_NONCE_COOKIE] || '').trim();
    if (!expectedNonce) {
      return res.status(400).json({ message: 'Xavfsizlik kodi (nonce) topilmadi. Qaytadan urinib ko‘ring.' });
    }

    const tg = getTelegramConfig();
    if (!tg.clientId) {
      return res.status(503).json({
        message: 'Telegram Client ID sozlanmagan (Settings → Secrets → TELEGRAM_CLIENT_ID).',
      });
    }

    // Consume single-use nonce atomically — prevents replay attacks
    const consumed = db.consumeAuthNonceByNonce(expectedNonce);
    if (!consumed) {
      return res.status(401).json({ message: 'Nonce eskirgan yoki allaqachon ishlatilgan.' });
    }

    let verified;
    try {
      verified = await verifyTelegramIdToken(idToken, {
        expectedClientId: tg.clientId,
        expectedNonce: consumed.nonce,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Telegram token tekshiruvdan o‘tmadi';
      return res.status(401).json({ message });
    }

    const firstName = String(req.body?.firstName || '').trim() || verified.firstName;
    const lastName = String(req.body?.lastName || '').trim() || verified.lastName;
    const resolved = findOrCreateUnifiedUser({
      telegramId: verified.telegramId,
      phoneNumber: verified.phoneNumber,
      firstName,
      lastName,
      fullName: verified.fullName,
      telegramUsername: verified.username,
      photoUrl: verified.photoUrl,
      role: req.body?.role ? String(req.body.role) : null,
      district: req.body?.district ? String(req.body.district) : null,
      educationLevel: req.body?.educationLevel ? String(req.body.educationLevel) : null,
      profession: req.body?.profession ? String(req.body.profession) : null,
    });

    if (resolved.blocked) {
      return res.status(403).json({ message: 'Hisobingiz bloklangan. Administrator bilan bog‘laning.' });
    }

    return res.json({ ok: true, isNew: resolved.isNew, ...issueSession(req, res, resolved.user) });
  }));

  // Deprecated OTP endpoints — disabled (Telegram Login is used instead)
  router.post('/auth/send-otp', (_req, res) => {
    res.status(410).json({
      message: 'SMS OTP kirish o‘chirilgan. Telegram orqali kiring yoki ro‘yxatdan o‘ting.',
    });
  });

  router.post('/auth/verify-otp', (_req, res) => {
    res.status(410).json({
      message: 'SMS OTP kirish o‘chirilgan. Telegram orqali kiring yoki ro‘yxatdan o‘ting.',
    });
  });

  router.post('/auth/reset-password', (_req, res) => {
    res.status(410).json({
      message: 'Parolni tiklash uchun profil sozlamalaridan foydalaning yoki administratorga murojaat qiling.',
    });
  });

  router.post('/auth/delete-account', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    if (!user) return res.status(401).json({ message: 'Foydalanuvchi topilmadi' });
    if (isStaff(user.role)) return res.status(403).json({ message: 'Xodim hisobini o‘chirib bo‘lmaydi' });
    user.isBlocked = true;
    user.phoneNumber = null;
    user.email = null;
    user.passwordHash = null;
    user.fullName = "O'chirilgan hisob";
    user.sessionValidAfter = nowIso();
    user.updatedAt = nowIso();
    db.upsertUser(user);
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  // --- USERS ---
  router.get('/users', (req, res) => {
    const auth = getAuth(req);
    const staff = isStaff(auth?.role);
    const role = req.query.role ? String(req.query.role) : undefined;
    const region = req.query.region ? String(req.query.region) : undefined;
    const district = req.query.district ? String(req.query.district) : undefined;

    if (!staff && role && role !== 'worker' && role !== 'employer') return res.json([]);
    const rows = db.listUsers().filter((u) => {
      if (!staff && u.isBlocked) return false;
      if (!staff && u.role !== 'worker' && u.role !== 'employer') return false;
      if (role && u.role !== role) return false;
      if (region && u.region !== region) return false;
      if (district && u.district !== district) return false;
      return true;
    });
    res.json(rows.map((u) => sanitizeUser(u, { includePrivate: staff, includeCore: auth?.role === 'super_admin' })));
  });

  router.get('/users/:id/personal-info', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    res.json({ personalInfo: user.personalInfo ?? null });
  });

  router.put('/users/:id/personal-info', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    user.personalInfo = (req.body?.personalInfo ?? req.body ?? null) as Record<string, unknown> | null;
    user.updatedAt = nowIso();
    db.upsertUser(user);
    res.json({ personalInfo: user.personalInfo });
  });

  router.get('/users/:id/core-indicators', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    res.json({ coreIndicators: user.coreIndicators ?? null });
  });

  router.put('/users/:id/core-indicators', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    user.coreIndicators = (req.body?.coreIndicators ?? req.body ?? null) as Record<string, unknown> | null;
    user.updatedAt = nowIso();
    db.upsertUser(user);
    res.json({ coreIndicators: user.coreIndicators });
  });

  router.put('/users/:id/location', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const enabled = req.body?.enabled !== false;
    if (enabled) {
      const lat = Number(req.body?.latitude);
      const lng = Number(req.body?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return res.status(400).json({ message: 'Koordinatalar noto‘g‘ri' });
      }
      user.latitude = lat;
      user.longitude = lng;
      user.locationUpdatedAt = nowIso();
      user.locationSharingEnabled = true;
    } else {
      user.locationSharingEnabled = false;
    }
    user.updatedAt = nowIso();
    db.upsertUser(user);
    res.json({ locationSharingEnabled: user.locationSharingEnabled, locationUpdatedAt: user.locationUpdatedAt });
  });

  router.delete('/users/:id/location', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    user.latitude = null;
    user.longitude = null;
    user.locationUpdatedAt = null;
    user.locationSharingEnabled = false;
    user.updatedAt = nowIso();
    db.upsertUser(user);
    res.json({ locationSharingEnabled: false });
  });

  router.get('/users/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = isStaff(auth?.role);
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    const isSelf = auth?.userId === user.id;
    res.json(
      sanitizeUser(user, {
        includePrivate: staff || isSelf,
        includePersonal: isSelf || auth?.role === 'super_admin',
        includeCore: auth?.role === 'super_admin',
      }),
    );
  });

  router.patch('/users/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    const staff = isStaff(auth.role);
    if (auth.userId !== user.id && !staff) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const allowed = staff ? ALLOWED_STAFF_USER_FIELDS : ALLOWED_SELF_PROFILE_FIELDS;
    const updates = pickFields((req.body || {}) as Record<string, unknown>, allowed);
    if (auth.role === 'super_admin' && typeof req.body?.role === 'string') {
      const candidateRole = req.body.role as UserRole;
      if (['worker', 'employer', 'admin', 'super_admin'].includes(candidateRole)) {
        updates.role = candidateRole;
      }
    }
    Object.assign(user, updates, { updatedAt: nowIso() });
    db.upsertUser(user);
    res.json(
      sanitizeUser(user, {
        includePrivate: true,
        includePersonal: auth.userId === user.id || auth.role === 'super_admin',
        includeCore: auth.role === 'super_admin',
      }),
    );
  });

  // --- EMPLOYER WORKERS ---
  const SPECIALTY_KEYWORDS: Record<string, string[]> = {
    childcare: ['childcare', 'nanny', 'babysitting', 'enaga', 'bolalarga', 'yosh bolalarga enagalik'],
    house_cleaning: ['house_cleaning', 'cleaner', 'uy tozalash', 'tozalash'],
    hotel_cleaning: ['hotel_cleaning', 'hospitality', 'mehmonxona', 'mehmonxona tozalash', 'hotel'],
    elder_care: ['elder_care', 'caregiver', 'keksa', 'qariya', 'keksalarga qarash'],
    postpartum_care: ['postpartum_care', 'midwifery', "tug'ruq", 'tugʻruq', 'tugruq', 'postpartum'],
  };

  const workerMatchesSkill = (u: StoredUser, skill: string): boolean => {
    const q = skill.trim().toLowerCase();
    if (!q) return true;
    const tokens = SPECIALTY_KEYWORDS[q] || [q];
    const haystack = [u.profession || '', ...(u.skills || []), u.bio || '', u.professionalSummary || '']
      .join(' ')
      .toLowerCase();
    return tokens.some((tok) => haystack.includes(tok));
  };

  router.get('/employer/workers', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const search = String(req.query.search || '').trim().toLowerCase();
    const region = req.query.region ? String(req.query.region) : undefined;
    const district = req.query.district ? String(req.query.district) : undefined;
    const skill = req.query.skill ? String(req.query.skill) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const list = db.listUsers().filter((u) => {
      if (u.role !== 'worker' || u.isBlocked) return false;
      if (region && u.region !== region) return false;
      if (district && u.district !== district) return false;
      if (skill && !workerMatchesSkill(u, skill)) return false;
      if (search && !u.fullName.toLowerCase().includes(search)) return false;
      return true;
    });
    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: slice.map((u) => ({
        uid: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        phoneNumber: u.phoneNumber,
        region: u.region,
        district: u.district,
        profession: u.profession,
        skills: u.skills,
        availability: u.availability,
        experienceLevel: u.experienceLevel,
        isVerified: u.isVerified,
        rating: u.rating,
        lookingForWork: u.lookingForWork,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  router.get('/employer/workers/nearby', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(300, Math.max(1, Number(req.query.radius_km || 30)));
    const skill = req.query.skill ? String(req.query.skill) : undefined;
    const region = req.query.region ? String(req.query.region) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const jobId = req.query.jobId ? String(req.query.jobId) : undefined;

    // If employer requested for a specific job or has active jobs
    const targetJob = jobId
      ? db.getJob(jobId)
      : db.listJobs().find((j) => j.employerId === auth.userId && (j.status === 'open' || j.status === 'active'));

    const empCoords: [number, number] | null =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? [lat, lng]
        : (() => {
            const empUser = db.getUserById(auth.userId);
            return empUser ? getCoordsForUser(empUser) : null;
          })();

    const list = db
      .listUsers()
      .filter((u) => {
        if (u.role !== 'worker' || u.isBlocked) return false;
        if (region && u.region !== region) return false;
        if (skill && !workerMatchesSkill(u, skill)) return false;
        return true;
      })
      .map((u) => {
        const [wLat, wLng] = getCoordsForUser(u);
        const distanceKm =
          empCoords != null
            ? haversineKm(empCoords[0], empCoords[1], wLat, wLng)
            : 1.5;
        const matchScore = calculateMatchScore(u, targetJob, empCoords);
        return {
          u,
          distanceKm,
          matchScore,
          latitude: wLat,
          longitude: wLng,
        };
      })
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm);

    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: slice.map(({ u, distanceKm, matchScore, latitude, longitude }) => ({
        uid: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        phoneNumber: u.phoneNumber,
        region: u.region,
        district: u.district,
        profession: u.profession || (u.skills[0] || 'Mutaxassis'),
        skills: u.skills,
        availability: u.availability || 'available',
        experienceLevel: u.experienceLevel,
        isVerified: u.isVerified,
        rating: u.rating,
        lookingForWork: u.lookingForWork,
        distanceKm: Math.round(distanceKm * 10) / 10,
        distanceLabel: distanceKm < 1 ? `${Math.max(100, Math.round(distanceKm * 1000))} m` : `~${Math.max(1, Math.round(distanceKm))} km`,
        matchScore,
        latitude,
        longitude,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      radiusKm,
    });
  });

  router.post('/employer/invite-worker', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'employer' && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Faqat ish beruvchilar ishchini taklif qila oladi' });
    }
    const workerId = String(req.body?.workerId || '');
    const worker = db.getUserById(workerId);
    if (!worker || worker.role !== 'worker') {
      return res.status(404).json({ message: 'Ishchi topilmadi' });
    }

    let jobId = req.body?.jobId ? String(req.body.jobId) : '';
    let job = jobId ? db.getJob(jobId) : null;

    if (!job) {
      // Create quick job for this invite if none specified
      const title = String(req.body?.title || `${worker.profession || 'Xizmat'} bo‘yicha taklif`).slice(0, 200);
      const price = Number(req.body?.price || req.body?.salary || 200000);
      const employer = db.getUserById(auth.userId);
      jobId = `job_${randomUUID().slice(0, 8)}`;
      job = {
        id: jobId,
        title,
        description: req.body?.message ? String(req.body.message) : `Ishchi ${worker.fullName} uchun to‘g‘ridan-to‘g‘ri taklif`,
        employerId: auth.userId,
        employerName: employer?.companyName || employer?.fullName || null,
        category: worker.profession || worker.skills[0] || 'Boshqa',
        region: employer?.region || 'Samarqand viloyati',
        district: employer?.district || 'samarkand_city',
        neighborhood: employer?.neighborhood || null,
        salary: price,
        price,
        salaryType: 'kunlik',
        workType: 'one_time',
        scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
        status: 'open',
        isPromoted: false,
        requirements: worker.skills.slice(0, 3),
        images: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.upsertJob(job);
    }

    const appId = `app_${randomUUID().slice(0, 8)}`;
    const application: StoredApplication = {
      id: appId,
      jobId: job.id,
      workerId: worker.id,
      employerId: auth.userId,
      workerName: worker.fullName,
      jobTitle: job.title,
      message: String(req.body?.message || 'Sizga yangi ish taklifi yuborildi').slice(0, 3000),
      coverLetter: null,
      status: 'offer_sent',
      acceptedAt: null,
      completedAt: null,
      reviewed: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertApplication(application);

    // Send automatic message into chat
    const inviteText = `📋 Hurmatli ${worker.fullName}, sizga "${job.title}" ishi bo‘yicha yangi taklif yuborildi. Ish haqi: ${(job.price || 0).toLocaleString()} so‘m.`;
    const sysMsg: StoredMessage = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      senderId: auth.userId,
      receiverId: worker.id,
      content: inviteText,
      text: inviteText,
      message: inviteText,
      read: false,
      delivered: true,
      status: 'delivered',
      jobId: job.id,
      contractId: null,
      createdAt: nowIso(),
    };
    db.upsertMessage(sysMsg);

    // Send notification
    db.upsertNotification({
      id: `notif_${randomUUID().slice(0, 8)}`,
      userId: worker.id,
      title: 'Yangi ish taklifi!',
      message: inviteText,
      type: 'application',
      read: false,
      link: '/chat',
      createdAt: nowIso(),
    });

    res.status(201).json({ success: true, application, job });
  });

  router.get('/worker/recommended-jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const worker = db.getUserById(auth.userId);
    const workerCoords: [number, number] = worker ? getCoordsForUser(worker) : [39.6542, 66.9597];

    const jobs = db
      .listJobs()
      .filter((j) => j.status === 'open' || j.status === 'active')
      .map((j) => {
        const emp = db.getUserById(j.employerId);
        const empCoords: [number, number] = emp ? getCoordsForUser(emp) : [39.6542, 66.9597];
        const distanceKm = haversineKm(workerCoords[0], workerCoords[1], empCoords[0], empCoords[1]);
        const matchScore = worker ? calculateMatchScore(worker, j, empCoords) : 85;
        return {
          ...j,
          distanceKm: Math.round(distanceKm * 10) / 10,
          distanceLabel: distanceKm < 1 ? `${Math.max(100, Math.round(distanceKm * 1000))} m` : `~${Math.max(1, Math.round(distanceKm))} km`,
          matchScore,
          latitude: empCoords[0],
          longitude: empCoords[1],
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm)
      .slice(0, 10);

    res.json({ data: jobs });
  });

  router.get('/employer/recommended-workers', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const employer = db.getUserById(auth.userId);
    const empCoords: [number, number] = employer ? getCoordsForUser(employer) : [39.6542, 66.9597];
    const topJob = db.listJobs().find((j) => j.employerId === auth.userId && (j.status === 'open' || j.status === 'active'));

    const workers = db
      .listUsers()
      .filter((u) => u.role === 'worker' && !u.isBlocked)
      .map((u) => {
        const [wLat, wLng] = getCoordsForUser(u);
        const distanceKm = haversineKm(empCoords[0], empCoords[1], wLat, wLng);
        const matchScore = calculateMatchScore(u, topJob, empCoords);
        return {
          uid: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: u.fullName,
          photoUrl: u.photoUrl,
          phoneNumber: u.phoneNumber,
          region: u.region,
          district: u.district,
          profession: u.profession || (u.skills[0] || 'Mutaxassis'),
          skills: u.skills,
          availability: u.availability || 'available',
          experienceLevel: u.experienceLevel,
          isVerified: u.isVerified,
          rating: u.rating,
          lookingForWork: u.lookingForWork,
          distanceKm: Math.round(distanceKm * 10) / 10,
          distanceLabel: distanceKm < 1 ? `${Math.max(100, Math.round(distanceKm * 1000))} m` : `~${Math.max(1, Math.round(distanceKm))} km`,
          matchScore,
          latitude: wLat,
          longitude: wLng,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm)
      .slice(0, 10);

    res.json({ data: workers });
  });

  router.get('/super-admin/live-map-data', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) {
      return res.status(403).json({ message: 'Faqat administratorlar uchun' });
    }

    const workers = db
      .listUsers()
      .filter((u) => u.role === 'worker' && !u.isBlocked)
      .map((u) => {
        const [lat, lng] = getCoordsForUser(u);
        return {
          uid: u.id,
          fullName: u.fullName,
          role: 'worker' as const,
          profession: u.profession || (u.skills[0] || 'Mutaxassis'),
          skills: u.skills,
          photoUrl: u.photoUrl,
          phoneNumber: u.phoneNumber,
          availability: u.availability || 'available',
          rating: u.rating,
          completedJobs: u.completedJobs,
          isVerified: u.isVerified,
          district: u.district,
          region: u.region,
          latitude: lat,
          longitude: lng,
        };
      });

    const employers = db
      .listUsers()
      .filter((u) => u.role === 'employer' && !u.isBlocked)
      .map((u) => {
        const [lat, lng] = getCoordsForUser(u);
        return {
          uid: u.id,
          fullName: u.companyName || u.fullName,
          companyName: u.companyName,
          role: 'employer' as const,
          photoUrl: u.photoUrl,
          phoneNumber: u.phoneNumber,
          rating: u.rating,
          isVerified: u.isVerified,
          district: u.district,
          region: u.region,
          latitude: lat,
          longitude: lng,
        };
      });

    const activeJobs = db
      .listJobs()
      .filter((j) => j.status === 'open' || j.status === 'active')
      .map((j) => {
        const emp = db.getUserById(j.employerId);
        const [lat, lng] = emp ? getCoordsForUser(emp) : [39.6542, 66.9597];
        return {
          id: j.id,
          title: j.title,
          employerId: j.employerId,
          employerName: j.employerName || emp?.fullName,
          category: j.category,
          price: j.price || j.salary,
          workType: j.workType,
          district: j.district,
          region: j.region,
          status: j.status,
          latitude: lat,
          longitude: lng,
        };
      });

    const disputes = db
      .listDisputes()
      .filter((d) => d.status === 'pending')
      .map((d) => {
        const opener = db.getUserById(d.openedById);
        const [lat, lng] = opener ? getCoordsForUser(opener) : [39.6542, 66.9597];
        return {
          id: d.id,
          contractId: d.contractId,
          openedById: d.openedById,
          openedByName: opener?.fullName,
          reason: d.reason,
          status: d.status,
          latitude: lat,
          longitude: lng,
        };
      });

    res.json({ workers, employers, activeJobs, disputes });
  });

  // --- JOBS ---
  router.get('/jobs', (req, res) => {
    const employerId = req.query.employerId ? String(req.query.employerId) : undefined;
    const region = req.query.region ? String(req.query.region) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = db.listJobs().filter((j) => {
      if (employerId && j.employerId !== employerId) return false;
      if (region && j.region !== region) return false;
      if (status && j.status !== status) return false;
      return true;
    });
    res.json(rows);
  });

  router.get('/jobs/nearby', (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(300, Math.max(1, Number(req.query.radius_km || 30)));
    const category = req.query.category ? String(req.query.category).trim().toLowerCase() : '';
    const region = req.query.region ? String(req.query.region).trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    // Try optional auth user
    const authWorker = getAuth(req);
    const workerUser = authWorker && authWorker.role === 'worker' ? db.getUserById(authWorker.userId) : null;

    const list = db
      .listJobs()
      .filter((j) => {
        if (j.status !== 'active' && j.status !== 'open') return false;
        if (region && j.region && j.region !== region) return false;
        if (category && !(j.category || '').toLowerCase().includes(category) && !j.title.toLowerCase().includes(category)) {
          return false;
        }
        return true;
      })
      .map((j) => {
        const emp = db.getUserById(j.employerId);
        const [empLat, empLng] = emp ? getCoordsForUser(emp) : [39.6542, 66.9597];
        const d =
          Number.isFinite(lat) && Number.isFinite(lng)
            ? haversineKm(lat, lng, empLat, empLng)
            : 2;
        const matchScore = workerUser
          ? calculateMatchScore(workerUser, j, [empLat, empLng])
          : 88;
        return {
          job: j,
          distanceKm: d,
          matchScore,
          latitude: empLat,
          longitude: empLng,
        };
      })
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => b.matchScore - a.matchScore || a.distanceKm - b.distanceKm);

    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: slice.map(({ job, distanceKm, matchScore, latitude, longitude }) => ({
        ...job,
        distanceKm: Math.round(distanceKm * 10) / 10,
        distanceLabel: distanceKm < 1 ? `${Math.max(100, Math.round(distanceKm * 1000))} m` : `~${Math.max(1, Math.round(distanceKm))} km`,
        matchScore,
        latitude,
        longitude,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      radiusKm,
    });
  });

  router.get('/jobs/:id', (req, res) => {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'E‘lon topilmadi' });
    res.json(job);
  });

  router.post('/jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'employer' && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Faqat ish beruvchilar e‘lon joylashtira oladi' });
    }
    const id = `job_${randomUUID().slice(0, 8)}`;
    const employer = db.getUserById(auth.userId);
    const job: StoredJob = {
      id,
      title: String(req.body?.title || 'Yangi e‘lon').slice(0, 200),
      description: req.body?.description ? String(req.body.description).slice(0, 5000) : null,
      employerId: auth.userId,
      employerName: employer?.companyName || employer?.fullName || null,
      category: req.body?.category ? String(req.body.category) : null,
      region: req.body?.region ? String(req.body.region) : 'Samarqand viloyati',
      district: req.body?.district ? String(req.body.district) : null,
      neighborhood: req.body?.neighborhood ? String(req.body.neighborhood) : null,
      salary: req.body?.salary != null ? Number(req.body.salary) : null,
      price: req.body?.price != null ? Number(req.body.price) : null,
      salaryType: req.body?.salaryType ? String(req.body.salaryType) : null,
      workType: req.body?.workType ? String(req.body.workType) : null,
      scheduledAt: req.body?.scheduledAt ? String(req.body.scheduledAt) : null,
      status: (req.body?.status || 'active') as StoredJob['status'],
      isPromoted: isStaff(auth.role) ? Boolean(req.body?.isPromoted) : false,
      requirements: Array.isArray(req.body?.requirements) ? req.body.requirements.map(String) : [],
      images: Array.isArray(req.body?.images) ? req.body.images.map(String) : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertJob(job);
    res.status(201).json(job);
  });

  router.patch('/jobs/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'E‘lon topilmadi' });
    if (job.employerId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Bu e‘lonni tahrirlashga ruxsatingiz yo‘q' });
    }
    const updates = pickFields((req.body || {}) as Record<string, unknown>, ALLOWED_JOB_UPDATE_FIELDS);
    if (isStaff(auth.role) && req.body?.isPromoted !== undefined) {
      updates.isPromoted = Boolean(req.body.isPromoted);
    }
    Object.assign(job, updates, { updatedAt: nowIso() });
    db.upsertJob(job);
    res.json(job);
  });

  // --- SERVICE POSTS ---
  router.get('/service-posts', (req, res) => {
    const workerId = req.query.workerId ? String(req.query.workerId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = db.listServicePosts().filter((p) => {
      if (workerId && p.workerId !== workerId) return false;
      if (status && p.status !== status) return false;
      return true;
    });
    res.json(rows);
  });

  router.post('/service-posts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = `sp_${randomUUID().slice(0, 8)}`;
    const worker = db.getUserById(auth.userId);
    const post: StoredServicePost = {
      id,
      workerId: auth.userId,
      workerName: worker?.fullName || null,
      title: String(req.body?.title || 'Xizmat').slice(0, 200),
      description: req.body?.description ? String(req.body.description).slice(0, 5000) : null,
      category: req.body?.category ? String(req.body.category) : null,
      price: req.body?.price != null ? Number(req.body.price) : null,
      expectedPrice: req.body?.expectedPrice != null ? Number(req.body.expectedPrice) : null,
      priceType: req.body?.priceType ? String(req.body.priceType) : null,
      region: req.body?.region ? String(req.body.region) : 'Samarqand viloyati',
      district: req.body?.district ? String(req.body.district) : null,
      images: Array.isArray(req.body?.images) ? req.body.images.map(String) : [],
      isActive: true,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertServicePost(post);
    res.status(201).json(post);
  });

  router.patch('/service-posts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const post = db.getServicePost(req.params.id);
    if (!post) return res.status(404).json({ message: 'Topilmadi' });
    if (post.workerId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const updates = pickFields((req.body || {}) as Record<string, unknown>, ALLOWED_SERVICE_POST_FIELDS);
    Object.assign(post, updates, { updatedAt: nowIso() });
    db.upsertServicePost(post);
    res.json(post);
  });

  // --- APPLICATIONS ---
  router.get('/applications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = db.listApplications().filter((a) => {
      if (!isStaff(auth.role) && a.workerId !== auth.userId && a.employerId !== auth.userId) return false;
      if (req.query.workerId && a.workerId !== String(req.query.workerId)) return false;
      if (req.query.employerId && a.employerId !== String(req.query.employerId)) return false;
      if (req.query.jobId && a.jobId !== String(req.query.jobId)) return false;
      if (req.query.status && a.status !== String(req.query.status)) return false;
      return true;
    });
    res.json(rows);
  });

  router.get('/applications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = db.getApplication(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    if (!isStaff(auth.role) && app.workerId !== auth.userId && app.employerId !== auth.userId) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    res.json(app);
  });

  router.post('/applications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ message: 'Ish e‘loni topilmadi' });
    const id = `app_${randomUUID().slice(0, 8)}`;
    const app: StoredApplication = {
      id,
      jobId,
      workerId: auth.userId,
      employerId: job.employerId,
      workerName: db.getUserById(auth.userId)?.fullName || null,
      jobTitle: job.title,
      message: String(req.body?.message || req.body?.coverLetter || '').slice(0, 3000),
      coverLetter: req.body?.coverLetter ? String(req.body.coverLetter).slice(0, 3000) : null,
      status: 'pending',
      acceptedAt: null,
      completedAt: null,
      reviewed: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertApplication(app);
    res.status(201).json(app);
  });

  router.patch('/applications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = db.getApplication(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    const isParticipant = app.workerId === auth.userId || app.employerId === auth.userId;
    if (!isParticipant && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const nextStatus = req.body?.status ? String(req.body.status) : undefined;
    const ALLOWED_STATUSES = [
      'pending',
      'accepted',
      'rejected',
      'withdrawn',
      'completed',
      'on_the_way',
      'started',
      'cancelled',
      'disputed',
      'matching',
      'offer_sent',
    ];
    if (nextStatus) {
      if (!ALLOWED_STATUSES.includes(nextStatus)) {
        return res.status(400).json({ message: 'Noto‘g‘ri status' });
      }
      if (nextStatus === 'withdrawn' && app.workerId !== auth.userId && !isStaff(auth.role)) {
        return res.status(403).json({ message: 'Faqat ariza muallifi bekor qila oladi' });
      }
      if (nextStatus === 'accepted' || nextStatus === 'rejected') {
        const canWorkerRespondOffer = app.status === 'offer_sent' && app.workerId === auth.userId;
        const canEmployerDecide = app.employerId === auth.userId;
        if (!canWorkerRespondOffer && !canEmployerDecide && !isStaff(auth.role)) {
          return res.status(403).json({ message: 'Qabul qilish yoki rad etishga ruxsat yo‘q' });
        }
      }
      app.status = nextStatus as StoredApplication['status'];

      // Automated system message in chat
      const statusMessages: Record<string, string> = {
        accepted: '✅ Ish qabul qilindi. Kelishilgan vaqtda ishni boshlash mumkin.',
        on_the_way: '🚗 Ishchi manzilga yo‘lga chiqdi.',
        started: '⚡ Ish jarayoni boshlandi.',
        completed: '🎉 Ish muvaffaqiyatli yakunlandi. Iltimos, o‘zaro baho bering!',
        cancelled: '❌ Buyurtma bekor qilindi.',
        disputed: '⚠️ Nizo holati ochildi. Administrator tez orada ko‘rib chiqadi.',
      };

      if (statusMessages[nextStatus]) {
        const otherUserId = auth.userId === app.workerId ? app.employerId : app.workerId;
        const note = statusMessages[nextStatus];
        const sysMsg: StoredMessage = {
          id: `msg_${randomUUID().slice(0, 8)}`,
          senderId: auth.userId,
          receiverId: otherUserId,
          content: note,
          text: note,
          message: note,
          read: false,
          delivered: true,
          status: 'delivered',
          jobId: app.jobId,
          contractId: null,
          createdAt: nowIso(),
        };
        db.upsertMessage(sysMsg);

        db.upsertNotification({
          id: `notif_${randomUUID().slice(0, 8)}`,
          userId: otherUserId,
          title: 'Buyurtma holati yangilandi',
          message: note,
          type: 'application',
          read: false,
          link: '/chat',
          createdAt: nowIso(),
        });
      }
    }
    if (app.status === 'accepted' && !app.acceptedAt) app.acceptedAt = nowIso();
    if (app.status === 'completed' && !app.completedAt) {
      app.completedAt = nowIso();
      const worker = db.getUserById(app.workerId);
      if (worker) {
        worker.completedJobs += 1;
        db.upsertUser(worker);
      }
    }
    if (req.body?.reviewed !== undefined && (app.employerId === auth.userId || app.workerId === auth.userId || isStaff(auth.role))) {
      app.reviewed = Boolean(req.body.reviewed);
    }
    app.updatedAt = nowIso();
    db.upsertApplication(app);
    res.json(app);
  });

  router.post('/applications/:id/complete', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = db.getApplication(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    const isParticipant = app.employerId === auth.userId || app.workerId === auth.userId;
    if (!isParticipant && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Faqat buyurtma ishtirokchilari ishni yakunlay oladi' });
    }
    const alreadyCompleted = app.status === 'completed';
    app.status = 'completed';
    if (!app.completedAt) app.completedAt = nowIso();
    app.updatedAt = nowIso();
    db.upsertApplication(app);

    if (!alreadyCompleted) {
      const worker = db.getUserById(app.workerId);
      if (worker) {
        worker.completedJobs += 1;
        db.upsertUser(worker);
      }
      const otherUserId = auth.userId === app.workerId ? app.employerId : app.workerId;
      const doneMsg = '🎉 Ish muvaffaqiyatli yakunlandi. Iltimos, o‘zaro baho bering!';
      db.upsertMessage({
        id: `msg_${randomUUID().slice(0, 8)}`,
        senderId: auth.userId,
        receiverId: otherUserId,
        content: doneMsg,
        text: doneMsg,
        message: doneMsg,
        read: false,
        delivered: true,
        status: 'delivered',
        jobId: app.jobId,
        contractId: null,
        createdAt: nowIso(),
      });
      db.upsertNotification({
        id: `notif_${randomUUID().slice(0, 8)}`,
        userId: otherUserId,
        title: 'Ish yakunlandi — baho bering',
        message: `"${app.jobTitle || 'Buyurtma'}" yakunlandi. Hamkorlik sifatini baholang.`,
        type: 'application',
        read: false,
        link: auth.userId === app.workerId ? `/employer/contracts?review=${app.id}` : '/my-work',
        createdAt: nowIso(),
      });
    }
    res.json(app);
  });

  // --- CONTRACTS ---
  router.get('/contracts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = db.listContracts().filter((c) => {
      if (!isStaff(auth.role) && c.workerId !== auth.userId && c.employerId !== auth.userId) return false;
      if (req.query.status && c.status !== String(req.query.status)) return false;
      return true;
    });
    res.json(rows);
  });

  router.get('/contracts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const c = db.getContract(req.params.id);
    if (!c) return res.status(404).json({ message: 'Topilmadi' });
    if (!isStaff(auth.role) && c.workerId !== auth.userId && c.employerId !== auth.userId) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    res.json(c);
  });

  router.post('/contracts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const workerId = String(req.body?.workerId || '');
    const employerId = isStaff(auth.role) && req.body?.employerId ? String(req.body.employerId) : auth.userId;
    const worker = db.getUserById(workerId);
    const employer = db.getUserById(employerId);
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: req.body?.jobId ? String(req.body.jobId) : null,
      workerId,
      employerId,
      workerName: worker?.fullName || (req.body?.workerName ? String(req.body.workerName) : null),
      employerName: employer?.companyName || employer?.fullName || null,
      jobTitle: req.body?.jobTitle ? String(req.body.jobTitle).slice(0, 200) : null,
      salary: req.body?.salary != null ? Number(req.body.salary) : null,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      startDate: req.body?.startDate ? String(req.body.startDate) : null,
      endDate: req.body?.endDate ? String(req.body.endDate) : null,
      status: 'draft',
      terms: req.body?.terms ? String(req.body.terms).slice(0, 5000) : null,
      signedByWorker: false,
      signedByEmployer: employerId === auth.userId,
      workerSigned: false,
      employerSigned: employerId === auth.userId,
      adminApproved: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertContract(c);
    res.status(201).json(c);
  });

  router.post('/contracts/from-application/:applicationId', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = db.getApplication(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Ariza topilmadi' });
    if (app.employerId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: app.jobId,
      workerId: app.workerId,
      employerId: app.employerId,
      workerName: app.workerName,
      employerName: db.getUserById(app.employerId)?.fullName || null,
      jobTitle: app.jobTitle,
      salary: null,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      startDate: req.body?.startDate ? String(req.body.startDate) : null,
      endDate: req.body?.endDate ? String(req.body.endDate) : null,
      status: 'draft',
      terms: req.body?.terms ? String(req.body.terms).slice(0, 5000) : null,
      signedByWorker: false,
      signedByEmployer: true,
      workerSigned: false,
      employerSigned: true,
      adminApproved: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertContract(c);
    res.status(201).json(c);
  });

  router.post('/contracts/to-worker/:workerId', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const worker = db.getUserById(req.params.workerId);
    if (!worker) return res.status(404).json({ message: 'Ishchi topilmadi' });
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: null,
      workerId: worker.id,
      employerId: auth.userId,
      workerName: worker.fullName,
      employerName: db.getUserById(auth.userId)?.fullName || null,
      jobTitle: worker.profession || 'Xizmat shartnomasi',
      salary: null,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      startDate: null,
      endDate: null,
      status: 'draft',
      terms: null,
      signedByWorker: false,
      signedByEmployer: true,
      workerSigned: false,
      employerSigned: true,
      adminApproved: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertContract(c);
    res.status(201).json(c);
  });

  router.patch('/contracts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const c = db.getContract(req.params.id);
    if (!c) return res.status(404).json({ message: 'Topilmadi' });
    const isWorker = c.workerId === auth.userId;
    const isEmployer = c.employerId === auth.userId;
    if (!isWorker && !isEmployer && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    if ((isWorker || isStaff(auth.role)) && (req.body?.signedByWorker !== undefined || req.body?.workerSigned !== undefined)) {
      c.signedByWorker = Boolean(req.body?.signedByWorker ?? req.body?.workerSigned);
      c.workerSigned = c.signedByWorker;
    }
    if ((isEmployer || isStaff(auth.role)) && (req.body?.signedByEmployer !== undefined || req.body?.employerSigned !== undefined)) {
      c.signedByEmployer = Boolean(req.body?.signedByEmployer ?? req.body?.employerSigned);
      c.employerSigned = c.signedByEmployer;
    }
    if (isStaff(auth.role) && req.body?.adminApproved !== undefined) {
      c.adminApproved = Boolean(req.body.adminApproved);
    }
    if ((isEmployer || isStaff(auth.role)) && req.body?.terms !== undefined) {
      c.terms = String(req.body.terms).slice(0, 5000);
    }
    if (req.body?.status && ['draft', 'active', 'completed', 'cancelled', 'disputed', 'signed'].includes(String(req.body.status))) {
      c.status = String(req.body.status);
    } else if (c.signedByWorker && c.signedByEmployer && c.status === 'draft') {
      c.status = 'active';
    }
    c.updatedAt = nowIso();
    db.upsertContract(c);

    // Sync signed flag with Yandex order if linked
    const bothSigned = Boolean(c.signedByWorker && c.signedByEmployer);
    if (bothSigned && c.jobId) {
      db.sqlite
        .prepare('UPDATE ish_buyurtmasi SET contract_signed = 1, updated_at = ? WHERE id = ? OR contract_id = ?')
        .run(nowIso(), c.jobId, c.id);
    } else if (bothSigned) {
      db.sqlite
        .prepare('UPDATE ish_buyurtmasi SET contract_signed = 1, updated_at = ? WHERE contract_id = ?')
        .run(nowIso(), c.id);
    }
    realtimeHub.emitToUsers([c.workerId, c.employerId], 'contract_updated', {
      contractId: c.id,
      orderId: c.jobId || null,
      signedByWorker: c.signedByWorker,
      signedByEmployer: c.signedByEmployer,
      bothSigned,
      status: c.status,
    });

    res.json(c);
  });

  // --- REVIEWS ---
  router.get('/reviews', (req, res) => {
    const id = String(req.query.revieweeId || req.query.workerId || '');
    if (!id) return res.json([]);
    res.json(db.listReviewsFor(id));
  });

  router.post('/reviews', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const applicationId = req.body?.applicationId ? String(req.body.applicationId) : null;
    const contractId = req.body?.contractId ? String(req.body.contractId) : null;
    let revieweeId = String(req.body?.revieweeId || '');

    let relatedApp: StoredApplication | null = null;
    if (applicationId) {
      relatedApp = db.getApplication(applicationId);
      if (!relatedApp) return res.status(404).json({ message: 'Buyurtma topilmadi' });
      const isAppParticipant =
        relatedApp.employerId === auth.userId || relatedApp.workerId === auth.userId;
      if (!isAppParticipant && !isStaff(auth.role)) {
        return res.status(403).json({ message: 'Bu buyurtmaga baho berishga ruxsat yo‘q' });
      }
      if (!revieweeId) {
        revieweeId =
          auth.userId === relatedApp.employerId ? relatedApp.workerId : relatedApp.employerId;
      }
    } else if (contractId && !revieweeId) {
      const contract = db.getContract(contractId);
      if (!contract) return res.status(404).json({ message: 'Shartnoma topilmadi' });
      if (contract.employerId !== auth.userId && contract.workerId !== auth.userId && !isStaff(auth.role)) {
        return res.status(403).json({ message: 'Ruxsat yo‘q' });
      }
      revieweeId = auth.userId === contract.employerId ? contract.workerId : contract.employerId;
    }

    if (!revieweeId || revieweeId === auth.userId) {
      return res.status(400).json({ message: 'O‘zingizga baho bera olmaysiz' });
    }
    const target = db.getUserById(revieweeId);
    if (!target) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    if (applicationId) {
      const duplicate = db
        .listReviewsFor(revieweeId)
        .some((r) => r.applicationId === applicationId && r.reviewerId === auth.userId);
      if (duplicate) {
        return res.status(409).json({ message: 'Siz allaqachon bu buyurtma uchun baho bergansiz' });
      }
    }

    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating || 5))));
    const review: StoredReview = {
      id: `rev_${randomUUID().slice(0, 8)}`,
      reviewerId: auth.userId,
      revieweeId,
      reviewerName: db.getUserById(auth.userId)?.fullName || null,
      rating,
      comment: req.body?.comment ? String(req.body.comment).slice(0, 2000) : null,
      contractId,
      applicationId,
      createdAt: nowIso(),
    };
    db.insertReview(review);

    const nextCount = target.reviewCount + 1;
    target.rating = Math.round(((target.rating * target.reviewCount + rating) / nextCount) * 10) / 10;
    target.reviewCount = nextCount;
    db.upsertUser(target);

    if (relatedApp) {
      if (auth.userId === relatedApp.employerId) {
        relatedApp.employerReviewed = true;
        relatedApp.reviewed = true;
      } else if (auth.userId === relatedApp.workerId) {
        relatedApp.workerReviewed = true;
      }
      relatedApp.updatedAt = nowIso();
      db.upsertApplication(relatedApp);
    }

    db.upsertNotification({
      id: `notif_${randomUUID().slice(0, 8)}`,
      userId: revieweeId,
      title: `Yangi baho: ${rating}/5 ★`,
      message: `${review.reviewerName || 'Hamkor'} sizga ${rating} yulduzli baho berdi.`,
      type: 'application',
      read: false,
      link: '/my-profile',
      createdAt: nowIso(),
    });

    res.status(201).json(review);
  });

  // --- SAVED JOBS ---
  router.get('/saved-jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const target = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    res.json(db.listSavedJobs(target).map((s) => ({ ...s, job: db.getJob(s.jobId) || undefined })));
  });

  router.post('/saved-jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    if (!db.getJob(jobId)) return res.status(404).json({ message: 'E‘lon topilmadi' });
    const row = db.addSavedJob({ id: `sj_${randomUUID().slice(0, 8)}`, userId: auth.userId, jobId, createdAt: nowIso() });
    res.status(201).json(row);
  });

  router.post('/saved-jobs/delete', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    db.removeSavedJob(auth.userId, jobId);
    res.json({ success: true });
  });

  // --- NOTIFICATIONS ---
  router.get('/notifications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const target = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    res.json(db.listNotifications(target));
  });

  router.post('/notifications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const targetUserId = isStaff(auth.role) && req.body?.userId ? String(req.body.userId) : auth.userId;
    const n: StoredNotification = {
      id: `notif_${randomUUID().slice(0, 8)}`,
      userId: targetUserId,
      title: String(req.body?.title || 'Bildirishnoma').slice(0, 200),
      message: String(req.body?.message || '').slice(0, 2000),
      type: String(req.body?.type || 'system'),
      read: false,
      link: req.body?.link ? String(req.body.link).slice(0, 500) : null,
      createdAt: nowIso(),
    };
    db.upsertNotification(n);
    res.status(201).json(n);
  });

  router.patch('/notifications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const n = db.getNotification(req.params.id);
    if (!n) return res.status(404).json({ message: 'Topilmadi' });
    if (n.userId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    if (req.body?.read !== undefined) n.read = Boolean(req.body.read);
    db.upsertNotification(n);
    res.json(n);
  });

  // --- CHAT ---
  router.get('/chat-messages/inbox', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const me = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    const peers = new Map<string, { peerId: string; lastMessage: string; lastAt: string; unreadCount: number }>();
    for (const m of [...db.listMessagesForUser(me)].reverse()) {
      const peerId = m.senderId === me ? m.receiverId : m.senderId;
      const prev = peers.get(peerId);
      if (!prev) {
        peers.set(peerId, {
          peerId,
          lastMessage: m.content,
          lastAt: m.createdAt,
          unreadCount: m.receiverId === me && !m.read ? 1 : 0,
        });
      } else if (m.receiverId === me && !m.read) {
        prev.unreadCount += 1;
      }
    }
    res.json(
      Array.from(peers.values()).map((p) => {
        const u = db.getUserById(p.peerId);
        return {
          ...p,
          peerName: u?.companyName || u?.fullName || 'Foydalanuvchi',
          peerRole: u?.role,
          peerPhotoUrl: u?.photoUrl,
        };
      }),
    );
  });

  router.get('/chat-messages', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const userA = String(req.query.userA || '');
    const userB = String(req.query.userB || '');
    if (!isStaff(auth.role) && auth.userId !== userA && auth.userId !== userB) {
      return res.status(403).json({ message: 'Faqat o‘z yozishmalaringizni ko‘rishingiz mumkin' });
    }
    res.json(db.listMessagesBetween(userA, userB));
  });

  router.post('/chat-messages', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const content = String(req.body?.content || req.body?.message || req.body?.text || '').trim().slice(0, 4000);
    const receiverId = String(req.body?.receiverId || '');
    if (!content) return res.status(400).json({ message: 'Xabar bo‘sh' });
    if (!receiverId || !db.getUserById(receiverId)) {
      return res.status(404).json({ message: 'Qabul qiluvchi topilmadi' });
    }
    const msg: StoredMessage = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      senderId: auth.userId,
      receiverId,
      content,
      text: content,
      message: content,
      read: false,
      delivered: true,
      status: 'sent',
      jobId: req.body?.jobId ? String(req.body.jobId) : null,
      contractId: req.body?.contractId ? String(req.body.contractId) : null,
      createdAt: nowIso(),
    };
    db.upsertMessage(msg);
    realtimeHub.emitToUser(receiverId, 'chat_message', msg);
    res.status(201).json(msg);
  });

  router.patch('/chat-messages/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const m = db.getMessage(req.params.id);
    if (!m) return res.status(404).json({ message: 'Topilmadi' });
    if (m.receiverId !== auth.userId && m.senderId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Ruxsat yo‘q' });
    }
    if (req.body?.read !== undefined && (m.receiverId === auth.userId || isStaff(auth.role))) {
      m.read = Boolean(req.body.read);
    }
    if (req.body?.status && typeof req.body.status === 'string') {
      m.status = req.body.status.slice(0, 32);
    }
    db.upsertMessage(m);
    res.json(m);
  });

  // --- DISPUTES ---
  router.get('/disputes', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const all = db.listDisputes();
    if (isStaff(auth.role)) return res.json(all);
    res.json(all.filter((d) => d.openedById === auth.userId));
  });

  router.post('/disputes', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const contractId = String(req.body?.contractId || '');
    const contract = db.getContract(contractId);
    if (contract && contract.workerId !== auth.userId && contract.employerId !== auth.userId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Bu shartnoma bo‘yicha nizo ochishga ruxsat yo‘q' });
    }
    const d: StoredDispute = {
      id: `dsp_${randomUUID().slice(0, 8)}`,
      contractId,
      openedById: auth.userId,
      reason: String(req.body?.reason || '').slice(0, 2000),
      status: 'pending',
      resolution: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.upsertDispute(d);
    res.status(201).json(d);
  });

  router.patch('/disputes/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Faqat administratorlar nizoni hal qila oladi' });
    const d = db.getDispute(req.params.id);
    if (!d) return res.status(404).json({ message: 'Topilmadi' });
    if (req.body?.status && ['pending', 'resolved', 'rejected'].includes(String(req.body.status))) {
      d.status = req.body.status;
    }
    if (req.body?.resolution !== undefined) d.resolution = String(req.body.resolution).slice(0, 2000);
    d.updatedAt = nowIso();
    db.upsertDispute(d);
    res.json(d);
  });

  // --- VERIFICATIONS ---
  router.get('/verification-requests', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rawStatus = req.query.status ? String(req.query.status).trim().toLowerCase() : '';
    const statusFilter = rawStatus === 'approved' ? 'verified' : rawStatus;
    const rows = db
      .listVerifications()
      .filter((v) => (auth.role === 'super_admin' ? true : v.userId === auth.userId))
      .filter((v) => (!statusFilter || statusFilter === 'all' ? true : v.status === statusFilter));
    res.json(
      rows.map((v) => {
        const u = db.getUserById(v.userId);
        return {
          ...v,
          user: u ? sanitizeUser(u, { includePrivate: auth.role === 'super_admin' }) : undefined,
        };
      }),
    );
  });

  router.get('/verification-requests/mine', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const mine = db.listVerifications().find((v) => v.userId === auth.userId) || null;
    res.json(mine);
  });

  router.post('/verification-requests', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = db.getUserById(auth.userId);
    const idPhotoUrl = String(req.body?.idPhotoUrl || req.body?.documentUrl || '').trim();
    const selfieUrl = String(req.body?.selfieUrl || '').trim();
    const addressProofUrl = String(req.body?.addressProofUrl || '').trim();

    if (!isOwnedPrivateUploadUrl(idPhotoUrl, auth.userId) || !isOwnedPrivateUploadUrl(selfieUrl, auth.userId)) {
      return res.status(400).json({ message: 'Hujjat va selfi rasmlarini yuklash majburiy' });
    }
    if (addressProofUrl && !isOwnedPrivateUploadUrl(addressProofUrl, auth.userId)) {
      return res.status(400).json({ message: 'Manzil hujjati havolasi noto‘g‘ri' });
    }

    const passportData = sanitizePassportData(req.body?.passportData);
    const existing = db.listVerifications().find((item) => item.userId === auth.userId);
    const now = nowIso();
    const v: StoredVerification = {
      id: existing ? existing.id : `ver_${randomUUID().slice(0, 8)}`,
      userId: auth.userId,
      userName: user?.fullName || null,
      accountType: user?.role === 'employer' ? 'employer' : 'worker',
      documentType: String(req.body?.documentType || 'passport').slice(0, 40),
      documentUrl: idPhotoUrl,
      idPhotoUrl,
      selfieUrl,
      ...(addressProofUrl ? { addressProofUrl } : {}),
      ...(passportData ? { passportData } : {}),
      ...(req.body?.documentChecks && typeof req.body.documentChecks === 'object'
        ? { documentChecks: req.body.documentChecks as Record<string, unknown> }
        : {}),
      status: 'pending',
      reviewedBy: null,
      reviewNote: null,
      adminNotes: existing?.adminNotes ?? null,
      rejectionReason: null,
      approvedAt: null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    db.upsertVerification(v);
    if (user) {
      user.verificationStatus = 'pending';
      db.upsertUser(user);
    }

    // Notify Super Admins so new verification requests surface immediately
    for (const admin of db.listUsers().filter((u) => u.role === 'super_admin')) {
      db.upsertNotification({
        id: `ntf_${randomUUID().slice(0, 8)}`,
        userId: admin.id,
        title: 'Yangi tasdiqlash so‘rovi',
        message: `${user?.fullName || 'Foydalanuvchi'} shaxsni tasdiqlash hujjatlarini yukladi.`,
        type: 'verification',
        read: false,
        link: '/super-admin/verification',
        createdAt: now,
      });
    }

    res.status(201).json(v);
  });

  router.patch('/verification-requests/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const v = db.getVerification(req.params.id);
    if (!v) return res.status(404).json({ message: 'Topilmadi' });

    // Allow the owner to resubmit documents ONLY when rejected or need_reupload
    if (auth.role !== 'super_admin') {
      if (v.userId !== auth.userId) {
        return res.status(403).json({ message: 'Faqat boshqaruv paneli orqali boshqa foydalanuvchi hujjatlarini ko‘rish mumkin' });
      }
      if (v.status !== 'rejected' && v.status !== 'need_reupload') {
        return res.status(400).json({ message: 'So‘rov hozir qayta yuborish holatida emas' });
      }
      const idPhotoUrl = String(req.body?.idPhotoUrl || req.body?.documentUrl || '').trim();
      const selfieUrl = String(req.body?.selfieUrl || '').trim();
      if (!isOwnedPrivateUploadUrl(idPhotoUrl, auth.userId) || !isOwnedPrivateUploadUrl(selfieUrl, auth.userId)) {
        return res.status(400).json({ message: 'Hujjat va selfi rasmlarini yuklash majburiy' });
      }
      v.documentUrl = idPhotoUrl;
      v.idPhotoUrl = idPhotoUrl;
      v.selfieUrl = selfieUrl;
      const passportData = sanitizePassportData(req.body?.passportData);
      if (passportData) v.passportData = passportData;
      v.status = 'pending';
      v.rejectionReason = null;
      v.reviewNote = null;
      v.updatedAt = nowIso();
      db.upsertVerification(v);
      const owner = db.getUserById(v.userId);
      if (owner) {
        owner.verificationStatus = 'pending';
        owner.isVerified = false;
        db.upsertUser(owner);
      }
      return res.json(v);
    }

    const actionToStatus: Record<string, string> = {
      approve: 'verified',
      approved: 'verified',
      verified: 'verified',
      reject: 'rejected',
      rejected: 'rejected',
      need_reupload: 'need_reupload',
      under_review: 'under_review',
      pending: 'pending',
    };
    const requested = String(req.body?.action || req.body?.status || '').trim().toLowerCase();
    if (requested && actionToStatus[requested]) {
      v.status = actionToStatus[requested];
    }
    if (req.body?.reviewNote !== undefined) v.reviewNote = String(req.body.reviewNote).slice(0, 1000);
    if (req.body?.adminNotes !== undefined) v.adminNotes = String(req.body.adminNotes).slice(0, 1000);
    if (req.body?.rejectionReason !== undefined) v.rejectionReason = String(req.body.rejectionReason).slice(0, 1000);
    v.reviewedBy = auth.userId;
    if (v.status === 'verified') {
      v.approvedAt = nowIso();
      v.rejectionReason = null;
    }
    v.updatedAt = nowIso();
    db.upsertVerification(v);

    const u = db.getUserById(v.userId);
    if (u) {
      u.verificationStatus = v.status;
      u.isVerified = v.status === 'verified';
      db.upsertUser(u);
    }

    if (v.status === 'verified' || v.status === 'rejected' || v.status === 'need_reupload') {
      db.upsertNotification({
        id: `ntf_${randomUUID().slice(0, 8)}`,
        userId: v.userId,
        title:
          v.status === 'verified'
            ? 'Shaxsingiz tasdiqlandi'
            : v.status === 'need_reupload'
              ? 'Hujjatlarni qayta yuklash kerak'
              : 'Tasdiqlash so‘rovi rad etildi',
        message:
          v.status === 'verified'
            ? 'Tabriklaymiz! Hisobingiz muvaffaqiyatli tasdiqlandi.'
            : v.rejectionReason || v.reviewNote || 'Hujjatlaringizni tekshirib qayta yuboring.',
        type: 'verification',
        read: false,
        link: '/verification',
        createdAt: nowIso(),
      });
    }

    realtimeHub.emitToUser(v.userId, 'verification_updated', {
      verificationId: v.id,
      status: v.status,
      isVerified: v.status === 'verified',
      rejectionReason: v.rejectionReason || null,
    });

    res.json(v);
  });

  router.post('/verification-requests/bulk', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const approve = req.body?.action === 'approve';
    const reason = String(req.body?.reason || req.body?.rejectionReason || '').trim().slice(0, 1000);
    let count = 0;
    for (const id of ids) {
      const v = db.getVerification(id);
      if (!v) continue;
      v.status = approve ? 'verified' : 'rejected';
      v.reviewedBy = auth.userId;
      v.updatedAt = nowIso();
      if (approve) {
        v.approvedAt = nowIso();
        v.rejectionReason = null;
      } else if (reason) {
        v.rejectionReason = reason;
        v.reviewNote = reason;
      }
      db.upsertVerification(v);
      const u = db.getUserById(v.userId);
      if (u) {
        u.verificationStatus = v.status;
        u.isVerified = approve;
        db.upsertUser(u);
      }
      count++;
    }
    res.json({ success: true, count });
  });

  // --- PAYMENTS / LOGS / SETTINGS ---
  router.get('/payments', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (isStaff(auth.role)) {
      const target = req.query.userId ? String(req.query.userId) : undefined;
      return res.json(db.listPayments(target));
    }
    res.json(db.listPayments(auth.userId));
  });

  router.post('/payments', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = `pay_${randomUUID().slice(0, 8)}`;
    const createdAt = nowIso();
    const item = {
      id,
      userId: auth.userId,
      amount: Number(req.body?.amount || 0),
      currency: String(req.body?.currency || 'UZS'),
      type: String(req.body?.type || 'service'),
      provider: String(req.body?.provider || 'manual'),
      status: 'pending',
      createdAt,
    };
    db.upsertPayment(id, auth.userId, item, createdAt);
    res.status(201).json(item);
  });

  router.patch('/payments/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Ruxsat yo‘q' });
    const item = db.getPayment(req.params.id);
    if (!item) return res.status(404).json({ message: 'Topilmadi' });
    const updated = { ...item, status: String(req.body?.status || item.status) };
    db.upsertPayment(req.params.id, String(item.userId || auth.userId), updated, String(item.createdAt || nowIso()));
    res.json(updated);
  });

  router.post('/violations', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.status(201).json({
      id: `vio_${randomUUID().slice(0, 8)}`,
      reporterId: auth.userId,
      reason: String(req.body?.reason || req.body?.message || '').slice(0, 1000),
      createdAt: nowIso(),
    });
  });

  router.get('/activity-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (isStaff(auth.role)) {
      const target = req.query.userId ? String(req.query.userId) : undefined;
      return res.json(db.listActivityLogs(target));
    }
    res.json(db.listActivityLogs(auth.userId));
  });

  router.post('/activity-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = `act_${randomUUID().slice(0, 8)}`;
    const createdAt = nowIso();
    const row = {
      id,
      userId: auth.userId,
      action: String(req.body?.action || 'event').slice(0, 120),
      details: req.body?.details != null ? redactCoordinatesFromLogPayload(req.body.details) : null,
      createdAt,
    };
    db.insertActivityLog(id, auth.userId, row, createdAt);
    res.status(201).json(row);
  });

  router.get('/system-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Faqat administratorlar uchun' });
    res.json(db.listSystemLogs());
  });

  router.post('/system-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Faqat administratorlar uchun' });
    const id = `log_${randomUUID().slice(0, 8)}`;
    const createdAt = nowIso();
    const row = {
      id,
      userId: auth.userId,
      action: String(req.body?.action || 'log').slice(0, 120),
      type: String(req.body?.type || 'info'),
      details: req.body?.details != null ? redactCoordinatesFromLogPayload(req.body.details) : null,
      createdAt,
    };
    db.insertSystemLog(id, auth.userId, row, createdAt);
    res.status(201).json(row);
  });

  router.get('/settings/global', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(db.getSetting('global_settings', getDefaultGlobalSettings()));
  });

  router.patch('/settings/global', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const current = db.getSetting('global_settings', getDefaultGlobalSettings());
    const next = {
      ...current,
      maxJobPostsPerWeek:
        req.body?.maxJobPostsPerWeek != null ? Number(req.body.maxJobPostsPerWeek) : current.maxJobPostsPerWeek,
      maxServicePostsPerWeek:
        req.body?.maxServicePostsPerWeek != null
          ? Number(req.body.maxServicePostsPerWeek)
          : current.maxServicePostsPerWeek,
      maxApplicationsPerDay:
        req.body?.maxApplicationsPerDay != null
          ? Number(req.body.maxApplicationsPerDay)
          : current.maxApplicationsPerDay,
      enableNotifications:
        req.body?.enableNotifications !== undefined ? Boolean(req.body.enableNotifications) : current.enableNotifications,
      enableModeration:
        req.body?.enableModeration !== undefined ? Boolean(req.body.enableModeration) : current.enableModeration,
      maintenanceMode:
        req.body?.maintenanceMode !== undefined ? Boolean(req.body.maintenanceMode) : current.maintenanceMode,
      updatedBy: auth.userId,
      updatedAt: nowIso(),
    };
    db.setSetting('global_settings', next);
    res.json(next);
  });

  // --- ADMIN USERS & SUBSCRIPTION & EXPORT ---
  router.get('/admin/users', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const staff = db
      .listUsers()
      .filter((u) => isStaff(u.role))
      .map((u) => ({
        uid: u.id,
        fullName: u.fullName,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        role: u.role,
        isVerified: u.isVerified,
        isBlocked: u.isBlocked,
        createdAt: u.createdAt,
      }));
    res.json(staff);
  });

  router.post('/admin/users', asyncHandler(async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const phone = req.body?.phone ? normalizePhone(String(req.body.phone)) : null;
    const email = req.body?.email ? normalizeEmail(String(req.body.email)) : null;
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Parol kamida 8 ta belgi' });
    if (phone && db.getUserByPhone(phone)) return res.status(409).json({ message: 'Bu telefon raqami band' });
    if (email && db.getUserByEmail(email)) return res.status(409).json({ message: 'Bu email band' });
    const id = `staff_${randomUUID().slice(0, 8)}`;
    const role: UserRole = req.body?.role === 'super_admin' ? 'super_admin' : 'admin';
    const user = makeUser({
      id,
      fullName: String(req.body?.fullName || 'Admin').slice(0, 120),
      phoneNumber: phone,
      email: email || (phone ? `${phone.replace(/\D/g, '')}@mexrliqollar.uz` : null),
      role,
      passwordHash: await bcrypt.hash(password, 10),
      isVerified: true,
      verificationStatus: 'verified',
    });
    db.upsertUser(user);
    res.status(201).json({
      uid: user.id,
      fullName: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isVerified: user.isVerified,
      isBlocked: user.isBlocked,
      createdAt: user.createdAt,
    });
  }));

  router.patch('/admin/users/:id/password', asyncHandler(async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Parol kamida 8 ta belgi' });
    const user = db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Topilmadi' });
    user.passwordHash = await bcrypt.hash(password, 10);
    user.sessionValidAfter = nowIso();
    user.updatedAt = nowIso();
    db.upsertUser(user);
    res.json({ success: true });
  }));

  router.delete('/admin/users/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    if (req.params.id === auth.userId) return res.status(400).json({ message: 'O‘z hisobingizni o‘chira olmaysiz' });
    const target = db.getUserById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (target.role === 'super_admin') {
      const superAdmins = db.listUsers().filter((u) => u.role === 'super_admin');
      if (superAdmins.length <= 1) {
        return res.status(400).json({ message: 'Oxirgi boshqaruv paneli hisobini o‘chirib bo‘lmaydi' });
      }
    }
    const actor = db.getUserById(auth.userId);
    db.recordAdminAudit({
      id: `aud_${randomUUID().slice(0, 10)}`,
      adminId: auth.userId,
      adminName: actor?.fullName && !/^super[\s_-]?admin$/i.test(actor.fullName) ? actor.fullName : 'Admin',
      action: 'DELETE_USER',
      targetType: target.role,
      targetId: target.id,
      details: { fullName: target.fullName, phoneNumber: target.phoneNumber, email: target.email },
      viewedExactCoords: false,
    });
    db.deleteUser(req.params.id);
    res.json({ success: true });
  });

  router.get('/admin/export/users', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Ruxsat yo‘q' });
    const csvSafe = (v: string) => {
      const cleaned = v.replace(/"/g, '""');
      // Prevent CSV formula injection in spreadsheet tools
      return /^[=+\-@\t\r]/.test(cleaned) ? `"'${cleaned}"` : `"${cleaned}"`;
    };
    const header = 'ID,FullName,Role,Region,District,Phone,Verified\n';
    const rows = db
      .listUsers()
      .map((u) =>
        [
          csvSafe(u.id),
          csvSafe(u.fullName),
          csvSafe(u.role),
          csvSafe(u.region),
          csvSafe(u.district || ''),
          csvSafe(u.phoneNumber || ''),
          String(u.isVerified),
        ].join(','),
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
    res.send(header + rows);
  });

  router.get('/admin/subscription/status', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Ruxsat yo‘q' });
    res.json(db.getSetting('subscription_state', getDefaultSubscriptionState()));
  });

  router.post('/admin/subscription/price', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const state = db.getSetting('subscription_state', getDefaultSubscriptionState());
    const nextPrice = Number(req.body?.priceSom);
    if (Number.isFinite(nextPrice) && nextPrice >= state.priceRange.min && nextPrice <= state.priceRange.max) {
      state.priceSom = nextPrice;
      db.setSetting('subscription_state', state);
    }
    res.json(state);
  });

  router.post('/admin/subscription/pay', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const state = db.getSetting('subscription_state', getDefaultSubscriptionState());
    res.json({ cardNumber: process.env.PAYMENT_CARD_NUMBER || '8600 **** **** 0000', amount: state.priceSom });
  });

  router.post('/admin/subscription/confirm', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Faqat boshqaruv paneli uchun' });
    const state = db.getSetting('subscription_state', getDefaultSubscriptionState());
    state.status = 'active';
    state.blocked = false;
    state.lastPaymentAt = nowIso();
    state.paidUntil = new Date(Date.now() + 30 * 86400_000).toISOString();
    state.effectiveUntil = state.paidUntil;
    state.daysRemaining = 30;
    db.setSetting('subscription_state', state);
    res.json(state);
  });

  // --- AI ENDPOINTS ---
  router.get('/ai/status', (_req, res) => {
    res.json({ live: false, provider: 'mock' });
  });

  router.post('/ai/employer/vacancy', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const title = String(req.body?.title || req.body?.category || 'Vakansiya').slice(0, 120);
    const desc = String(
      req.body?.description || `${title} bo'yicha mas'uliyatli xodim talab qilinadi.`,
    ).slice(0, 1000);
    res.json({
      text: `**${title}**\n\n${desc}\n\nVazifalar:\n- Belgilangan ishlarni sifatli va o'z vaqtida bajarish\n\nTaklif:\n- Qulay ish sharoiti va o'z vaqtida to'lov`,
      provider: 'mock',
    });
  });

  router.post('/ai/employer/match', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit || 10)));
    const workers = db
      .listUsers()
      .filter((u) => u.role === 'worker' && !u.isBlocked)
      .slice(0, limit)
      .map((u) => ({
        uid: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        phoneNumber: u.phoneNumber,
        region: u.region,
        district: u.district,
        skills: u.skills,
        experienceLevel: u.experienceLevel,
        isVerified: u.isVerified,
        rating: u.rating,
        matchScore: 88,
        matchedSkills: u.skills.slice(0, 2),
      }));
    res.json({ data: workers, total: workers.length, aiProvider: 'mock' });
  });

  router.post('/ai/worker/resume', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json({
      text: "Rezyume bo'yicha tavsiyalar:\n- Qisqa professional tavsif qo'shing.\n- Kamida 3-5 ta asosiy ko'nikma kiriting.\n- Tajriba va sertifikatlarni to'ldiring.",
      provider: 'mock',
    });
  });

  router.post('/ai/admin/risk-summary/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json({ message: 'Faqat administratorlar uchun' });
    res.json({
      text: 'Maslahat xulosa (yakuniy qarorni inson qabul qiladi):\nYuqori darajadagi xavf aniqlanmadi.',
      provider: 'mock',
      advisory: true,
    });
  });

  // --- UPLOADS (persisted in SQLite, parsed from multipart/form-data, magic-byte verified & owner/staff scoped) ---
  router.post(
    '/uploads',
    express.raw({ type: '*/*', limit: '12mb' }),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!rawBody.length) {
        return res.status(400).json({ message: 'Yuklangan fayl bo‘sh' });
      }

      const contentType = String(req.headers['content-type'] || '');
      let fileBytes: Buffer = rawBody;
      let originalName = 'upload';
      let kind = 'file';

      if (contentType.toLowerCase().includes('multipart/form-data')) {
        try {
          const parsedForm = await new Response(new Uint8Array(rawBody), {
            headers: { 'content-type': contentType },
          }).formData();
          const fileEntry = parsedForm.get('file');
          const kindEntry = parsedForm.get('kind');
          if (typeof kindEntry === 'string' && kindEntry.trim()) {
            kind = kindEntry.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'file';
          }
          if (!fileEntry || typeof fileEntry === 'string') {
            return res.status(400).json({ message: 'Fayl topilmadi (file maydoni kerak)' });
          }
          fileBytes = Buffer.from(await fileEntry.arrayBuffer());
          originalName = basename(fileEntry.name || 'upload').slice(0, 120) || 'upload';
        } catch {
          return res.status(400).json({ message: 'Faylni o‘qishda xatolik yuz berdi' });
        }
      }

      if (!fileBytes.length) {
        return res.status(400).json({ message: 'Fayl bo‘sh' });
      }
      if (fileBytes.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ message: 'Fayl hajmi 10 MB dan oshmasligi kerak' });
      }

      const detected = detectUploadedFileType(fileBytes);
      if (!detected) {
        return res.status(400).json({
          message: 'Faqat JPG, PNG, WebP, GIF rasm yoki PDF hujjat yuklash mumkin',
        });
      }

      const filename = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}.${detected.ext}`;
      const key = `${auth.userId}/${filename}`;
      db.saveUpload({
        key,
        userId: auth.userId,
        filename,
        mimeType: detected.mime,
        originalName,
        data: fileBytes,
        createdAt: nowIso(),
      });
      res.status(201).json({
        success: true,
        url: `/api/uploads/private/${key}`,
        filename,
        originalName,
        mimeType: detected.mime,
        size: fileBytes.length,
        kind,
      });
    }),
  );

  router.get('/uploads/private/:userId/:filename', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const ownerId = basename(req.params.userId);
    const file = basename(req.params.filename);
    if (!SAFE_FILENAME_REGEX.test(file) || ownerId !== req.params.userId || file !== req.params.filename) {
      return res.status(400).json({ message: 'Noto‘g‘ri fayl nomi' });
    }
    if (auth.userId !== ownerId && !isStaff(auth.role)) {
      return res.status(403).json({ message: 'Bu faylni ko‘rishga ruxsatingiz yo‘q' });
    }
    const key = `${ownerId}/${file}`;
    const item = db.getUpload(key);
    if (!item) return res.status(404).json({ message: 'Fayl topilmadi' });

    let payload = item.data;
    let mime = item.mimeType || 'application/octet-stream';
    if (mime.toLowerCase().includes('multipart/form-data') || mime === 'application/octet-stream') {
      const recovered = recoverLegacyMultipartBytes(payload);
      if (recovered) {
        payload = recovered.data;
        mime = recovered.mime;
      } else {
        const direct = detectUploadedFileType(payload);
        if (direct) mime = direct.mime;
      }
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(payload);
  });

  attachYandexRoutes(router, {
    db,
    getAuth,
    requireAuth,
    verifyTokenString: (token: string) => {
      const payload = verifyJwt(token);
      if (!payload) return null;
      const user = db.getUserById(payload.sub);
      if (!user || user.isBlocked) return null;
      if (user.sessionValidAfter) {
        const validAfterMs = new Date(user.sessionValidAfter).getTime();
        const issuedAtMs = typeof payload.iatMs === 'number' ? payload.iatMs : (payload.iat ?? 0) * 1000;
        if (issuedAtMs < validAfterMs) return null;
      }
      return { userId: user.id, role: user.role, email: user.email };
    },
  });

  // Explicit JSON 404 for unknown API paths so SPA HTML is never mistakenly returned as JSON
  router.use((_req, res) => {
    res.status(404).json({ message: 'API yo‘li topilmadi' });
  });

  // Global error handler so unhandled route errors never crash the server process
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err instanceof Error ? err.message : String(err));
    if (res.headersSent) return;
    res.status(500).json({ message: 'Ichki server xatoligi yuz berdi' });
  });

  return router;
}

export function createApiApp(dbPath?: string) {
  const db = new AppDatabase(dbPath);
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api', buildApiRouter(db));
  return { app, db };
}

async function startServer() {
  const { app, db } = createApiApp();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  // Background sweep every 3s: expire timed-out offers, re-dispatch sequentially / expand radius, purge expired live coords
  const sweepTimer = setInterval(() => {
    try {
      const result = sweepExpiredOffersAndLocations(db.sqlite);
      for (const next of result.dispatched) {
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
        } else if (next.orderStatus === 'muddati_otdi') {
          dispatchPushEvent(db, {
            userId: next.employerId,
            title: 'Ishchi topilmadi',
            message: 'Hudud bo‘yicha bo‘sh ishchi topilmadi. Keyinroq qayta urinib ko‘ring.',
            eventType: 'expired',
            orderId: next.orderId,
            link: '/',
          });
        }
      }
    } catch {
      /* background sweep resilience */
    }
  }, 3000);
  sweepTimer.unref();

  if (isProd) {
    const distDir = resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response, next: NextFunction) => {
      if (_req.path.startsWith('/api')) return next();
      res.sendFile(join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Mehrli qo'llar server listening on http://0.0.0.0:${port}`);
  });
}

// Only start listening when executed directly (allows importing createApiApp in tests)
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve('server.ts');
if (isDirectRun) {
  void startServer();
}
