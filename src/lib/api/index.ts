import { apiRequest, setAccessToken, clearAccessToken, toQuery, API_BASE, getAccessToken } from './client';
import { normalizePublicStats } from '../statsCounts';
import { ensureArray } from './errors';
import type { Profile, Job, Application, Contract, Notification, ChatMessage, ChatThread, Dispute, VerificationRequest, Review, ServicePost, WorkerPersonalInfo, WorkerCoreIndicators } from '../../types';

export interface AuthResponse {
  accessToken: string;
  user: Profile & { id?: string };
}

export interface EmployerWorker {
  uid: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  photoUrl: string | null;
  phoneNumber: string | null;
  region: string;
  district: string | null;
  profession?: string | null;
  skills: string[];
  availability: string | null;
  experienceLevel: string | null;
  isVerified: boolean;
  rating: number;
  lookingForWork: boolean;
  distanceKm?: number;
  distanceLabel?: string;
  matchScore?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AiMatchWorker {
  uid: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  photoUrl: string | null;
  phoneNumber: string | null;
  region: string;
  district: string | null;
  skills: string[];
  experienceLevel: string | null;
  isVerified: boolean;
  rating: number;
  matchScore: number;
  matchedSkills: string[];
  distanceKm?: number;
  distanceLabel?: string;
}

export type SubscriptionStatusValue = 'active' | 'expired';

export interface SubscriptionStatusResponse {
  status: SubscriptionStatusValue;
  freeUntil: string | null;
  paidUntil: string | null;
  effectiveUntil: string | null;
  lastPaymentAt: string | null;
  priceSom: number;
  daysRemaining: number;
  inWarningWindow: boolean;
  blocked: boolean;
  priceRange: { min: number; max: number };
  warningDays: number;
  blockedPaths: string[];
}

export interface EmployerWorkersResponse {
  data: EmployerWorker[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  radiusKm?: number;
}

export interface AdminStaffUser {
  uid: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  role: 'admin' | 'super_admin';
  isVerified: boolean;
  isBlocked: boolean;
  createdAt: string;
}

export interface JobsNearbyResponse {
  data: Job[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  radiusKm?: number;
}

function stringifyParams(
  params?: Record<string, string | number | undefined> | null,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    out[k] = v === undefined ? undefined : String(v);
  }
  return out;
}

function asJsonArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function mapUser(u: Record<string, unknown> | null | undefined): Profile | null {
  if (!u || typeof u !== 'object') return null;
  return {
    uid: String(u.id ?? ''),
    fullName: String(u.fullName ?? ''),
    firstName: (u.firstName as string | undefined) ?? undefined,
    lastName: (u.lastName as string | undefined) ?? undefined,
    email: String(u.email ?? ''),
    phoneNumber: u.phoneNumber as string | undefined,
    hasPin: Boolean(u.hasPin),
    role: u.role as Profile['role'],
    region: String(u.region ?? ''),
    district: u.district as string | undefined,
    neighborhood: u.neighborhood as string | undefined,
    bio: u.bio as string | undefined,
    personalInfo: u.personalInfo
      ? (u.personalInfo as WorkerPersonalInfo)
      : undefined,
    coreIndicators: u.coreIndicators
      ? (u.coreIndicators as WorkerCoreIndicators)
      : undefined,
    skills: Array.isArray(u.skills) ? (u.skills as string[]) : [],
    profession: u.profession as string | undefined,
    educationLevel: u.educationLevel as string | undefined,
    photoUrl: u.photoUrl as string | undefined,
    coverUrl: u.coverUrl as string | undefined,
    telegram: u.telegram as string | undefined,
    languages: asJsonArray<string>(u.languages),
    availability: (u.availability as Profile['availability']) || 'available',
    lookingForWork: u.lookingForWork !== false,
    professionalSummary: u.professionalSummary as string | undefined,
    preferredContact: u.preferredContact as Profile['preferredContact'],
    experienceLevel: u.experienceLevel as string | undefined,
    isPremium: Boolean(u.isPremium),
    isVerified: Boolean(u.isVerified),
    verificationStatus: u.verificationStatus as Profile['verificationStatus'],
    rating: Number(u.rating ?? 0),
    reviewCount: Number(u.reviewCount ?? 0),
    completedJobs: Number(u.completedJobs ?? 0),
    education: asJsonArray(u.education),
    experience: asJsonArray(u.experience),
    certificates: asJsonArray(u.certificates),
    portfolio: asJsonArray(u.portfolio),
    resumeTemplate: (u.resumeTemplate as Profile['resumeTemplate']) || 'professional',
    companyName: u.companyName as string | undefined,
    businessType: u.businessType as string | undefined,
    industry: u.industry as string | undefined,
    registrationNumber: u.registrationNumber as string | undefined,
    tin: u.tin as string | undefined,
    website: u.website as string | undefined,
    foundedYear: u.foundedYear as string | undefined,
    employeeCount: u.employeeCount as string | undefined,
    officeAddress: u.officeAddress as string | undefined,
    companyGallery: asJsonArray(u.companyGallery),
    companyDocuments: asJsonArray(u.companyDocuments),
    recruiterContacts: asJsonArray(u.recruiterContacts),
    violationCount: Number(u.violationCount ?? 0),
    riskScore: Number(u.riskScore ?? 0),
    isBlocked: Boolean(u.isBlocked),
    blockReason: u.blockReason as string | undefined,
    trustScore: Number(u.trustScore ?? 100),
    behaviorFlags: Array.isArray(u.behaviorFlags) ? (u.behaviorFlags as string[]) : [],
    createdAt: u.createdAt as string | Date | undefined,
    updatedAt: u.updatedAt as string | Date | undefined,
    lastActive: u.lastActive as string | Date | undefined,
    latitude: typeof u.latitude === 'number' ? u.latitude : undefined,
    longitude: typeof u.longitude === 'number' ? u.longitude : undefined,
    locationUpdatedAt: u.locationUpdatedAt as string | Date | undefined,
    locationSharingEnabled: Boolean(u.locationSharingEnabled),
  };
}

function mapUsers(rows: unknown): Profile[] {
  return ensureArray<Record<string, unknown>>(rows)
    .map((row) => mapUser(row))
    .filter((user): user is Profile => Boolean(user?.uid));
}

function mapJob(j: Record<string, unknown> | null | undefined): Job | null {
  if (!j || typeof j !== 'object' || j.id == null) return null;
  return { ...(j as unknown as Job), id: String(j.id) };
}

function mapJobs(rows: unknown): Job[] {
  return ensureArray<Record<string, unknown>>(rows)
    .map((row) => mapJob(row))
    .filter((job): job is Job => Boolean(job?.id));
}

export interface AuthProvidersResponse {
  telegram: {
    enabled: boolean;
    widgetEnabled: boolean;
    clientId: string | null;
    botUsername: string | null;
  };
  password: {
    enabled: boolean;
  };
}

export interface PasswordlessRegistrationMeta {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: 'worker' | 'employer';
  profession?: string;
  educationLevel?: string;
  district?: string;
}

export const api = {
  auth: {
    providers() {
      return apiRequest<AuthProvidersResponse>('/auth/providers', {}, false);
    },
    telegramNonce() {
      return apiRequest<{ nonce: string; clientId: string | null }>('/auth/nonce', {}, false);
    },
    telegramStart(meta?: PasswordlessRegistrationMeta) {
      return apiRequest<{ authUrl: string; state: string; nonce: string; redirectUri: string }>(
        '/auth/telegram/start',
        {
          method: 'POST',
          body: JSON.stringify(meta ?? {}),
        },
        false,
      );
    },
    async telegramVerify(params: { id_token: string; nonce: string } & PasswordlessRegistrationMeta) {
      const res = await apiRequest<AuthResponse & { ok?: boolean; isNew?: boolean }>(
        '/auth/telegram',
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    hydrateSessionFromPopup(accessToken: string, rawUser: Record<string, unknown>) {
      setAccessToken(accessToken);
      const user = mapUser(rawUser);
      if (!user) throw new Error('Invalid auth response');
      return { accessToken, user };
    },
    async login(identifier: string, password: string) {
      const res = await apiRequest<AuthResponse>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, emailOrPhone: identifier, password }),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    async register(params: {
      identifier?: string;
      phone?: string;
      email?: string;
      password: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      role?: 'worker' | 'employer';
      profession?: string;
      educationLevel?: string;
      district?: string;
    }) {
      const identifier = (params.identifier || params.email || params.phone || '').trim();
      const res = await apiRequest<AuthResponse>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            identifier,
            phone: params.phone,
            phoneNumber: params.phone,
            email: params.email,
            password: params.password,
            fullName: params.fullName,
            firstName: params.firstName,
            lastName: params.lastName,
            role: params.role ?? 'worker',
            profession: params.profession,
            educationLevel: params.educationLevel,
            district: params.district,
          }),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    async setupPin(pin: string) {
      const res = await apiRequest<{ hasPin: boolean; user: Record<string, unknown> }>(
        '/auth/pin/setup',
        {
          method: 'POST',
          body: JSON.stringify({ pin }),
        },
      );
      const user = mapUser(res.user);
      if (!user) throw new Error('Invalid user response');
      return { hasPin: res.hasPin, user };
    },
    async verifyPin(params: { pin: string; userId?: string; identifier?: string }) {
      const res = await apiRequest<AuthResponse>(
        '/auth/pin/verify',
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    async removePin() {
      const res = await apiRequest<{ hasPin: boolean; user: Record<string, unknown> }>(
        '/auth/pin',
        { method: 'DELETE' },
      );
      const user = mapUser(res.user);
      if (!user) throw new Error('Invalid user response');
      return { hasPin: res.hasPin, user };
    },
    superAdminStatus() {
      return apiRequest<{ configuredByEnv: boolean; needsSetup: boolean }>(
        '/auth/super-admin/status',
        {},
        false,
      );
    },
    async superAdminSetup(login: string, password: string) {
      const res = await apiRequest<AuthResponse>(
        '/auth/super-admin/setup',
        {
          method: 'POST',
          body: JSON.stringify({ login, password }),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    async superAdminLogin(login: string, password: string) {
      const res = await apiRequest<AuthResponse>(
        '/auth/super-admin/login',
        {
          method: 'POST',
          body: JSON.stringify({ login, password }),
        },
        false,
      );
      setAccessToken(res.accessToken);
      const user = mapUser(res.user as unknown as Record<string, unknown>);
      if (!user) throw new Error('Invalid auth response');
      return { ...res, user };
    },
    async me() {
      const u = await apiRequest<Record<string, unknown>>('/auth/me');
      const user = mapUser(u);
      if (!user) throw new Error('Invalid profile response');
      return user;
    },
    async session() {
      const res = await apiRequest<{
        authenticated: boolean;
        accessToken?: string;
        user: Record<string, unknown> | null;
      }>('/auth/session');
      if (!res.authenticated || !res.user) return null;
      if (res.accessToken) setAccessToken(res.accessToken);
      return mapUser(res.user);
    },
    /**
     * Slide the session forward using HttpOnly cookie or active token so users stay
     * signed in across page reloads and app restarts without re-entering credentials.
     */
    async refresh() {
      const res = await apiRequest<AuthResponse>('/auth/refresh', { method: 'POST' });
      if (res.accessToken) setAccessToken(res.accessToken);
      const user = res.user ? mapUser(res.user as unknown as Record<string, unknown>) : null;
      return user;
    },
    async logout() {
      try {
        await apiRequest('/auth/logout', { method: 'POST' });
      } catch {
        /* Network errors should never block clearing client state. */
      }
      clearAccessToken();
    },
    changePassword(currentPassword: string, newPassword: string) {
      return apiRequest<{ success: true }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
    deleteAccount() {
      return apiRequest<{ success: true }>('/auth/delete-account', { method: 'POST' });
    },
  },

  users: {
    list(params?: { role?: string; region?: string; district?: string }) {
      return apiRequest<unknown>(`/users${toQuery(params ?? {})}`).then(mapUsers);
    },
    get(id: string) {
      return apiRequest<Record<string, unknown>>(`/users/${id}`).then((u) => {
        const user = mapUser(u);
        if (!user) throw new Error('User not found');
        return user;
      });
    },
    update(id: string, data: Partial<Profile>) {
      // Never send personalInfo / coreIndicators through generic profile patch
      const { personalInfo: _pi, coreIndicators: _ci, ...safe } = data;
      return apiRequest<Record<string, unknown>>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(safe),
      }).then((u) => {
        const user = mapUser(u);
        if (!user) throw new Error('User not found');
        return user;
      });
    },
    getPersonalInfo(id: string) {
      return apiRequest<{ personalInfo: WorkerPersonalInfo | null }>(
        `/users/${id}/personal-info`,
      );
    },
    updatePersonalInfo(id: string, personalInfo: WorkerPersonalInfo) {
      return apiRequest<{ personalInfo: WorkerPersonalInfo | null }>(
        `/users/${id}/personal-info`,
        {
          method: 'PUT',
          body: JSON.stringify({ personalInfo }),
        },
      );
    },
    getCoreIndicators(id: string) {
      return apiRequest<{ coreIndicators: WorkerCoreIndicators | null }>(
        `/users/${id}/core-indicators`,
      );
    },
    updateCoreIndicators(id: string, coreIndicators: WorkerCoreIndicators) {
      return apiRequest<{ coreIndicators: WorkerCoreIndicators | null }>(
        `/users/${id}/core-indicators`,
        {
          method: 'PUT',
          body: JSON.stringify({ coreIndicators }),
        },
      );
    },
    updateLocation(id: string, body: { latitude?: number; longitude?: number; enabled?: boolean }) {
      return apiRequest<{ locationSharingEnabled: boolean; locationUpdatedAt: string | null }>(
        `/users/${id}/location`,
        { method: 'PUT', body: JSON.stringify(body) },
      );
    },
    clearLocation(id: string) {
      return apiRequest<{ locationSharingEnabled: boolean }>(`/users/${id}/location`, {
        method: 'DELETE',
      });
    },
  },

  ai: {
    status() {
      return apiRequest<{ live: boolean; provider: string }>('/ai/status');
    },
    vacancy(body: {
      title?: string;
      category?: string;
      description?: string;
      requirements?: string[];
      region?: string;
      salary?: number | string;
      language?: string;
    }) {
      return apiRequest<{ text: string; provider: string }>('/ai/employer/vacancy', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    match(body: {
      profession?: string;
      skills?: string[];
      region?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
      limit?: number;
    }) {
      return apiRequest<{ data: AiMatchWorker[]; total: number; aiProvider: string }>(
        '/ai/employer/match',
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
    resume(body?: { userId?: string; language?: string }) {
      return apiRequest<{ text: string; provider: string }>('/ai/worker/resume', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
    },
    riskSummary(userId: string, language?: string) {
      return apiRequest<{ text: string; provider: string; advisory: boolean }>(
        `/ai/admin/risk-summary/${userId}`,
        { method: 'POST', body: JSON.stringify({ language }) },
      );
    },
  },

  subscription: {
    status() {
      return apiRequest<SubscriptionStatusResponse>('/admin/subscription/status');
    },
    setPrice(priceSom: number) {
      return apiRequest<SubscriptionStatusResponse>('/admin/subscription/price', {
        method: 'POST',
        body: JSON.stringify({ priceSom }),
      });
    },
    pay() {
      return apiRequest<{ cardNumber: string; amount: number }>('/admin/subscription/pay', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    confirmPayment() {
      return apiRequest<SubscriptionStatusResponse>('/admin/subscription/confirm', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
  },

  admin: {
    /** Streams a server-generated .xlsx of users and triggers a browser download. */
    async exportUsersXlsx(params?: {
      role?: string;
      region?: string;
      district?: string;
      verificationStatus?: string;
      search?: string;
      ids?: string[];
    }) {
      const query = stringifyParams({
        role: params?.role,
        region: params?.region,
        district: params?.district,
        verificationStatus: params?.verificationStatus,
        search: params?.search,
        ids: params?.ids?.length ? params.ids.join(',') : undefined,
      });
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/admin/export/users${toQuery(query)}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const raw = await res.text();
        let message = raw.trim() || `Export ${res.status}`;
        try {
          const body = JSON.parse(raw) as { message?: unknown };
          if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
        } catch {
          /* plain-text error body */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `users-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return { filename };
    },
    liveMapData() {
      return apiRequest<{
        workers: Array<{
          uid: string;
          fullName: string;
          role: 'worker';
          profession: string;
          skills: string[];
          photoUrl: string | null;
          phoneNumber: string | null;
          availability: string;
          rating: number;
          completedJobs: number;
          isVerified: boolean;
          district: string | null;
          region: string;
          latitude: number;
          longitude: number;
        }>;
        employers: Array<{
          uid: string;
          fullName: string;
          companyName: string | null;
          role: 'employer';
          photoUrl: string | null;
          phoneNumber: string | null;
          rating: number;
          isVerified: boolean;
          district: string | null;
          region: string;
          latitude: number;
          longitude: number;
        }>;
        activeJobs: Array<{
          id: string;
          title: string;
          employerId: string;
          employerName: string | null;
          category: string | null;
          price: number | null;
          workType: string | null;
          district: string | null;
          region: string | null;
          status: string;
          latitude: number;
          longitude: number;
        }>;
        disputes: Array<{
          id: string;
          contractId: string;
          openedById: string;
          openedByName?: string;
          reason: string;
          status: string;
          latitude: number;
          longitude: number;
        }>;
      }>('/super-admin/live-map-data');
    },
  },

  employer: {
    workers(params?: {
      search?: string;
      region?: string;
      district?: string;
      skill?: string;
      page?: number;
      pageSize?: number;
      nearDistrict?: string;
    }) {
      return apiRequest<EmployerWorkersResponse>(`/employer/workers${toQuery(stringifyParams(params))}`);
    },
    workersNearby(params: {
      lat: number;
      lng: number;
      radius_km?: number;
      skill?: string;
      region?: string;
      page?: number;
      pageSize?: number;
      jobId?: string;
    }) {
      return apiRequest<EmployerWorkersResponse>(`/employer/workers/nearby${toQuery(stringifyParams(params))}`);
    },
    inviteWorker(data: { workerId: string; jobId?: string; title?: string; price?: number; message?: string }) {
      return apiRequest<{ success: boolean; application: Application; job: Job }>('/employer/invite-worker', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    recommendedWorkers() {
      return apiRequest<{ data: EmployerWorker[] }>('/employer/recommended-workers');
    },
  },

  worker: {
    recommendedJobs() {
      return apiRequest<{ data: Job[] }>('/worker/recommended-jobs');
    },
  },

  uploads: {
    async upload(
      file: File,
      kind:
        | 'photo'
        | 'cover'
        | 'certificate'
        | 'portfolio'
        | 'document'
        | 'file'
        | 'verification'
        | 'verification_id'
        | 'verification_selfie'
        | 'verification_address'
        | 'verification_extra' = 'file',
    ) {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const token = getAccessToken();
      const base = API_BASE;
      const res = await fetch(`${base}/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });
      const raw = await res.text();
      let body: unknown = null;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      if (!res.ok) {
        const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
        const msg = record?.message;
        const message = Array.isArray(msg)
          ? msg.map(String).join(', ')
          : typeof msg === 'string'
            ? msg
            : typeof body === 'string' && body
              ? body
              : `Upload ${res.status}`;
        throw new Error(message);
      }
      return body as {
        success: true;
        url: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        kind: string;
      };
    },
  },

  jobs: {
    list(params?: Record<string, string>) {
      return apiRequest<unknown>(`/jobs${toQuery(params ?? {})}`).then(mapJobs);
    },
    nearby(params: {
      lat: number;
      lng: number;
      radius_km?: number;
      category?: string;
      region?: string;
      page?: number;
      pageSize?: number;
    }) {
      return apiRequest<JobsNearbyResponse>(`/jobs/nearby${toQuery(stringifyParams(params))}`).then(
        (res) => ({ ...res, data: mapJobs(res.data) }),
      );
    },
    get(id: string) {
      return apiRequest<Job>(`/jobs/${id}`);
    },
    create(data: Partial<Job>) {
      return apiRequest<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Job>) {
      return apiRequest<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  applications: {
    list(params?: Record<string, string>) {
      return apiRequest<Application[]>(`/applications${toQuery(params ?? {})}`).then((rows) => ensureArray<Application>(rows));
    },
    get(id: string) {
      return apiRequest<Application>(`/applications/${id}`);
    },
    create(data: Partial<Application>) {
      return apiRequest<Application>('/applications', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Application>) {
      return apiRequest<Application>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    complete(id: string) {
      return apiRequest<Application>(`/applications/${id}/complete`, { method: 'POST' });
    },
  },

  contracts: {
    list(params?: Record<string, string>) {
      return apiRequest<Contract[]>(`/contracts${toQuery(params ?? {})}`).then((rows) => ensureArray<Contract>(rows));
    },
    get(id: string) {
      return apiRequest<Contract>(`/contracts/${id}`);
    },
    create(data: Partial<Contract>) {
      return apiRequest<Contract>('/contracts', { method: 'POST', body: JSON.stringify(data) });
    },
    sendToWorker(workerId: string, data?: { amount?: number }) {
      return apiRequest<Contract>(`/contracts/to-worker/${workerId}`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      });
    },
    createFromApplication(
      applicationId: string,
      data: { amount?: number; terms?: string; startDate?: string; endDate?: string },
    ) {
      return apiRequest<Contract>(`/contracts/from-application/${applicationId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    update(id: string, data: Partial<Contract>) {
      return apiRequest<Contract>(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  notifications: {
    list(userId: string) {
      return apiRequest<Notification[]>(`/notifications${toQuery({ userId })}`).then((rows) => ensureArray<Notification>(rows));
    },
    create(data: Partial<Notification>) {
      return apiRequest<Notification>('/notifications', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Notification>) {
      return apiRequest<Notification>(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  chatMessages: {
    list(userA: string, userB: string) {
      return apiRequest<ChatMessage[]>(`/chat-messages${toQuery({ userA, userB })}`).then((rows) => ensureArray<ChatMessage>(rows));
    },
    inbox() {
      return apiRequest<ChatThread[]>('/chat-messages/inbox').then((rows) => ensureArray<ChatThread>(rows));
    },
    create(data: Partial<ChatMessage>) {
      return apiRequest<ChatMessage>('/chat-messages', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<ChatMessage>) {
      return apiRequest<ChatMessage>(`/chat-messages/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  disputes: {
    list(params?: Record<string, string>) {
      return apiRequest<Dispute[]>(`/disputes${toQuery(params ?? {})}`).then((rows) => ensureArray<Dispute>(rows));
    },
    create(data: Partial<Dispute>) {
      return apiRequest<Dispute>('/disputes', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Dispute>) {
      return apiRequest<Dispute>(`/disputes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  verificationRequests: {
    list(params?: Record<string, string>) {
      return apiRequest<unknown>(`/verification-requests${toQuery(params ?? {})}`).then((rows) =>
        ensureArray<VerificationRequest & { user?: Record<string, unknown> }>(rows).map((row) => ({
          ...row,
          user: row.user ? mapUser(row.user) || undefined : undefined,
        })),
      );
    },
    mine() {
      return apiRequest<VerificationRequest | null>('/verification-requests/mine');
    },
    create(data: Partial<VerificationRequest>) {
      return apiRequest<VerificationRequest>('/verification-requests', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<VerificationRequest> & { action?: string }) {
      return apiRequest<VerificationRequest>(`/verification-requests/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    bulk(data: { ids: string[]; action: 'approve' | 'reject'; rejectionReason?: string; reason?: string }) {
      return apiRequest<{ success: true; count: number }>('/verification-requests/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: data.ids,
          action: data.action,
          reason: data.rejectionReason || data.reason,
        }),
      });
    },
  },

  reviews: {
    list(params?: Record<string, string>) {
      return apiRequest<Review[]>(`/reviews${toQuery(params ?? {})}`).then((rows) => ensureArray<Review>(rows));
    },
    create(data: Partial<Review>) {
      return apiRequest<Review>('/reviews', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  savedJobs: {
    list(userId: string) {
      return apiRequest<Array<{ id: string; userId: string; jobId: string; job?: Job }>>(`/saved-jobs${toQuery({ userId })}`).then((rows) => ensureArray<{ id: string; userId: string; jobId: string; job?: Job }>(rows));
    },
    create(userId: string, jobId: string) {
      return apiRequest('/saved-jobs', { method: 'POST', body: JSON.stringify({ userId, jobId }) });
    },
    remove(userId: string, jobId: string) {
      return apiRequest('/saved-jobs/delete', { method: 'POST', body: JSON.stringify({ userId, jobId }) });
    },
  },

  servicePosts: {
    list(params?: Record<string, string>) {
      return apiRequest<ServicePost[]>(`/service-posts${toQuery(params ?? {})}`).then((rows) => ensureArray<ServicePost>(rows));
    },
    create(data: Partial<ServicePost>) {
      return apiRequest<ServicePost>('/service-posts', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<ServicePost>) {
      return apiRequest<ServicePost>(`/service-posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  payments: {
    list(userId?: string) {
      return apiRequest(`/payments${toQuery({ userId })}`);
    },
    create(data: Record<string, unknown>) {
      return apiRequest('/payments', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Record<string, unknown>) {
      return apiRequest(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  violations: {
    create(data: Record<string, unknown>) {
      return apiRequest('/violations', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  activityLogs: {
    list(userId?: string) {
      return apiRequest(`/activity-logs${toQuery({ userId })}`);
    },
    create(data: Record<string, unknown>) {
      return apiRequest('/activity-logs', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  systemLogs: {
    list() {
      return apiRequest('/system-logs');
    },
    create(data: Record<string, unknown>) {
      return apiRequest('/system-logs', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  settings: {
    getGlobal() {
      return apiRequest<Record<string, unknown>>('/settings/global');
    },
    updateGlobal(data: Record<string, unknown>) {
      return apiRequest('/settings/global', { method: 'PATCH', body: JSON.stringify(data) });
    },
  },

  adminUsers: {
    list() {
      return apiRequest<AdminStaffUser[]>('/admin/users');
    },
    create(data: {
      fullName: string;
      phone: string;
      password: string;
      role?: 'admin' | 'super_admin';
      email?: string;
    }) {
      return apiRequest<AdminStaffUser>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    resetPassword(id: string, password: string) {
      return apiRequest<{ success: true }>(`/admin/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
    },
    remove(id: string) {
      return apiRequest<{ success: true }>(`/admin/users/${id}`, { method: 'DELETE' });
    },
  },

  stats: {
    counts() {
      return apiRequest<{
        users: number;
        jobs: number;
        applications: number;
        contracts: number;
        workers?: number;
        employers?: number;
        activeJobs?: number;
        pendingApplications?: number;
        activeContracts?: number;
        completedContracts?: number;
      }>(
        '/stats/counts',
        {},
        false,
      ).then((data) => normalizePublicStats(data));
    },
  },
};
