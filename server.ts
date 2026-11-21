import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type UserRole = 'worker' | 'employer' | 'admin' | 'super_admin';

interface StoredUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string | null;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  region: string;
  district: string | null;
  neighborhood: string | null;
  bio: string | null;
  skills: string[];
  profession: string | null;
  educationLevel: string | null;
  photoUrl: string | null;
  coverUrl: string | null;
  telegram: string | null;
  languages: string[];
  availability: string;
  lookingForWork: boolean;
  professionalSummary: string | null;
  preferredContact: string | null;
  experienceLevel: string | null;
  isPremium: boolean;
  isVerified: boolean;
  verificationStatus: string;
  rating: number;
  reviewCount: number;
  completedJobs: number;
  education: unknown[];
  experience: unknown[];
  certificates: unknown[];
  portfolio: unknown[];
  resumeTemplate: string;
  personalInfo: Record<string, unknown> | null;
  coreIndicators: Record<string, unknown> | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
  locationSharingEnabled: boolean;
  companyName: string | null;
  businessType: string | null;
  industry: string | null;
  registrationNumber: string | null;
  tin: string | null;
  website: string | null;
  foundedYear: string | null;
  employeeCount: string | null;
  officeAddress: string | null;
  companyGallery: unknown[];
  companyDocuments: unknown[];
  recruiterContacts: unknown[];
  violationCount: number;
  riskScore: number;
  isBlocked: boolean;
  blockReason: string | null;
  trustScore: number;
  behaviorFlags: string[];
  createdAt: string;
  updatedAt: string;
  lastActive: string;
}

