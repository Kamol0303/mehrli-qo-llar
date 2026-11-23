import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type UserRole = 'worker' | 'employer' | 'admin' | 'super_admin';

export interface StoredUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  telegramId?: string | null;
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
  sessionValidAfter: string | null;
  createdAt: string;
  updatedAt: string;
  lastActive: string;
}

export interface StoredJob {
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

export interface StoredServicePost {
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

export interface StoredApplication {
  id: string;
  jobId: string;
  workerId: string;
  employerId: string;
  workerName: string | null;
  jobTitle: string | null;
  message: string | null;
  coverLetter: string | null;
  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'withdrawn'
    | 'completed'
    | 'on_the_way'
    | 'started'
    | 'cancelled'
    | 'disputed'
    | 'matching'
    | 'offer_sent';
  acceptedAt: string | null;
  completedAt: string | null;
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredContract {
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

export interface StoredNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

export interface StoredMessage {
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

export interface StoredReview {
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

export interface StoredSavedJob {
  id: string;
  userId: string;
  jobId: string;
  createdAt: string;
}

export interface StoredDispute {
  id: string;
  contractId: string;
  openedById: string;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredVerification {
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

export interface StoredUpload {
  key: string;
  userId: string;
  filename: string;
  mimeType: string;
  originalName: string;
  data: Buffer;
  createdAt: string;
}

export interface StoredAuthNonce {
  nonce: string;
  state: string | null;
  codeVerifier: string | null;
  payload: Record<string, unknown> | null;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export const nowIso = () => new Date().toISOString();

export function normalizePhone(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  const trimmed = (input || '').trim();
  return trimmed.startsWith('+') ? trimmed : digits ? `+${digits}` : '';
}

export function normalizeEmail(input: string): string {
  return (input || '').trim().toLowerCase();
}

export function splitName(fullName: string): { firstName: string; lastName: string; fullName: string } {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    fullName: cleaned || 'Foydalanuvchi',
  };
}

export function makeUser(
  partial: Partial<StoredUser> & { id: string; fullName: string; role: UserRole },
): StoredUser {
  const split = splitName(partial.fullName);
  const ts = nowIso();
  return {
    email: null,
    phoneNumber: null,
    telegramId: null,
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
    languages: ["O'zbek"],
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
    sessionValidAfter: null,
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
  if (s.includes("qo'shrabot") || s.includes('qoshrabot')) return 'qoshrabot';
  if (s.includes('toyloq')) return 'toyloq';
  return 'samarkand_city';
}

const DEFAULT_DB_PATH = resolve(process.cwd(), process.env.SQLITE_DB_PATH || 'data/mehrli_qollar.db');

export class AppDatabase {
  public readonly sqlite: DatabaseSync;
  public readonly dbPath: string;

  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    this.sqlite = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema() {
    this.sqlite.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        phone_number TEXT UNIQUE,
        password_hash TEXT,
        full_name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        role TEXT NOT NULL CHECK(role IN ('worker','employer','admin','super_admin')),
        region TEXT NOT NULL DEFAULT 'Samarqand viloyati',
        district TEXT,
        is_verified INTEGER NOT NULL DEFAULT 0,
        verification_status TEXT NOT NULL DEFAULT 'none',
        is_blocked INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0,
        completed_jobs INTEGER NOT NULL DEFAULT 0,
        session_valid_after TEXT,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_region_district ON users(region, district);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        employer_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        region TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

      CREATE TABLE IF NOT EXISTS service_posts (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_service_posts_worker ON service_posts(worker_id);

      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        employer_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
      CREATE INDEX IF NOT EXISTS idx_applications_worker ON applications(worker_id);
      CREATE INDEX IF NOT EXISTS idx_applications_employer ON applications(employer_id);

      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        worker_id TEXT NOT NULL,
        employer_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_contracts_worker ON contracts(worker_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_employer ON contracts(employer_id);

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        reviewer_id TEXT NOT NULL,
        reviewee_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);

      CREATE TABLE IF NOT EXISTS saved_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON saved_jobs(user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(sender_id, receiver_id);

      CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        opened_by_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verification_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verifications_user ON verification_requests(user_id);

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS uploads (
        key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        original_name TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kv_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_nonces (
        nonce TEXT PRIMARY KEY,
        state TEXT UNIQUE,
        code_verifier TEXT,
        payload_json TEXT,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_nonces_state ON auth_nonces(state);
      CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);
    `);

    // Non-breaking column migration for existing SQLite databases
    const userCols = this.sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name?: string }>;
    const hasTelegramId = userCols.some((c) => c.name === 'telegram_id');
    if (!hasTelegramId) {
      this.sqlite.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
    }
    this.sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL',
    );
  }

  private rowToUser(row: Record<string, unknown> | undefined): StoredUser | null {
    if (!row) return null;
    const parsed = JSON.parse(String(row.profile_json)) as StoredUser;
    return {
      ...parsed,
      id: String(row.id),
      email: row.email == null ? null : String(row.email),
      phoneNumber: row.phone_number == null ? null : String(row.phone_number),
      telegramId: row.telegram_id == null ? (parsed.telegramId ?? null) : String(row.telegram_id),
      passwordHash: row.password_hash == null ? null : String(row.password_hash),
      fullName: String(row.full_name),
      firstName: row.first_name == null ? null : String(row.first_name),
      lastName: row.last_name == null ? null : String(row.last_name),
      role: String(row.role) as UserRole,
      region: String(row.region ?? ''),
      district: row.district == null ? null : String(row.district),
      isVerified: Boolean(row.is_verified),
      verificationStatus: String(row.verification_status ?? 'none'),
      isBlocked: Boolean(row.is_blocked),
      rating: Number(row.rating ?? 0),
      reviewCount: Number(row.review_count ?? 0),
      completedJobs: Number(row.completed_jobs ?? 0),
      sessionValidAfter: row.session_valid_after == null ? null : String(row.session_valid_after),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  upsertUser(user: StoredUser): StoredUser {
    const email = user.email ? normalizeEmail(user.email) : null;
    const phone = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;
    const telegramId = user.telegramId ? String(user.telegramId).trim() : null;
    const normalized: StoredUser = {
      ...user,
      email: email || null,
      phoneNumber: phone || null,
      telegramId: telegramId || null,
      updatedAt: user.updatedAt || nowIso(),
    };
    const { passwordHash: _ignoredInJson, ...profileWithoutHash } = normalized;
    this.sqlite
      .prepare(
        `INSERT INTO users (
          id, email, phone_number, telegram_id, password_hash, full_name, first_name, last_name,
          role, region, district, is_verified, verification_status, is_blocked,
          rating, review_count, completed_jobs, session_valid_after, profile_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          phone_number = excluded.phone_number,
          telegram_id = excluded.telegram_id,
          password_hash = excluded.password_hash,
          full_name = excluded.full_name,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          role = excluded.role,
          region = excluded.region,
          district = excluded.district,
          is_verified = excluded.is_verified,
          verification_status = excluded.verification_status,
          is_blocked = excluded.is_blocked,
          rating = excluded.rating,
          review_count = excluded.review_count,
          completed_jobs = excluded.completed_jobs,
          session_valid_after = excluded.session_valid_after,
          profile_json = excluded.profile_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        normalized.id,
        normalized.email,
        normalized.phoneNumber,
        normalized.telegramId,
        normalized.passwordHash,
        normalized.fullName,
        normalized.firstName,
        normalized.lastName,
        normalized.role,
        normalized.region,
        normalized.district,
        normalized.isVerified ? 1 : 0,
        normalized.verificationStatus,
        normalized.isBlocked ? 1 : 0,
        normalized.rating,
        normalized.reviewCount,
        normalized.completedJobs,
        normalized.sessionValidAfter,
        JSON.stringify(profileWithoutHash),
        normalized.createdAt,
        normalized.updatedAt,
      );
    return normalized;
  }

  getUserById(id: string): StoredUser | null {
    const row = this.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return this.rowToUser(row);
  }

  getUserByEmail(email: string): StoredUser | null {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const row = this.sqlite.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalized) as
      | Record<string, unknown>
      | undefined;
    return this.rowToUser(row);
  }

  getUserByPhone(phone: string): StoredUser | null {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const row = this.sqlite
      .prepare('SELECT * FROM users WHERE phone_number = ? OR phone_number = ?')
      .get(normalized, phone.trim()) as Record<string, unknown> | undefined;
    return this.rowToUser(row);
  }

  getUserByTelegramId(telegramId: string): StoredUser | null {
    const clean = String(telegramId || '').trim();
    if (!clean) return null;
    const row = this.sqlite
      .prepare('SELECT * FROM users WHERE telegram_id = ?')
      .get(clean) as Record<string, unknown> | undefined;
    return this.rowToUser(row);
  }

  // --- AUTH NONCES (Single-use Telegram OIDC replay protection) ---
  createAuthNonce(input: {
    nonce: string;
    state?: string | null;
    codeVerifier?: string | null;
    payload?: Record<string, unknown> | null;
    ttlMs?: number;
  }): StoredAuthNonce {
    const now = nowIso();
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? 10 * 60_000)).toISOString();
    // Prune expired or used records periodically
    this.sqlite.prepare('DELETE FROM auth_nonces WHERE expires_at <= ? OR used = 1').run(now);
    this.sqlite
      .prepare(
        `INSERT INTO auth_nonces (nonce, state, code_verifier, payload_json, expires_at, used, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        input.nonce,
        input.state ?? null,
        input.codeVerifier ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        expiresAt,
        now,
      );
    return {
      nonce: input.nonce,
      state: input.state ?? null,
      codeVerifier: input.codeVerifier ?? null,
      payload: input.payload ?? null,
      expiresAt,
      used: false,
      createdAt: now,
    };
  }

  private mapNonceRow(row: Record<string, unknown> | undefined): StoredAuthNonce | null {
    if (!row) return null;
    let payload: Record<string, unknown> | null = null;
    if (row.payload_json) {
      try {
        payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }
    return {
      nonce: String(row.nonce),
      state: row.state == null ? null : String(row.state),
      codeVerifier: row.code_verifier == null ? null : String(row.code_verifier),
      payload,
      expiresAt: String(row.expires_at),
      used: Boolean(row.used),
      createdAt: String(row.created_at),
    };
  }

  consumeAuthNonceByNonce(nonce: string): StoredAuthNonce | null {
    const clean = String(nonce || '').trim();
    if (!clean) return null;
    const now = nowIso();
    const row = this.sqlite
      .prepare('SELECT * FROM auth_nonces WHERE nonce = ? AND used = 0 AND expires_at > ?')
      .get(clean, now) as Record<string, unknown> | undefined;
    if (!row) return null;
    const res = this.sqlite
      .prepare('UPDATE auth_nonces SET used = 1 WHERE nonce = ? AND used = 0 AND expires_at > ?')
      .run(clean, now);
    if (!res.changes) return null;
    return this.mapNonceRow(row);
  }

  consumeAuthNonceByState(state: string): StoredAuthNonce | null {
    const clean = String(state || '').trim();
    if (!clean) return null;
    const now = nowIso();
    const row = this.sqlite
      .prepare('SELECT * FROM auth_nonces WHERE state = ? AND used = 0 AND expires_at > ?')
      .get(clean, now) as Record<string, unknown> | undefined;
    if (!row) return null;
    const res = this.sqlite
      .prepare('UPDATE auth_nonces SET used = 1 WHERE state = ? AND used = 0 AND expires_at > ?')
      .run(clean, now);
    if (!res.changes) return null;
    return this.mapNonceRow(row);
  }

  findUserByIdentifier(identifier: string): StoredUser | null {
    const trimmed = (identifier || '').trim();
    if (!trimmed) return null;
    if (trimmed.includes('@')) {
      return this.getUserByEmail(trimmed);
    }
    return this.getUserByPhone(trimmed) || this.getUserByEmail(trimmed);
  }

  listUsers(): StoredUser[] {
    const rows = this.sqlite.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.rowToUser(r)!).filter(Boolean);
  }

  deleteUser(id: string): void {
    this.sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  // --- JOBS ---
  upsertJob(job: StoredJob): StoredJob {
    this.sqlite
      .prepare(
        `INSERT INTO jobs (id, employer_id, status, region, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           region = excluded.region,
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(job.id, job.employerId, job.status, job.region, JSON.stringify(job), job.createdAt, job.updatedAt);
    return job;
  }

  getJob(id: string): StoredJob | null {
    const row = this.sqlite.prepare('SELECT data_json FROM jobs WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredJob) : null;
  }

  listJobs(): StoredJob[] {
    const rows = this.sqlite.prepare('SELECT data_json FROM jobs ORDER BY created_at DESC').all() as Array<{
      data_json: string;
    }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredJob);
  }

  // --- SERVICE POSTS ---
  upsertServicePost(post: StoredServicePost): StoredServicePost {
    this.sqlite
      .prepare(
        `INSERT INTO service_posts (id, worker_id, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(post.id, post.workerId, post.status, JSON.stringify(post), post.createdAt, post.updatedAt);
    return post;
  }

  getServicePost(id: string): StoredServicePost | null {
    const row = this.sqlite.prepare('SELECT data_json FROM service_posts WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredServicePost) : null;
  }

  listServicePosts(): StoredServicePost[] {
    const rows = this.sqlite.prepare('SELECT data_json FROM service_posts ORDER BY created_at DESC').all() as Array<{
      data_json: string;
    }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredServicePost);
  }

  // --- APPLICATIONS ---
  upsertApplication(app: StoredApplication): StoredApplication {
    this.sqlite
      .prepare(
        `INSERT INTO applications (id, job_id, worker_id, employer_id, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(app.id, app.jobId, app.workerId, app.employerId, app.status, JSON.stringify(app), app.createdAt, app.updatedAt);
    return app;
  }

  getApplication(id: string): StoredApplication | null {
    const row = this.sqlite.prepare('SELECT data_json FROM applications WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredApplication) : null;
  }

  listApplications(): StoredApplication[] {
    const rows = this.sqlite.prepare('SELECT data_json FROM applications ORDER BY created_at DESC').all() as Array<{
      data_json: string;
    }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredApplication);
  }

  // --- CONTRACTS ---
  upsertContract(c: StoredContract): StoredContract {
    this.sqlite
      .prepare(
        `INSERT INTO contracts (id, job_id, worker_id, employer_id, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(c.id, c.jobId, c.workerId, c.employerId, c.status, JSON.stringify(c), c.createdAt, c.updatedAt);
    return c;
  }

  getContract(id: string): StoredContract | null {
    const row = this.sqlite.prepare('SELECT data_json FROM contracts WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredContract) : null;
  }

  listContracts(): StoredContract[] {
    const rows = this.sqlite.prepare('SELECT data_json FROM contracts ORDER BY created_at DESC').all() as Array<{
      data_json: string;
    }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredContract);
  }

  // --- REVIEWS ---
  insertReview(r: StoredReview): StoredReview {
    this.sqlite
      .prepare('INSERT INTO reviews (id, reviewer_id, reviewee_id, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(r.id, r.reviewerId, r.revieweeId, JSON.stringify(r), r.createdAt);
    return r;
  }

  listReviewsFor(revieweeId: string): StoredReview[] {
    const rows = this.sqlite
      .prepare('SELECT data_json FROM reviews WHERE reviewee_id = ? ORDER BY created_at DESC')
      .all(revieweeId) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredReview);
  }

  // --- SAVED JOBS ---
  listSavedJobs(userId: string): StoredSavedJob[] {
    const rows = this.sqlite
      .prepare('SELECT id, user_id, job_id, created_at FROM saved_jobs WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{ id: string; user_id: string; job_id: string; created_at: string }>;
    return rows.map((r) => ({ id: r.id, userId: r.user_id, jobId: r.job_id, createdAt: r.created_at }));
  }

  addSavedJob(row: StoredSavedJob): StoredSavedJob {
    this.sqlite
      .prepare('INSERT OR IGNORE INTO saved_jobs (id, user_id, job_id, created_at) VALUES (?, ?, ?, ?)')
      .run(row.id, row.userId, row.jobId, row.createdAt);
    return row;
  }

  removeSavedJob(userId: string, jobId: string): void {
    this.sqlite.prepare('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?').run(userId, jobId);
  }

  // --- NOTIFICATIONS ---
  upsertNotification(n: StoredNotification): StoredNotification {
    this.sqlite
      .prepare(
        `INSERT INTO notifications (id, user_id, read, data_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET read = excluded.read, data_json = excluded.data_json`,
      )
      .run(n.id, n.userId, n.read ? 1 : 0, JSON.stringify(n), n.createdAt);
    return n;
  }

  getNotification(id: string): StoredNotification | null {
    const row = this.sqlite.prepare('SELECT data_json FROM notifications WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredNotification) : null;
  }

  listNotifications(userId: string): StoredNotification[] {
    const rows = this.sqlite
      .prepare('SELECT data_json FROM notifications WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredNotification);
  }

  // --- CHAT MESSAGES ---
  upsertMessage(m: StoredMessage): StoredMessage {
    this.sqlite
      .prepare(
        `INSERT INTO chat_messages (id, sender_id, receiver_id, data_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`,
      )
      .run(m.id, m.senderId, m.receiverId, JSON.stringify(m), m.createdAt);
    return m;
  }

  getMessage(id: string): StoredMessage | null {
    const row = this.sqlite.prepare('SELECT data_json FROM chat_messages WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredMessage) : null;
  }

  listMessagesForUser(userId: string): StoredMessage[] {
    const rows = this.sqlite
      .prepare('SELECT data_json FROM chat_messages WHERE sender_id = ? OR receiver_id = ? ORDER BY created_at ASC')
      .all(userId, userId) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredMessage);
  }

  listMessagesBetween(userA: string, userB: string): StoredMessage[] {
    const rows = this.sqlite
      .prepare(
        `SELECT data_json FROM chat_messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at ASC`,
      )
      .all(userA, userB, userB, userA) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredMessage);
  }

  // --- DISPUTES ---
  upsertDispute(d: StoredDispute): StoredDispute {
    this.sqlite
      .prepare(
        `INSERT INTO disputes (id, contract_id, opened_by_id, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json, updated_at = excluded.updated_at`,
      )
      .run(d.id, d.contractId, d.openedById, d.status, JSON.stringify(d), d.createdAt, d.updatedAt);
    return d;
  }

  getDispute(id: string): StoredDispute | null {
    const row = this.sqlite.prepare('SELECT data_json FROM disputes WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredDispute) : null;
  }

  listDisputes(): StoredDispute[] {
    const rows = this.sqlite.prepare('SELECT data_json FROM disputes ORDER BY created_at DESC').all() as Array<{
      data_json: string;
    }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredDispute);
  }

  // --- VERIFICATIONS ---
  upsertVerification(v: StoredVerification): StoredVerification {
    this.sqlite
      .prepare(
        `INSERT INTO verification_requests (id, user_id, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, data_json = excluded.data_json, updated_at = excluded.updated_at`,
      )
      .run(v.id, v.userId, v.status, JSON.stringify(v), v.createdAt, v.updatedAt);
    return v;
  }

  getVerification(id: string): StoredVerification | null {
    const row = this.sqlite.prepare('SELECT data_json FROM verification_requests WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as StoredVerification) : null;
  }

  listVerifications(): StoredVerification[] {
    const rows = this.sqlite
      .prepare('SELECT data_json FROM verification_requests ORDER BY created_at DESC')
      .all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as StoredVerification);
  }

  // --- PAYMENTS & LOGS ---
  upsertPayment(id: string, userId: string, item: Record<string, unknown>, createdAt: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO payments (id, user_id, data_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`,
      )
      .run(id, userId, JSON.stringify(item), createdAt);
  }

  getPayment(id: string): Record<string, unknown> | null {
    const row = this.sqlite.prepare('SELECT data_json FROM payments WHERE id = ?').get(id) as
      | { data_json?: string }
      | undefined;
    return row?.data_json ? (JSON.parse(row.data_json) as Record<string, unknown>) : null;
  }

  listPayments(userId?: string): Array<Record<string, unknown>> {
    const rows = userId
      ? (this.sqlite
          .prepare('SELECT data_json FROM payments WHERE user_id = ? ORDER BY created_at DESC')
          .all(userId) as Array<{ data_json: string }>)
      : (this.sqlite.prepare('SELECT data_json FROM payments ORDER BY created_at DESC').all() as Array<{
          data_json: string;
        }>);
    return rows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
  }

  insertActivityLog(id: string, userId: string | null, item: Record<string, unknown>, createdAt: string): void {
    this.sqlite
      .prepare('INSERT INTO activity_logs (id, user_id, data_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, JSON.stringify(item), createdAt);
  }

  listActivityLogs(userId?: string): Array<Record<string, unknown>> {
    const rows = userId
      ? (this.sqlite
          .prepare('SELECT data_json FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
          .all(userId) as Array<{ data_json: string }>)
      : (this.sqlite
          .prepare('SELECT data_json FROM activity_logs ORDER BY created_at DESC LIMIT 200')
          .all() as Array<{ data_json: string }>);
    return rows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
  }

  insertSystemLog(id: string, userId: string | null, item: Record<string, unknown>, createdAt: string): void {
    this.sqlite
      .prepare('INSERT INTO system_logs (id, user_id, data_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, JSON.stringify(item), createdAt);
  }

  listSystemLogs(): Array<Record<string, unknown>> {
    const rows = this.sqlite
      .prepare('SELECT data_json FROM system_logs ORDER BY created_at DESC LIMIT 200')
      .all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as Record<string, unknown>);
  }

  // --- UPLOADS ---
  saveUpload(upload: StoredUpload): void {
    this.sqlite
      .prepare(
        `INSERT OR REPLACE INTO uploads (key, user_id, filename, mime_type, original_name, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        upload.key,
        upload.userId,
        upload.filename,
        upload.mimeType,
        upload.originalName,
        upload.data,
        upload.createdAt,
      );
  }

  getUpload(key: string): StoredUpload | null {
    const row = this.sqlite
      .prepare('SELECT key, user_id, filename, mime_type, original_name, data, created_at FROM uploads WHERE key = ?')
      .get(key) as
      | {
          key: string;
          user_id: string;
          filename: string;
          mime_type: string;
          original_name: string;
          data: Uint8Array;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      key: row.key,
      userId: row.user_id,
      filename: row.filename,
      mimeType: row.mime_type,
      originalName: row.original_name,
      data: Buffer.from(row.data),
      createdAt: row.created_at,
    };
  }

  // --- KV SETTINGS ---
  getSetting<T>(key: string, fallback: T): T {
    const row = this.sqlite.prepare('SELECT value_json FROM kv_settings WHERE key = ?').get(key) as
      | { value_json?: string }
      | undefined;
    if (!row?.value_json) return fallback;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  setSetting(key: string, value: unknown): void {
    this.sqlite
      .prepare(
        `INSERT INTO kv_settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), nowIso());
  }

  private seedIfEmpty() {
    const row = this.sqlite.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt?: number } | undefined;
    if ((row?.cnt ?? 0) > 0) return;

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
            email: p.email ? normalizeEmail(String(p.email)) : null,
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
          this.upsertUser(user);

          const postId = `sp_${id}`;
          this.upsertServicePost({
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
    this.upsertUser(emp1);
    this.upsertUser(emp2);

    const sampleJobs: StoredJob[] = [
      {
        id: 'job_001',
        title: 'Tajribali tikuvchi kerak',
        description:
          'Milliy va zamonaviy liboslar tikish uchun tajribali tikuvchi ayol kerak. Qulay sharoit va o‘z vaqtida maosh.',
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
        description:
          '3 yoshli qizaloqqa kunduzgi vaqtda qarash, ovqatlantirish va mashg‘ulotlar o‘tkazish.',
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
    sampleJobs.forEach((j) => this.upsertJob(j));
  }

  close(): void {
    this.sqlite.close();
  }
}
