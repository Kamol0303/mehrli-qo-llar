import type {
  AvailabilityStatus,
  PreferredContact,
  ResumeTemplateId,
  EducationRecord,
  ExperienceRecord,
  CertificateRecord,
  PortfolioItem,
  RecruiterContact,
  CompanyDocument,
} from './profile';
import type { WorkerPersonalInfo } from './personalInfo';
import type { WorkerCoreIndicators } from './coreIndicators';

export type {
  AvailabilityStatus,
  PreferredContact,
  ResumeTemplateId,
  EducationRecord,
  ExperienceRecord,
  CertificateRecord,
  PortfolioItem,
  RecruiterContact,
  CompanyDocument,
  ProfileTab,
} from './profile';

export type {
  WorkerPersonalInfo,
  Gender,
  MaritalStatus,
  ChildrenStatus,
} from './personalInfo';

export type { WorkerCoreIndicators, IndicatorLevel } from './coreIndicators';

export {
  PERSONAL_INFO_REQUIRED,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  CHILDREN_OPTIONS,
  calcAgeFromDob,
} from './personalInfo';

export {
  CORE_INDICATOR_FIELDS,
  RISK_LEVEL_OPTIONS,
  riskTone,
  riskLabel,
} from './coreIndicators';

export interface Profile {
  uid: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string | Date;
  locationSharingEnabled?: boolean;
  phoneNumber?: string;
  passwordHash?: string;
  hasPin?: boolean;
  role: 'worker' | 'employer' | 'admin' | 'super_admin';
  region: string;
  district?: string;
  neighborhood?: string;
  bio?: string;
  /** Confidential — only populated for worker self or super_admin */
  personalInfo?: WorkerPersonalInfo;
  /** Core risk / development indicators */
  coreIndicators?: WorkerCoreIndicators;
  skills?: string[];
  /** Worker's main specialty/profession (category id) */
  profession?: string;
  /** Worker's education level: secondary | vocational | bachelor | master | phd | other */
  educationLevel?: string;
  photoUrl?: string;
  coverUrl?: string;
  telegram?: string;
  languages?: string[];
  availability?: AvailabilityStatus | string;
  lookingForWork?: boolean;
  professionalSummary?: string;
  preferredContact?: PreferredContact | string;
  experienceLevel?: 'beginner' | 'intermediate' | 'expert' | string;
  isPremium?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  lastActive?: string | Date;
  isVerified?: boolean;
  verificationStatus?: 'none' | 'pending' | 'under_review' | 'verified' | 'rejected' | 'need_reupload';
  rating?: number;
  reviewCount?: number;
  completedJobs?: number;
  education?: EducationRecord[];
  experience?: ExperienceRecord[];
  certificates?: CertificateRecord[];
  portfolio?: PortfolioItem[];
  resumeTemplate?: ResumeTemplateId | string;
  companyName?: string;
  businessType?: string;
  industry?: string;
  registrationNumber?: string;
  tin?: string;
  website?: string;
  foundedYear?: string;
  employeeCount?: string;
  officeAddress?: string;
  companyGallery?: PortfolioItem[];
  companyDocuments?: CompanyDocument[];
  recruiterContacts?: RecruiterContact[];
  violationCount?: number;
  riskScore?: number;
  lastViolation?: string | Date;
  isBlocked?: boolean;
  blockUntil?: string | Date;
  blockReason?: string;
  blockedAt?: string | Date;
  trustScore?: number;
  behaviorFlags?: string[];
  hasTelegram?: boolean;
  onboardingCompleted?: boolean;
  permissionsAcknowledged?: boolean;
}

export interface Job {
  id: string;
  title: string;
  description?: string;
  employerId: string;
  employerName?: string;
  category?: string;
  region?: string;
  district?: string;
  neighborhood?: string;
  salary?: number;
  price?: number;
  salaryType?: 'hourly' | 'daily' | 'monthly' | 'fixed';
  workType?: string;
  scheduledAt?: string | Date;
  status?: 'active' | 'closed' | 'draft' | 'open';
  isPromoted?: boolean;
  requirements?: string[];
  images?: string[];
  createdAt?: any;
  updatedAt?: any;
  distanceKm?: number;
  distanceLabel?: string;
  matchScore?: number;
}