interface StoredJob {
  id: string;
  title: string;
  description: string | null;
  employerId: string;
  employerName: string | null;
  category: string | null;
  region: string | null;
  district: string | null;
  neighborhood: string | null;
  salary: number | null;
  price: number | null;
  salaryType: string | null;
  workType: string | null;
  scheduledAt: string | null;
  status: 'active' | 'closed' | 'draft' | 'open';
  isPromoted: boolean;
  requirements: string[];
  images: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoredServicePost {
  id: string;
  workerId: string;
  workerName: string | null;
  title: string;
  description: string | null;
  category: string | null;
  price: number | null;
  expectedPrice: number | null;
  priceType: string | null;
  region: string | null;
  district: string | null;
  images: string[];
  isActive: boolean;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

interface StoredApplication {
  id: string;
  jobId: string;
  workerId: string;
  employerId: string;
  workerName: string | null;
  jobTitle: string | null;
  message: string | null;
  coverLetter: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'completed';
  acceptedAt: string | null;
  completedAt: string | null;
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredContract {
  id: string;
  jobId: string | null;
  workerId: string;
  employerId: string;
  workerName: string | null;
  employerName: string | null;
  jobTitle: string | null;
  salary: number | null;
  amount: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  terms: string | null;
  signedByWorker: boolean;
  signedByEmployer: boolean;
  workerSigned: boolean;
  employerSigned: boolean;
  adminApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

interface StoredMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  text: string;
  message: string;
  read: boolean;
  delivered: boolean;
  status: string;
  jobId: string | null;
  contractId: string | null;
  createdAt: string;
}

interface StoredReview {
  id: string;
  reviewerId: string;
  revieweeId: string;
  reviewerName: string | null;
  rating: number;
  comment: string | null;
  contractId: string | null;
  applicationId: string | null;
  createdAt: string;
}

interface StoredDispute {
  id: string;
  contractId: string;
  openedById: string;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredVerification {
  id: string;
  userId: string;
  userName: string | null;
  accountType: string;
  documentType: string;
  documentUrl: string;
  idPhotoUrl: string;
  selfieUrl: string;
  addressProofUrl?: string;
  passportData?: Record<string, unknown>;
  documentChecks?: Record<string, unknown>;
  status: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'qulay-ish-local-dev-secret';

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

function signJwt(payload: Record<string, unknown>, expiresInSec = 60 * 60 * 24 * 30): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  const sig = base64UrlEncode(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token: string): { sub: string; role: UserRole; email?: string | null } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = base64UrlEncode(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
    if (sig !== expected) return null;
    const parsed = JSON.parse(base64UrlDecode(body)) as {
      sub?: string;
      role?: UserRole;
      email?: string | null;
      exp?: number;
    };
    if (!parsed.sub || !parsed.role) return null;
    if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) return null;
    return { sub: parsed.sub, role: parsed.role, email: parsed.email };
  } catch {
    return null;
  }
}

function normalizePhone(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  const trimmed = (input || '').trim();
  return trimmed.startsWith('+') ? trimmed : digits ? `+${digits}` : '';
}

function splitName(fullName: string): { firstName: string; lastName: string; fullName: string } {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    fullName: cleaned || 'Foydalanuvchi',
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- In-Memory Data Store ---
const nowIso = () => new Date().toISOString();
const users = new Map<string, StoredUser>();
const jobs = new Map<string, StoredJob>();
const servicePosts = new Map<string, StoredServicePost>();
const applications = new Map<string, StoredApplication>();
const contracts = new Map<string, StoredContract>();
const notifications = new Map<string, StoredNotification>();
const chatMessages: StoredMessage[] = [];
const reviews: StoredReview[] = [];
const savedJobs: Array<{ id: string; userId: string; jobId: string; createdAt: string }> = [];
const disputes = new Map<string, StoredDispute>();
const verifications = new Map<string, StoredVerification>();
const payments: Array<Record<string, unknown>> = [];
const activityLogs: Array<Record<string, unknown>> = [];
const systemLogs: Array<Record<string, unknown>> = [];
const uploadedBlobs = new Map<string, { buffer: Buffer; mimeType: string; originalName: string }>();
const otpSessions = new Map<
  string,
  {
    phone: string;
    code: string;
    purpose: 'login' | 'register' | 'reset';
    fullName?: string;
    firstName?: string;
    lastName?: string;
    profession?: string;
    educationLevel?: string;
    district?: string;
    verified: boolean;
    expiresAt: number;
  }
>();

let globalSettings = {
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

let subscriptionState = {
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

function makeUser(partial: Partial<StoredUser> & { id: string; fullName: string; role: UserRole }): StoredUser {
  const split = splitName(partial.fullName);
  const ts = nowIso();
  return {
    email: null,
    phoneNumber: null,
    passwordHash: null,
    firstName: partial.firstName ?? (split.firstName || null),
    lastName: partial.lastName ?? (split.lastName || null),
    region: 'Samarqand viloyati',
    district: 'samarkand_city',
    neighborhood: null,
    bio: null,
    skills: [],
    profession: null,
    educationLevel: null,
    photoUrl: null,
    coverUrl: null,
    telegram: null,
    languages: ['O\'zbek'],
    availability: 'available',
    lookingForWork: true,
    professionalSummary: null,
    preferredContact: 'phone',
    experienceLevel: 'intermediate',
    isPremium: false,
    isVerified: false,
    verificationStatus: 'none',
    rating: 0,
    reviewCount: 0,
    completedJobs: 0,
    education: [],
    experience: [],
    certificates: [],
    portfolio: [],
    resumeTemplate: 'professional',
    personalInfo: null,
    coreIndicators: null,
    latitude: null,
    longitude: null,
    locationUpdatedAt: null,
    locationSharingEnabled: false,
    companyName: null,
    businessType: null,
    industry: null,
    registrationNumber: null,
    tin: null,
    website: null,
    foundedYear: null,
    employeeCount: null,
    officeAddress: null,
    companyGallery: [],
    companyDocuments: [],
    recruiterContacts: [],
    violationCount: 0,
    riskScore: 0,
    isBlocked: false,
    blockReason: null,
    trustScore: 100,
    behaviorFlags: [],
    createdAt: ts,
    updatedAt: ts,
    lastActive: ts,
    ...partial,
  };
}

function mapDistrictId(raw?: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('urgut')) return 'urgut';
  if (s.includes('jomboy')) return 'jomboy';
  if (s.includes('kattaqo')) return 'kattakurgan';
  if (s.includes('pastdarg')) return 'pastdargom';
  if (s.includes('bulung')) return 'bulungur';
  if (s.includes('oqdaryo')) return 'oqdaryo';
  if (s.includes('payariq')) return 'payariq';
  if (s.includes('ishti')) return 'ishtixon';
  if (s.includes('narpay')) return 'narpay';
  if (s.includes('nurobod')) return 'nurobod';
  if (s.includes('paxta')) return 'paxtachi';
  if (s.includes('qo\'shrabot') || s.includes('qoshrabot')) return 'qoshrabot';
  if (s.includes('toyloq')) return 'toyloq';
  return 'samarkand_city';
}

function seedStore() {
  const profilesPath = resolve(process.cwd(), 'worker-profiles.json');
  const coordsByDistrict: Record<string, [number, number]> = {
    samarkand_city: [39.6542, 66.9597],
    urgut: [39.4022, 67.2431],
    jomboy: [39.7003, 67.0933],
    kattakurgan: [39.8989, 66.2561],
    pastdargom: [39.7133, 66.7439],
    bulungur: [39.7647, 67.2714],
  };

  if (existsSync(profilesPath)) {
    try {
      const raw = JSON.parse(readFileSync(profilesPath, 'utf8')) as Array<Record<string, unknown>>;
      raw.forEach((p, idx) => {
        const id = String(p.uid || `worker_${idx + 1}`);
        const district = mapDistrictId(String(p.district || ''));
        const coords = coordsByDistrict[district] || [39.6542, 66.9597];
        const skills = Array.isArray(p.skills) ? p.skills.map(String) : [];
        const user = makeUser({
          id,
          fullName: String(p.fullName || 'Ishchi'),
          email: p.email ? String(p.email) : null,
          phoneNumber: p.phoneNumber ? normalizePhone(String(p.phoneNumber)) : null,
          role: 'worker',
          region: 'Samarqand viloyati',
          district,
          bio: p.bio ? String(p.bio) : null,
          skills,
          profession: skills[0] || 'Mutaxassis',
          photoUrl: p.photoUrl ? String(p.photoUrl) : null,
          experienceLevel: p.experienceLevel ? String(p.experienceLevel) : 'intermediate',
          isPremium: Boolean(p.isPremium),
          isVerified: Boolean(p.isVerified),
          verificationStatus: String(p.verificationStatus || 'none'),
          rating: Number(p.rating ?? 4.7),
          reviewCount: Number(p.reviewCount ?? 12),
          completedJobs: Number(p.completedJobs ?? 15),
          trustScore: Number(p.trustScore ?? 95),
          latitude: coords[0] + (idx % 5) * 0.005,
          longitude: coords[1] + (idx % 5) * 0.005,
          locationSharingEnabled: true,
        });
        users.set(id, user);

        const postId = `sp_${id}`;
        servicePosts.set(postId, {
          id: postId,
          workerId: id,
          workerName: user.fullName,
          title: `${skills[0] || 'Xizmat'} — ${user.fullName}`,
          description: user.bio,
          category: skills[0] || 'Boshqa',
          price: 120000 + idx * 15000,
          expectedPrice: 120000 + idx * 15000,
          priceType: 'kunlik',
          region: user.region,
          district: user.district,
          images: [],
          isActive: true,
          status: 'active',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    } catch {
      /* ignore malformed seed */
    }
  }

  // Seed sample employers & jobs
  const emp1 = makeUser({
    id: 'employer_001',
    fullName: 'Samarqand Tekstil MChJ',
    companyName: 'Samarqand Tekstil MChJ',
    email: 'hr@samtekstil.uz',
    phoneNumber: '+998901112233',
    role: 'employer',
    district: 'samarkand_city',
    bio: 'Samarqand shahridagi zamonaviy tikuvchilik korxonasi.',
    isVerified: true,
    verificationStatus: 'verified',
    latitude: 39.6542,
    longitude: 66.9597,
    locationSharingEnabled: true,
  });
  const emp2 = makeUser({
    id: 'employer_002',
    fullName: 'Baraka Oilaviy Markazi',
    companyName: 'Baraka Oilaviy Markazi',
    email: 'info@baraka.uz',
    phoneNumber: '+998902223344',
    role: 'employer',
    district: 'urgut',
    bio: 'Uy xizmatlari va enagalik markazi.',
    isVerified: true,
    verificationStatus: 'verified',
    latitude: 39.4022,
    longitude: 67.2431,
    locationSharingEnabled: true,
  });
  users.set(emp1.id, emp1);
  users.set(emp2.id, emp2);

  const sampleJobs: StoredJob[] = [
    {
      id: 'job_001',
      title: 'Tajribali tikuvchi kerak',
      description: 'Milliy va zamonaviy liboslar tikish uchun tajribali tikuvchi ayol kerak. Qulay sharoit va o‘z vaqtida maosh.',
      employerId: emp1.id,
      employerName: emp1.companyName || emp1.fullName,
      category: 'Tikuvchilik',
      region: 'Samarqand viloyati',
      district: 'samarkand_city',
      neighborhood: 'Registon MFY',
      salary: 3500000,
      price: 3500000,
      salaryType: 'oylik',
      workType: 'full_time',
      scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
      status: 'active',
      isPromoted: true,
      requirements: ['Tikuv mashinasida ishlash tajribasi', 'Tartibli va mas’uliyatli'],
      images: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: 'job_002',
      title: 'Bolalarga qarovchi (Enaga)',
      description: '3 yoshli qizaloqqa kunduzgi vaqtda qarash, ovqatlantirish va mashg‘ulotlar o‘tkazish.',
      employerId: emp2.id,
      employerName: emp2.companyName || emp2.fullName,
      category: 'Enagalik',
      region: 'Samarqand viloyati',
      district: 'urgut',
      neighborhood: 'Navoiy ko‘chasi',
      salary: 2800000,
      price: 2800000,
      salaryType: 'oylik',
      workType: 'part_time',
      scheduledAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
      status: 'active',
      isPromoted: false,
      requirements: ['Bolalar bilan ishlash tajribasi', 'Mehribonlik'],
      images: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: 'job_003',
      title: 'Uy tozalash va tartibga keltirish',
      description: 'Haftada 3 kun xonadonni tozalash va dazmollash xizmati.',
      employerId: emp1.id,
      employerName: emp1.fullName,
      category: 'Tozalash',
      region: 'Samarqand viloyati',
      district: 'samarkand_city',
      neighborhood: 'Sartepa',
      salary: 180000,
      price: 180000,
      salaryType: 'kunlik',
      workType: 'flexible',
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
      status: 'open',
      isPromoted: false,
      requirements: ['Pokizalik', 'Mas’uliyat'],
      images: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
  sampleJobs.forEach((j) => jobs.set(j.id, j));
}

seedStore();

function sanitizeUser(u: StoredUser, opts?: { includePrivate?: boolean; includePersonal?: boolean; includeCore?: boolean }) {
  const { passwordHash: _pw, personalInfo, coreIndicators, latitude: _lat, longitude: _lng, ...rest } = u;
  const out: Record<string, unknown> = { ...rest };
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

function getAuth(req: Request): { userId: string; role: UserRole; email?: string | null } | null {
  const raw = req.headers.authorization || '';
  if (!raw.startsWith('Bearer ')) return null;
  const payload = verifyJwt(raw.slice(7).trim());
  if (!payload) return null;
  return { userId: payload.sub, role: payload.role, email: payload.email };
}

function requireAuth(req: Request, res: Response): { userId: string; role: UserRole; email?: string | null } | null {
  const auth = getAuth(req);
  if (!auth) {
    res.status(401).json({ message: 'Avtorizatsiya talab qilinadi' });
    return null;
  }
  return auth;
}

function isStaff(role?: string) {
  return role === 'admin' || role === 'super_admin';
}

function buildApiRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '15mb' }));
  router.use(express.urlencoded({ extended: false }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, status: 'healthy', timestamp: nowIso() });
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
    const allUsers = Array.from(users.values());
    const allJobs = Array.from(jobs.values());
    const allApps = Array.from(applications.values());
    const allContracts = Array.from(contracts.values());
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

  // --- AUTH ---
  router.get('/auth/sms-status', (_req, res) => {
    res.json({ configured: true, mode: 'dev-in-memory', provider: 'mock' });
  });

  router.post('/auth/send-otp', (req, res) => {
    const phone = normalizePhone(String(req.body?.phone || ''));
    if (!/^\+998\d{9}$/.test(phone)) {
      return res.status(400).json({ message: 'Telefon raqami +998XXXXXXXXX formatida bo\'lishi kerak' });
    }
    const purpose = (req.body?.purpose || 'login') as 'login' | 'register' | 'reset';
    const existing = Array.from(users.values()).find((u) => u.phoneNumber === phone);
    if (purpose === 'register' && existing) {
      return res.status(400).json({ message: 'Bu telefon raqami allaqachon ro\'yxatdan o\'tgan' });
    }
    if ((purpose === 'login' || purpose === 'reset') && !existing) {
      return res.status(400).json({ message: 'Bu telefon raqami ro\'yxatdan o\'tmagan. Avval ro\'yxatdan o\'ting.' });
    }
    const code = '123456';
    otpSessions.set(phone, {
      phone,
      code,
      purpose,
      fullName: req.body?.fullName ? String(req.body.fullName) : undefined,
      firstName: req.body?.firstName ? String(req.body.firstName) : undefined,
      lastName: req.body?.lastName ? String(req.body.lastName) : undefined,
      profession: req.body?.profession ? String(req.body.profession) : undefined,
      educationLevel: req.body?.educationLevel ? String(req.body.educationLevel) : undefined,
      district: req.body?.district ? String(req.body.district) : undefined,
      verified: false,
      expiresAt: Date.now() + 5 * 60_000,
    });
    console.log(`[OTP] ${purpose} code for ${phone}: ${code}`);
    res.json({ success: true });
  });

  router.post('/auth/verify-otp', (req, res) => {
    const phone = normalizePhone(String(req.body?.phone || ''));
    const code = String(req.body?.code || '').trim();
    const session = otpSessions.get(phone);
    if (!session) {
      return res.status(404).json({ message: 'Session topilmadi, tasdiqlash kodini qayta so\'rang' });
    }
    if (Date.now() > session.expiresAt) {
      otpSessions.delete(phone);
      return res.status(410).json({ message: 'Tasdiqlash kodi muddati tugagan' });
    }
    if (code !== session.code && code !== '123456') {
      return res.status(401).json({ message: 'Tasdiqlash kodi noto\'g\'ri' });
    }
    session.verified = true;

    if (session.purpose === 'reset') {
      return res.json({ success: true, purpose: 'reset', resetAllowed: true });
    }

    let user = Array.from(users.values()).find((u) => u.phoneNumber === phone);
    if (!user) {
      if (session.purpose !== 'register') {
        return res.status(401).json({ message: 'Bu telefon raqami ro\'yxatdan o\'tmagan.' });
      }
      const id = `worker_${randomUUID().slice(0, 12)}`;
      const fullName =
        (session.fullName || `${session.firstName || ''} ${session.lastName || ''}`.trim() || 'Foydalanuvchi').trim();
      user = makeUser({
        id,
        fullName,
        firstName: session.firstName || splitName(fullName).firstName || null,
        lastName: session.lastName || splitName(fullName).lastName || null,
        phoneNumber: phone,
        email: `${phone.replace(/\D/g, '')}@mexrliqollar.uz`,
        role: 'worker',
        district: session.district || 'samarkand_city',
        profession: session.profession || null,
        skills: session.profession ? [session.profession] : [],
        educationLevel: session.educationLevel || null,
      });
      users.set(id, user);
    }

    otpSessions.delete(phone);
    const accessToken = signJwt({ sub: user.id, role: user.role, email: user.email });
    res.json({ success: true, accessToken, user: sanitizeUser(user, { includePrivate: true, includePersonal: true }) });
  });

  router.post('/auth/login', async (req, res) => {
    const emailOrPhone = String(req.body?.emailOrPhone || '').trim();
    const password = String(req.body?.password || '');
    const normalizedPhone = normalizePhone(emailOrPhone);
    const user = Array.from(users.values()).find(
      (u) =>
        (u.email && u.email.toLowerCase() === emailOrPhone.toLowerCase()) ||
        (u.phoneNumber && (u.phoneNumber === emailOrPhone || u.phoneNumber === normalizedPhone)),
    );
    if (!user?.passwordHash) {
      return res.status(401).json({ message: 'Telefon yoki parol noto\'g\'ri' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Telefon yoki parol noto\'g\'ri' });
    const accessToken = signJwt({ sub: user.id, role: user.role, email: user.email });
    res.json({ accessToken, user: sanitizeUser(user, { includePrivate: true, includePersonal: true }) });
  });

  router.post('/auth/super-admin/login', async (req, res) => {
    const login = String(req.body?.login || req.body?.email || req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    const envEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.VITE_SUPER_ADMIN_EMAIL || '').trim();
    const envPhone = (process.env.SUPER_ADMIN_PHONE || process.env.VITE_SUPER_ADMIN_PHONE || '').trim();
    const envPassword = process.env.SUPER_ADMIN_PASSWORD || process.env.VITE_SUPER_ADMIN_PASSWORD || '';

    if (!envPassword || (!envEmail && !envPhone)) {
      return res.status(401).json({ message: 'Super Admin serverda sozlanmagan (.env)' });
    }
    const loginOk =
      (envEmail && login.toLowerCase() === envEmail.toLowerCase()) ||
      (envPhone && normalizePhone(login) === normalizePhone(envPhone));
    if (!loginOk || password !== envPassword) {
      return res.status(401).json({ message: 'Super Admin login yoki parol noto\'g\'ri' });
    }

    let admin = Array.from(users.values()).find((u) => u.role === 'super_admin');
    if (!admin) {
      admin = makeUser({
        id: 'super_admin_1',
        fullName: 'Super Admin',
        firstName: 'Super',
        lastName: 'Admin',
        email: envEmail || 'superadmin@mexrliqollar.uz',
        phoneNumber: envPhone ? normalizePhone(envPhone) : null,
        passwordHash: await bcrypt.hash(envPassword, 10),
        role: 'super_admin',
        isVerified: true,
        verificationStatus: 'verified',
      });
      users.set(admin.id, admin);
    }
    const accessToken = signJwt({ sub: admin.id, role: 'super_admin', email: admin.email });
    res.json({ accessToken, user: sanitizeUser(admin, { includePrivate: true, includeCore: true }) });
  });

  router.post('/auth/reset-password', async (req, res) => {
    const phone = normalizePhone(String(req.body?.phone || ''));
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Parol kamida 8 ta belgidan iborat bo\'lishi kerak' });
    }
    const user = Array.from(users.values()).find((u) => u.phoneNumber === phone);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = nowIso();
    otpSessions.delete(phone);
    res.json({ success: true, message: 'Parol muvaffaqiyatli yangilandi' });
  });

  router.get('/auth/me', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(auth.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    res.json(sanitizeUser(user, { includePrivate: true, includePersonal: user.role === 'worker', includeCore: user.role === 'super_admin' }));
  });

  router.post('/auth/refresh', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(auth.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    const accessToken = signJwt({ sub: user.id, role: user.role, email: user.email });
    res.json({ accessToken, user: sanitizeUser(user, { includePrivate: true, includePersonal: user.role === 'worker', includeCore: user.role === 'super_admin' }) });
  });

  router.post('/auth/logout', (_req, res) => {
    res.json({ success: true });
  });

  router.post('/auth/delete-account', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(auth.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    if (isStaff(user.role)) return res.status(403).json({ message: 'Xodim hisobini o\'chirib bo\'lmaydi' });
    user.isBlocked = true;
    user.phoneNumber = null;
    user.email = null;
    user.fullName = "O'chirilgan hisob";
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
    const rows = Array.from(users.values()).filter((u) => {
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
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    res.json({ personalInfo: user.personalInfo ?? null });
  });

  router.put('/users/:id/personal-info', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    user.personalInfo = (req.body?.personalInfo ?? req.body ?? null) as Record<string, unknown> | null;
    user.updatedAt = nowIso();
    res.json({ personalInfo: user.personalInfo });
  });

  router.get('/users/:id/core-indicators', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Super Admin only' });
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    res.json({ coreIndicators: user.coreIndicators ?? null });
  });

  router.put('/users/:id/core-indicators', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json({ message: 'Super Admin only' });
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    user.coreIndicators = (req.body?.coreIndicators ?? req.body ?? null) as Record<string, unknown> | null;
    user.updatedAt = nowIso();
    res.json({ coreIndicators: user.coreIndicators });
  });

  router.put('/users/:id/location', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && auth.role !== 'super_admin') return res.status(403).json();
    const enabled = req.body?.enabled !== false;
    if (enabled) {
      user.latitude = Number(req.body?.latitude);
      user.longitude = Number(req.body?.longitude);
      user.locationUpdatedAt = nowIso();
      user.locationSharingEnabled = true;
    } else {
      user.locationSharingEnabled = false;
    }
    res.json({ locationSharingEnabled: user.locationSharingEnabled, locationUpdatedAt: user.locationUpdatedAt });
  });

  router.delete('/users/:id/location', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    user.latitude = null;
    user.longitude = null;
    user.locationUpdatedAt = null;
    user.locationSharingEnabled = false;
    res.json({ locationSharingEnabled: false });
  });

  router.get('/users/:id', (req, res) => {
    const auth = getAuth(req);
    const staff = isStaff(auth?.role);
    const user = users.get(req.params.id);
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
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    if (auth.userId !== user.id && !isStaff(auth.role)) return res.status(403).json();
    const { personalInfo: _pi, coreIndicators: _ci, passwordHash: _ph, id: _id, ...updates } = req.body || {};
    Object.assign(user, updates, { updatedAt: nowIso() });
    res.json(sanitizeUser(user, { includePrivate: true, includePersonal: auth.userId === user.id, includeCore: auth.role === 'super_admin' }));
  });

  // --- EMPLOYER WORKERS ---
  router.get('/employer/workers', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const search = String(req.query.search || '').trim().toLowerCase();
    const region = req.query.region ? String(req.query.region) : undefined;
    const district = req.query.district ? String(req.query.district) : undefined;
    const skill = req.query.skill ? String(req.query.skill) : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const list = Array.from(users.values()).filter((u) => {
      if (u.role !== 'worker' || u.isBlocked) return false;
      if (region && u.region !== region) return false;
      if (district && u.district !== district) return false;
      if (skill && !u.skills.includes(skill)) return false;
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
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const list = Array.from(users.values())
      .filter((u) => u.role === 'worker' && !u.isBlocked && u.latitude != null && u.longitude != null)
      .map((u) => ({
        u,
        distanceKm: Number.isFinite(lat) && Number.isFinite(lng) ? haversineKm(lat, lng, u.latitude!, u.longitude!) : 1,
      }))
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: slice.map(({ u, distanceKm }) => ({
        uid: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        phoneNumber: u.phoneNumber,
        region: u.region,
        district: u.district,
        skills: u.skills,
        availability: u.availability,
        experienceLevel: u.experienceLevel,
        isVerified: u.isVerified,
        rating: u.rating,
        lookingForWork: u.lookingForWork,
        distanceKm: Math.round(distanceKm * 10) / 10,
        distanceLabel: `~${Math.max(1, Math.round(distanceKm))} km`,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      radiusKm,
    });
  });

  // --- JOBS ---
  router.get('/jobs', (req, res) => {
    const employerId = req.query.employerId ? String(req.query.employerId) : undefined;
    const region = req.query.region ? String(req.query.region) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = Array.from(jobs.values()).filter((j) => {
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
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const list = Array.from(jobs.values())
      .filter((j) => j.status === 'active' || j.status === 'open')
      .map((j) => {
        const emp = users.get(j.employerId);
        const d =
          Number.isFinite(lat) && Number.isFinite(lng) && emp?.latitude != null && emp?.longitude != null
            ? haversineKm(lat, lng, emp.latitude, emp.longitude)
            : 2;
        return { job: j, distanceKm: d };
      })
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const total = list.length;
    const slice = list.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: slice.map(({ job, distanceKm }) => ({
        ...job,
        distanceKm: Math.round(distanceKm * 10) / 10,
        distanceLabel: `~${Math.max(1, Math.round(distanceKm))} km`,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      radiusKm,
    });
  });

  router.get('/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ message: 'E\'lon topilmadi' });
    res.json(job);
  });

  router.post('/jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = String(req.body?.id || `job_${randomUUID().slice(0, 8)}`);
    const job: StoredJob = {
      id,
      title: String(req.body?.title || 'Yangi e\'lon'),
      description: req.body?.description ? String(req.body.description) : null,
      employerId: String(req.body?.employerId || auth.userId),
      employerName: req.body?.employerName ? String(req.body.employerName) : null,
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
      isPromoted: Boolean(req.body?.isPromoted),
      requirements: Array.isArray(req.body?.requirements) ? req.body.requirements : [],
      images: Array.isArray(req.body?.images) ? req.body.images : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    jobs.set(id, job);
    res.json(job);
  });

  router.patch('/jobs/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ message: 'E\'lon topilmadi' });
    Object.assign(job, req.body || {}, { updatedAt: nowIso() });
    res.json(job);
  });

  // --- SERVICE POSTS ---
  router.get('/service-posts', (req, res) => {
    const workerId = req.query.workerId ? String(req.query.workerId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const rows = Array.from(servicePosts.values()).filter((p) => {
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
    const post: StoredServicePost = {
      id,
      workerId: String(req.body?.workerId || auth.userId),
      workerName: req.body?.workerName ? String(req.body.workerName) : users.get(auth.userId)?.fullName || null,
      title: String(req.body?.title || 'Xizmat'),
      description: req.body?.description ? String(req.body.description) : null,
      category: req.body?.category ? String(req.body.category) : null,
      price: req.body?.price != null ? Number(req.body.price) : null,
      expectedPrice: req.body?.expectedPrice != null ? Number(req.body.expectedPrice) : null,
      priceType: req.body?.priceType ? String(req.body.priceType) : null,
      region: req.body?.region ? String(req.body.region) : 'Samarqand viloyati',
      district: req.body?.district ? String(req.body.district) : null,
      images: Array.isArray(req.body?.images) ? req.body.images : [],
      isActive: true,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    servicePosts.set(id, post);
    res.json(post);
  });

  router.patch('/service-posts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const post = servicePosts.get(req.params.id);
    if (!post) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(post, req.body || {}, { updatedAt: nowIso() });
    res.json(post);
  });

  // --- APPLICATIONS ---
  router.get('/applications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = Array.from(applications.values()).filter((a) => {
      if (!isStaff(auth.role) && a.workerId !== auth.userId && a.employerId !== auth.userId) return false;
      if (req.query.jobId && a.jobId !== String(req.query.jobId)) return false;
      if (req.query.status && a.status !== String(req.query.status)) return false;
      return true;
    });
    res.json(rows);
  });

  router.get('/applications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = applications.get(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    res.json(app);
  });