export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  employerId: string;
  workerName?: string;
  employerName?: string;
  jobTitle?: string;
  message?: string;
  coverLetter?: string;
  status?:
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
  acceptedAt?: any;
  completedAt?: any;
  reviewed?: boolean;
  employerReviewed?: boolean;
  workerReviewed?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Contract {
  id: string;
  jobId?: string;
  workerId: string;
  employerId: string;
  workerName?: string;
  employerName?: string;
  jobTitle?: string;
  salary?: number;
  amount?: number;
  startDate?: any;
  endDate?: any;
  status?: 'draft' | 'active' | 'completed' | 'cancelled' | 'disputed' | 'signed';
  terms?: string;
  signedByWorker?: boolean;
  signedByEmployer?: boolean;
  workerSigned?: boolean;
  employerSigned?: boolean;
  adminApproved?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface Dispute {
  id: string;
  contractId: string;
  openedById: string;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
  resolution?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'application' | 'contract' | 'message' | 'dispute' | 'system';
  read: boolean;
  link?: string;
  createdAt?: any;
}

export type VerificationRequestStatus =
  | 'none'
  | 'pending'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'need_reupload'
  | 'approved'; // legacy alias

export interface PassportData {
  series: string;
  number: string;
  pinfl: string;
  fullName: string;
  /** Legacy fields kept optional so older verification records still render. */
  issueDate?: string;
  expiryDate?: string;
}

export interface DocumentCheckResult {
  ok?: boolean;
  role?: string;
  mimeGuess?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  score?: number;
  checks?: Array<{ id: string; passed: boolean; detail: string }>;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  userName?: string;
  accountType?: 'worker' | 'employer' | string;
  documentType?: string;
  documentUrl?: string;
  idPhotoUrl?: string;
  selfieUrl?: string;
  addressProofUrl?: string;
  additionalFiles?: Array<{ url: string; title?: string }>;
  passportData?: PassportData | null;
  documentChecks?: DocumentCheckResult | Record<string, unknown> | null;
  status: VerificationRequestStatus;
  reviewedBy?: string;
  reviewNote?: string;
  adminNotes?: string;
  rejectionReason?: string;
  approvedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: Partial<Profile>;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content?: string;
  message?: string;
  text?: string;
  read?: boolean;
  delivered?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  jobId?: string;
  contractId?: string;
  participants?: string[];
  createdAt?: any;
}

export interface ChatThread {
  peerId: string;
  peerName?: string;
  peerRole?: string;
  peerPhotoUrl?: string;
  lastMessage?: string;
  lastAt?: string | Date;
  unreadCount?: number;
}

export interface EmploymentStat {
  id: string;
  region: string;
  count: number;
  category?: string;
  month?: string;
  year?: number;
}

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  reviewerName?: string;
  rating: number;
  comment?: string;
  contractId?: string;
  applicationId?: string;
  createdAt?: any;
}

export interface ServicePost {
  id: string;
  workerId: string;
  workerName?: string;
  title: string;
  description?: string;
  category?: string;
  price?: number;
  expectedPrice?: number;
  priceType?: 'hourly' | 'daily' | 'fixed';
  region?: string;
  district?: string;
  images?: string[];
  isActive?: boolean;
  status?: 'active' | 'inactive' | 'pending';
  createdAt?: any;
  updatedAt?: any;
}

export type YandexServiceType =
  | 'childcare'
  | 'house_cleaning'
  | 'hotel_cleaning'
  | 'postpartum_care'
  | 'elder_care'
  | 'other';

export type YandexDurationType = 'hourly' | 'half_day' | 'full_day';

export type OrderLifecycleStatus =
  | 'qidirilmoqda'
  | 'taklif_yuborildi'
  | 'qabul_qilindi'
  | 'yolda'
  | 'yetib_keldi'
  | 'jarayonda'
  | 'yakunlandi'
  | 'bekor_qilindi';