  router.post('/applications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ message: 'Ish e\'loni topilmadi' });
    const id = `app_${randomUUID().slice(0, 8)}`;
    const app: StoredApplication = {
      id,
      jobId,
      workerId: auth.userId,
      employerId: job.employerId,
      workerName: users.get(auth.userId)?.fullName || null,
      jobTitle: job.title,
      message: String(req.body?.message || req.body?.coverLetter || ''),
      coverLetter: req.body?.coverLetter ? String(req.body.coverLetter) : null,
      status: 'pending',
      acceptedAt: null,
      completedAt: null,
      reviewed: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    applications.set(id, app);
    res.json(app);
  });

  router.patch('/applications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = applications.get(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(app, req.body || {}, { updatedAt: nowIso() });
    if (req.body?.status === 'accepted' && !app.acceptedAt) app.acceptedAt = nowIso();
    res.json(app);
  });

  router.post('/applications/:id/complete', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = applications.get(req.params.id);
    if (!app) return res.status(404).json({ message: 'Topilmadi' });
    app.status = 'completed';
    app.completedAt = nowIso();
    app.updatedAt = nowIso();
    res.json(app);
  });

  // --- CONTRACTS ---
  router.get('/contracts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = Array.from(contracts.values()).filter((c) => {
      if (!isStaff(auth.role) && c.workerId !== auth.userId && c.employerId !== auth.userId) return false;
      if (req.query.status && c.status !== String(req.query.status)) return false;
      return true;
    });
    res.json(rows);
  });

  router.get('/contracts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const c = contracts.get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Topilmadi' });
    res.json(c);
  });

  router.post('/contracts', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: req.body?.jobId ? String(req.body.jobId) : null,
      workerId: String(req.body?.workerId || ''),
      employerId: String(req.body?.employerId || auth.userId),
      workerName: req.body?.workerName ? String(req.body.workerName) : null,
      employerName: req.body?.employerName ? String(req.body.employerName) : null,
      jobTitle: req.body?.jobTitle ? String(req.body.jobTitle) : null,
      salary: req.body?.salary != null ? Number(req.body.salary) : null,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      startDate: req.body?.startDate ? String(req.body.startDate) : null,
      endDate: req.body?.endDate ? String(req.body.endDate) : null,
      status: String(req.body?.status || 'draft'),
      terms: req.body?.terms ? String(req.body.terms) : null,
      signedByWorker: Boolean(req.body?.signedByWorker || req.body?.workerSigned),
      signedByEmployer: Boolean(req.body?.signedByEmployer || req.body?.employerSigned),
      workerSigned: Boolean(req.body?.signedByWorker || req.body?.workerSigned),
      employerSigned: Boolean(req.body?.signedByEmployer || req.body?.employerSigned),
      adminApproved: Boolean(req.body?.adminApproved),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    contracts.set(id, c);
    res.json(c);
  });

  router.post('/contracts/from-application/:applicationId', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const app = applications.get(req.params.applicationId);
    if (!app) return res.status(404).json({ message: 'Ariza topilmadi' });
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: app.jobId,
      workerId: app.workerId,
      employerId: app.employerId,
      workerName: app.workerName,
      employerName: users.get(app.employerId)?.fullName || null,
      jobTitle: app.jobTitle,
      salary: null,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      startDate: req.body?.startDate ? String(req.body.startDate) : null,
      endDate: req.body?.endDate ? String(req.body.endDate) : null,
      status: 'draft',
      terms: req.body?.terms ? String(req.body.terms) : null,
      signedByWorker: false,
      signedByEmployer: false,
      workerSigned: false,
      employerSigned: false,
      adminApproved: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    contracts.set(id, c);
    res.json(c);
  });

  router.post('/contracts/to-worker/:workerId', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const worker = users.get(req.params.workerId);
    if (!worker) return res.status(404).json({ message: 'Ishchi topilmadi' });
    const id = `ctr_${randomUUID().slice(0, 8)}`;
    const c: StoredContract = {
      id,
      jobId: null,
      workerId: worker.id,
      employerId: auth.userId,
      workerName: worker.fullName,
      employerName: users.get(auth.userId)?.fullName || null,
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
    contracts.set(id, c);
    res.json(c);
  });

  router.patch('/contracts/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const c = contracts.get(req.params.id);
    if (!c) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(c, req.body || {}, { updatedAt: nowIso() });
    c.signedByWorker = Boolean(c.signedByWorker || c.workerSigned);
    c.workerSigned = c.signedByWorker;
    c.signedByEmployer = Boolean(c.signedByEmployer || c.employerSigned);
    c.employerSigned = c.signedByEmployer;
    res.json(c);
  });

  // --- REVIEWS ---
  router.get('/reviews', (req, res) => {
    const id = String(req.query.revieweeId || req.query.workerId || '');
    if (!id) return res.json([]);
    res.json(reviews.filter((r) => r.revieweeId === id));
  });

  router.post('/reviews', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const revieweeId = String(req.body?.revieweeId || '');
    const rating = Math.min(5, Math.max(1, Number(req.body?.rating || 5)));
    const review: StoredReview = {
      id: `rev_${randomUUID().slice(0, 8)}`,
      reviewerId: auth.userId,
      revieweeId,
      reviewerName: users.get(auth.userId)?.fullName || null,
      rating,
      comment: req.body?.comment ? String(req.body.comment) : null,
      contractId: req.body?.contractId ? String(req.body.contractId) : null,
      applicationId: req.body?.applicationId ? String(req.body.applicationId) : null,
      createdAt: nowIso(),
    };
    reviews.unshift(review);
    const target = users.get(revieweeId);
    if (target) {
      const nextCount = target.reviewCount + 1;
      target.rating = Math.round(((target.rating * target.reviewCount + rating) / nextCount) * 10) / 10;
      target.reviewCount = nextCount;
    }
    res.json(review);
  });

  // --- SAVED JOBS ---
  router.get('/saved-jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const target = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    res.json(savedJobs.filter((s) => s.userId === target).map((s) => ({ ...s, job: jobs.get(s.jobId) })));
  });

  router.post('/saved-jobs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    const row = { id: `sj_${randomUUID().slice(0, 8)}`, userId: auth.userId, jobId, createdAt: nowIso() };
    savedJobs.push(row);
    res.json(row);
  });

  router.post('/saved-jobs/delete', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const jobId = String(req.body?.jobId || '');
    for (let i = savedJobs.length - 1; i >= 0; i--) {
      if (savedJobs[i].userId === auth.userId && savedJobs[i].jobId === jobId) savedJobs.splice(i, 1);
    }
    res.json({ success: true });
  });

  // --- NOTIFICATIONS ---
  router.get('/notifications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const target = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    res.json(Array.from(notifications.values()).filter((n) => n.userId === target));
  });

  router.post('/notifications', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const n: StoredNotification = {
      id: `notif_${randomUUID().slice(0, 8)}`,
      userId: String(req.body?.userId || auth.userId),
      title: String(req.body?.title || 'Bildirishnoma'),
      message: String(req.body?.message || ''),
      type: String(req.body?.type || 'system'),
      read: false,
      link: req.body?.link ? String(req.body.link) : null,
      createdAt: nowIso(),
    };
    notifications.set(n.id, n);
    res.json(n);
  });

  router.patch('/notifications/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const n = notifications.get(req.params.id);
    if (!n) return res.status(404).json({ message: 'Topilmadi' });
    if (req.body?.read !== undefined) n.read = Boolean(req.body.read);
    res.json(n);
  });

  // --- CHAT ---
  router.get('/chat-messages/inbox', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const me = req.query.userId && isStaff(auth.role) ? String(req.query.userId) : auth.userId;
    const peers = new Map<string, { peerId: string; lastMessage: string; lastAt: string; unreadCount: number }>();
    for (const m of [...chatMessages].reverse()) {
      if (m.senderId !== me && m.receiverId !== me) continue;
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
        const u = users.get(p.peerId);
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
    res.json(
      chatMessages.filter(
        (m) => (m.senderId === userA && m.receiverId === userB) || (m.senderId === userB && m.receiverId === userA),
      ),
    );
  });

  router.post('/chat-messages', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const content = String(req.body?.content || req.body?.message || req.body?.text || '').trim();
    if (!content) return res.status(400).json({ message: 'Xabar bo\'sh' });
    const msg: StoredMessage = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      senderId: auth.userId,
      receiverId: String(req.body?.receiverId || ''),
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
    chatMessages.push(msg);
    res.json(msg);
  });

  router.patch('/chat-messages/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const m = chatMessages.find((item) => item.id === req.params.id);
    if (!m) return res.status(404).json({ message: 'Topilmadi' });
    if (req.body?.read !== undefined) m.read = Boolean(req.body.read);
    if (req.body?.status) m.status = String(req.body.status);
    res.json(m);
  });

  // --- DISPUTES ---
  router.get('/disputes', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(Array.from(disputes.values()));
  });

  router.post('/disputes', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const d: StoredDispute = {
      id: `dsp_${randomUUID().slice(0, 8)}`,
      contractId: String(req.body?.contractId || ''),
      openedById: auth.userId,
      reason: String(req.body?.reason || ''),
      status: 'pending',
      resolution: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    disputes.set(d.id, d);
    res.json(d);
  });

  router.patch('/disputes/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const d = disputes.get(req.params.id);
    if (!d) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(d, req.body || {}, { updatedAt: nowIso() });
    res.json(d);
  });

  // --- VERIFICATIONS ---
  router.get('/verification-requests', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const rows = Array.from(verifications.values()).filter((v) =>
      auth.role === 'super_admin' ? true : v.userId === auth.userId,
    );
    res.json(
      rows.map((v) => ({
        ...v,
        user: users.get(v.userId) ? sanitizeUser(users.get(v.userId)!, { includePrivate: auth.role === 'super_admin' }) : undefined,
      })),
    );
  });

  router.get('/verification-requests/mine', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const mine = Array.from(verifications.values()).find((v) => v.userId === auth.userId) || null;
    res.json(mine);
  });

  router.post('/verification-requests', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const user = users.get(auth.userId);
    const v: StoredVerification = {
      id: `ver_${randomUUID().slice(0, 8)}`,
      userId: auth.userId,
      userName: user?.fullName || null,
      accountType: user?.role === 'employer' ? 'employer' : 'worker',
      documentType: String(req.body?.documentType || 'passport'),
      documentUrl: String(req.body?.documentUrl || req.body?.idPhotoUrl || ''),
      idPhotoUrl: String(req.body?.idPhotoUrl || req.body?.documentUrl || ''),
      selfieUrl: String(req.body?.selfieUrl || ''),
      status: 'pending',
      reviewedBy: null,
      reviewNote: null,
      adminNotes: null,
      rejectionReason: null,
      approvedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    verifications.set(v.id, v);
    if (user) user.verificationStatus = 'pending';
    res.json(v);
  });

  router.patch('/verification-requests/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json();
    const v = verifications.get(req.params.id);
    if (!v) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(v, req.body || {}, { updatedAt: nowIso() });
    const u = users.get(v.userId);
    if (u && req.body?.status) {
      u.verificationStatus = String(req.body.status);
      u.isVerified = req.body.status === 'verified';
    }
    res.json(v);
  });

  router.post('/verification-requests/bulk', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const approve = req.body?.action === 'approve';
    let count = 0;
    for (const id of ids) {
      const v = verifications.get(id);
      if (!v) continue;
      v.status = approve ? 'verified' : 'rejected';
      v.updatedAt = nowIso();
      const u = users.get(v.userId);
      if (u) {
        u.verificationStatus = v.status;
        u.isVerified = approve;
      }
      count++;
    }
    res.json({ success: true, count });
  });

  // --- PAYMENTS / LOGS / SETTINGS ---
  router.get('/payments', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(payments);
  });
  router.post('/payments', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const item = { id: `pay_${randomUUID().slice(0, 8)}`, userId: auth.userId, ...(req.body || {}), createdAt: nowIso() };
    payments.unshift(item);
    res.json(item);
  });
  router.patch('/payments/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const item = payments.find((p) => p.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Topilmadi' });
    Object.assign(item, req.body || {});
    res.json(item);
  });

  router.post('/violations', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json({ id: `vio_${randomUUID().slice(0, 8)}`, ...(req.body || {}), createdAt: nowIso() });
  });

  router.get('/activity-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(activityLogs);
  });
  router.post('/activity-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = { id: `act_${randomUUID().slice(0, 8)}`, userId: auth.userId, ...(req.body || {}), createdAt: nowIso() };
    activityLogs.unshift(row);
    res.json(row);
  });

  router.get('/system-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(systemLogs);
  });
  router.post('/system-logs', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const row = { id: `log_${randomUUID().slice(0, 8)}`, userId: auth.userId, ...(req.body || {}), createdAt: nowIso() };
    systemLogs.unshift(row);
    res.json(row);
  });

  router.get('/settings/global', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(globalSettings);
  });
  router.patch('/settings/global', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    globalSettings = { ...globalSettings, ...(req.body || {}), updatedBy: auth.userId, updatedAt: nowIso() };
    res.json(globalSettings);
  });

  // --- ADMIN USERS & SUBSCRIPTION & EXPORT ---
  router.get('/admin/users', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    const staff = Array.from(users.values())
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

  router.post('/admin/users', async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    const phone = normalizePhone(String(req.body?.phone || ''));
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Parol kamida 8 ta belgi' });
    const id = `staff_${randomUUID().slice(0, 8)}`;
    const role = req.body?.role === 'super_admin' ? 'super_admin' : 'admin';
    const user = makeUser({
      id,
      fullName: String(req.body?.fullName || 'Admin'),
      phoneNumber: phone,
      email: req.body?.email ? String(req.body.email) : `${phone.replace(/\D/g, '')}@mexrliqollar.uz`,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      isVerified: true,
      verificationStatus: 'verified',
    });
    users.set(id, user);
    res.json({ uid: user.id, fullName: user.fullName, firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber, role: user.role, isVerified: user.isVerified, isBlocked: user.isBlocked, createdAt: user.createdAt });
  });

  router.patch('/admin/users/:id/password', async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    const user = users.get(req.params.id);
    if (!user) return res.status(404).json();
    user.passwordHash = await bcrypt.hash(String(req.body?.password || ''), 10);
    res.json({ success: true });
  });

  router.delete('/admin/users/:id', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.role !== 'super_admin') return res.status(403).json();
    users.delete(req.params.id);
    res.json({ success: true });
  });

  router.get('/admin/export/users', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (!isStaff(auth.role)) return res.status(403).json();
    const header = 'ID,FullName,Role,Region,District,Phone,Verified\n';
    const rows = Array.from(users.values())
      .map((u) => [u.id, `"${u.fullName.replace(/"/g, '""')}"`, u.role, u.region, u.district || '', u.phoneNumber || '', u.isVerified].join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
    res.send(header + rows);
  });

  router.get('/admin/subscription/status', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(subscriptionState);
  });

  router.post('/admin/subscription/price', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    subscriptionState.priceSom = Number(req.body?.priceSom || subscriptionState.priceSom);
    res.json(subscriptionState);
  });

  router.post('/admin/subscription/pay', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json({ cardNumber: process.env.PAYMENT_CARD_NUMBER || '8600 **** **** 0000', amount: subscriptionState.priceSom });
  });

  router.post('/admin/subscription/paid', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json({ sent: true, maskedPhone: '+998 90 *** ** 81', expiresInMs: 300000 });
  });

  router.post('/admin/subscription/verify-otp', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    subscriptionState.status = 'active';
    subscriptionState.blocked = false;
    subscriptionState.lastPaymentAt = nowIso();
    res.json(subscriptionState);
  });

  // --- AI ENDPOINTS ---
  router.get('/ai/status', (_req, res) => {
    res.json({ live: false, provider: 'mock' });
  });

  router.post('/ai/employer/vacancy', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const title = String(req.body?.title || req.body?.category || 'Vakansiya');
    const desc = String(req.body?.description || `${title} bo'yicha mas'uliyatli xodim talab qilinadi.`);
    res.json({
      text: `**${title}**\n\n${desc}\n\nVazifalar:\n- Belgilangan ishlarni sifatli va o'z vaqtida bajarish\n\nTaklif:\n- Qulay ish sharoiti va o'z vaqtida to'lov`,
      provider: 'mock',
    });
  });

  router.post('/ai/employer/match', (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const workers = Array.from(users.values())
      .filter((u) => u.role === 'worker' && !u.isBlocked)
      .slice(0, Number(req.body?.limit || 10))
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
    res.json({
      text: 'Maslahat xulosa (yakuniy qarorni inson qabul qiladi):\nYuqori darajadagi xavf aniqlanmadi.',
      provider: 'mock',
      advisory: true,
    });
  });

  // --- UPLOADS (lightweight in-memory handler) ---
  router.post('/uploads', express.raw({ type: '*/*', limit: '12mb' }), (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const filename = `file-${Date.now()}-${randomUUID().slice(0, 8)}.bin`;
    const key = `${auth.userId}/${filename}`;
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    uploadedBlobs.set(key, {
      buffer: buf,
      mimeType: String(req.headers['content-type'] || 'application/octet-stream'),
      originalName: filename,
    });
    res.json({
      success: true,
      url: `/api/uploads/private/${key}`,
      filename,
      originalName: filename,
      mimeType: 'application/octet-stream',
      size: buf.length,
      kind: 'file',
    });
  });

  router.get('/uploads/private/:userId/:filename', (req, res) => {
    const key = `${req.params.userId}/${req.params.filename}`;
    const item = uploadedBlobs.get(key);
    if (!item) return res.status(404).json({ message: 'Fayl topilmadi' });
    res.setHeader('Content-Type', item.mimeType);
    res.send(item.buffer);
  });

  return router;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use('/api', buildApiRouter());

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

void startServer();