export interface TariffRate {
  id: string;
  serviceType: YandexServiceType;
  durationType: YandexDurationType;
  rateSom: number;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface NearbyAnonWorker {
  anonId: string;
  lat: number;
  lng: number;
  approxRadiusMeters: number;
  rating: number;
  completedJobs: number;
  isVerified: boolean;
}

export interface YandexOrder {
  id: string;
  employerId: string;
  employerName?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  contractId?: string | null;
  serviceType: YandexServiceType;
  durationType: YandexDurationType;
  paymentMethod: 'cash' | 'card_soon';
  recommendedRate: number;
  agreedRate: number;
  status: OrderLifecycleStatus;
  currentRadiusKm: number;
  searchStep: number;
  contractSigned: boolean;
  employerRated: boolean;
  workerRated: boolean;
  cancelReason?: string | null;
  cancelledByRole?: string | null;
  cancelledById?: string | null;
  note?: string | null;
  district?: string | null;
  statusHistory?: Array<{ status: string; at: string; byRole?: string; reason?: string }>;
  createdAt: string;
  updatedAt: string;
  matchedAt?: string | null;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lat?: number;
  lng?: number;
  addressText?: string | null;
  distanceKm?: number | null;
  etaMin?: number | null;
  workerLocation?: { lat: number; lng: number; updatedAt: string } | null;
  worker?: {
    id: string;
    fullName: string;
    photoUrl?: string | null;
    phoneNumber?: string | null;
    rating: number;
    completedJobs?: number;
    isVerified: boolean;
  } | null;
  employer?: {
    id: string;
    fullName: string;
    photoUrl?: string | null;
    phoneNumber?: string | null;
    rating: number;
    isVerified: boolean;
  } | null;
  contract?: {
    id: string;
    signedByWorker: boolean;
    signedByEmployer: boolean;
    status: string;
    terms?: string;
  } | null;
}

export interface WorkerOffer {
  id: string;
  orderId: string;
  serviceType: YandexServiceType;
  durationType: YandexDurationType;
  paymentMethod: 'cash' | 'card_soon';
  recommendedRate: number;
  distanceKm: number;
  etaMin: number;
  expiresAt: string;
  district?: string | null;
  employerName?: string;
  employerRating?: number;
}

export interface WorkerLiveStatus {
  workerId: string;
  isOnline: boolean;
  kycVerified: boolean;
  verificationStatus?: string;
  serviceTypes: YandexServiceType[];
  radiusKm: number;
  lat?: number | null;
  lng?: number | null;
  activeOrderId?: string | null;
  backgroundConsent?: boolean;
  acceptanceRate?: number;
  totalOffers?: number;
  acceptedOffers?: number;
  rejectedOffers?: number;
  lastActivityAt?: string | null;
}

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  telegramUsername?: string | null;
  createdAt: string;
}

export interface SosIncident {
  id: string;
  userId: string;
  userName?: string | null;
  userRole: string;
  orderId?: string | null;
  lat?: number | null;
  lng?: number | null;
  message?: string | null;
  status: 'yangi' | 'korilmoqda' | 'yopildi';
  trustedNotified: boolean;
  trustedContactSummary?: string | null;
  adminNote?: string | null;
  handledBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchingSettings {
  weightDistance: number;
  weightRating: number;
  weightAcceptance: number;
  weightService: number;
  initialRadiusKm: number;
  radiusStepKm: number;
  maxRadiusKm: number;
  offerTimeoutSec: number;
  liveLocationTtlSec: number;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface OrgSubscription {
  id: string;
  employerId: string;
  companyName: string;
  planName: string;
  annualPriceSom: number;
  status: 'active' | 'pending' | 'expired' | 'cancelled';
  startsAt: string;
  expiresAt: string;
  createdAt?: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  adminName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: string | null;
  viewedExactCoords: boolean;
  createdAt: string;
}

export interface AdminDashboardKpi {
  onlineWorkers: number;
  activeOrders: number;
  todayOrders: number;
  totalOrders: number;
  cancelRatePercent: number;
  avgMatchSeconds: number;
  openSos: number;
  pendingKyc: number;
}

export interface AdminAnalyticsData {
  totalOrders: number;
  matchedCount: number;
  matchRatePercent: number;
  completedCount: number;
  cancelledCount: number;
  totalWorkerEarnings: number;
  avgWorkerRating: number;
  cancelReasons: Array<{ reason: string; count: number }>;
  byService: Array<{ serviceType: string; count: number }>;
}

