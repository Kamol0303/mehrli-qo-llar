import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User, UserRole } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';

const SUPER_ADMIN_ENV_KEYS = [
  'SUPER_ADMIN_EMAIL',
  'SUPER_ADMIN_PHONE',
  'SUPER_ADMIN_PASSWORD',
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UZ_PHONE_REGEX = /^\+998\d{9}$/;

function safeEqualStrings(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/** Re-read only Super Admin keys from api/.env (no full env override). */
function reloadSuperAdminEnvFromDisk(): void {
  const candidates = [
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
    join(process.cwd(), 'api', '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const parsed = dotenv.parse(readFileSync(path));
    for (const key of SUPER_ADMIN_ENV_KEYS) {
      if (parsed[key] !== undefined) process.env[key] = parsed[key];
    }
    return;
  }
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private normalizePhoneLookup(input: string): string[] {
    const trimmed = input.trim();
    const digits = trimmed.replace(/\D/g, '');
    const variants = new Set<string>([trimmed]);
    if (digits.startsWith('998') && digits.length === 12) {
      variants.add(`+${digits}`);
    }
    if (digits.length === 9) {
      variants.add(`+998${digits}`);
    }
    if (digits.length === 12) {
      variants.add(digits);
    }
    return [...variants];
  }

  async validateUser(emailOrPhone: string, password: string): Promise<User> {
    const normalized = emailOrPhone.trim();
    const phoneVariants = this.normalizePhoneLookup(normalized);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: normalized },
          { email: normalized.toLowerCase() },
          ...phoneVariants.map((phoneNumber) => ({ phoneNumber })),
        ],
      },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Telefon yoki parol noto\'g\'ri');
    }
    if (user.isBlocked) {
      if (!user.blockUntil || user.blockUntil > new Date()) {
        throw new UnauthorizedException('Hisobingiz bloklangan');
      }
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Telefon yoki parol noto\'g\'ri');
    return user;
  }

  private phoneMatches(login: string, phone: string): boolean {
    if (!phone) return false;
    const loginNorm = login.replace(/\s+/g, '');
    const phoneNorm = phone.replace(/\s+/g, '');
    if (loginNorm === phoneNorm) return true;
    const loginDigits = login.replace(/\D/g, '');
    const phoneDigits = phone.replace(/\D/g, '');
    return loginDigits.length >= 9 && phoneDigits.endsWith(loginDigits);
  }

  async registerUser(dto: RegisterDto): Promise<User> {
    const rawId = (dto.identifier || dto.emailOrPhone || dto.email || dto.phone || dto.phoneNumber || '').trim();
    if (!rawId) {
      throw new BadRequestException('Email yoki telefon raqamini kiriting');
    }
    const password = String(dto.password || '');
    if (password.length < 8 || password.length > 128) {
      throw new BadRequestException('Parol 8 dan 128 tagacha belgidan iborat bo‘lishi kerak');
    }

    let email: string | null = null;
    let phoneNumber: string | null = null;
    if (rawId.includes('@')) {
      email = rawId.toLowerCase();
      if (!EMAIL_REGEX.test(email)) throw new BadRequestException('Email manzili noto‘g‘ri');
    } else {
      const digits = rawId.replace(/\D/g, '');
      const normalized = digits.startsWith('998') && digits.length === 12
        ? `+${digits}`
        : digits.length === 9
          ? `+998${digits}`
          : rawId;
      if (!UZ_PHONE_REGEX.test(normalized)) {
        throw new BadRequestException('Telefon raqami +998XXXXXXXXX formatida bo‘lishi kerak');
      }
      phoneNumber = normalized;
    }

    if (email) {
      const existingEmail = await this.prisma.user.findFirst({ where: { email } });
      if (existingEmail) throw new ConflictException('Bu email manzili bilan hisob allaqachon mavjud');
    }
    if (phoneNumber) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phoneNumber } });
      if (existingPhone) throw new ConflictException('Bu telefon raqami bilan hisob allaqachon mavjud');
    }

    const role: UserRole = dto.role === 'employer' ? UserRole.employer : UserRole.worker;
    const firstName = dto.firstName?.trim() || null;
    const lastName = dto.lastName?.trim() || null;
    const fullName =
      dto.fullName?.trim() ||
      `${firstName || ''} ${lastName || ''}`.trim() ||
      (email ? email.split('@')[0] : 'Foydalanuvchi');

    const passwordHash = await bcrypt.hash(password, 10);
    const id = `${role}_${randomUUID().slice(0, 12)}`;

    return this.prisma.user.create({
      data: {
        id,
        email,
        phoneNumber,
        passwordHash,
        fullName: fullName.slice(0, 120),
        firstName: firstName?.slice(0, 60) || fullName.split(/\s+/)[0] || null,
        lastName: lastName?.slice(0, 60) || fullName.split(/\s+/).slice(1).join(' ') || null,
        role,
        region: 'Samarqand viloyati',
        district: dto.district?.trim() || 'samarkand_city',
        profession: dto.profession?.trim() || null,
        skills: dto.profession?.trim() ? [dto.profession.trim()] : [],
        educationLevel: dto.educationLevel?.trim() || null,
        companyName: role === UserRole.employer ? fullName.slice(0, 120) : null,
      },
    });
  }

  async superAdminLogin(login: string, password: string): Promise<User> {
    reloadSuperAdminEnvFromDisk();
    const envEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim();
    const envPhone = (process.env.SUPER_ADMIN_PHONE || '').trim();
    const envPassword = process.env.SUPER_ADMIN_PASSWORD || '';

    if (!envPassword || (!envEmail && !envPhone)) {
      throw new UnauthorizedException('Super Admin serverda sozlanmagan (api/.env)');
    }
    if (!login?.trim() || !password) {
      throw new UnauthorizedException('Login va parol majburiy');
    }

    const normalizedLogin = login.trim();

    try {
      let user = await this.prisma.user.findFirst({
        where: { role: UserRole.super_admin },
      });

      const loginOk =
        (envEmail && normalizedLogin.toLowerCase() === envEmail.toLowerCase()) ||
        this.phoneMatches(normalizedLogin, envPhone) ||
        (!!user?.email && normalizedLogin.toLowerCase() === user.email.toLowerCase()) ||
        (!!user?.phoneNumber && this.phoneMatches(normalizedLogin, user.phoneNumber));

      if (!loginOk || !safeEqualStrings(password, envPassword)) {
        throw new UnauthorizedException('Super Admin login yoki parol noto\'g\'ri');
      }

      const email = envEmail || user?.email || 'superadmin@mexrliqollar.uz';

      if (user) {
        // Keep password hash / identity in sync with api/.env for local/dev convenience
        const hash = await bcrypt.hash(envPassword, 10);
        let phoneNumber: string | null | undefined = undefined;
        if (envPhone && user.phoneNumber !== envPhone) {
          const taken = await this.prisma.user.findFirst({
            where: { phoneNumber: envPhone, NOT: { id: user.id } },
            select: { id: true },
          });
          if (!taken) phoneNumber = envPhone;
        }
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email,
            ...(phoneNumber !== undefined ? { phoneNumber } : {}),
            passwordHash: hash,
            isVerified: true,
            verificationStatus: 'verified',
          },
        });
        return user;
      }

      // phoneNumber is UNIQUE — do not attach env phone if another user already owns it
      let phoneNumber: string | null = envPhone || null;
      if (phoneNumber) {
        const taken = await this.prisma.user.findFirst({
          where: { phoneNumber },
          select: { id: true, role: true },
        });
        if (taken) phoneNumber = null;
      }

      user = await this.prisma.user.create({
        data: {
          id: `super_admin_${Date.now()}`,
          email,
          phoneNumber,
          fullName: 'Super Admin',
          firstName: 'Super',
          lastName: 'Admin',
          role: UserRole.super_admin,
          region: 'Samarqand viloyati',
          passwordHash: await bcrypt.hash(envPassword, 10),
          isVerified: true,
          verificationStatus: 'verified',
        },
      });
      return user;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Can't reach database") || message.includes('P1001')) {
        throw new UnauthorizedException('Database ishlamayapti (PostgreSQL localhost:5432)');
      }
      throw new UnauthorizedException(`Super Admin kirish xatosi: ${message}`);
    }
  }

  signToken(user: User) {
    const payload: JwtPayload = { sub: user.id, role: user.role, email: user.email };
    return {
      accessToken: this.jwt.sign(payload),
      user: this.sanitizeUser(user),
    };
  }

  sanitizeUser(user: User) {
    // Core/risk indicators are Super Admin-only — never return them to the account
    // owner (worker/employer) in auth/login/me payloads.
    const { passwordHash, coreIndicators, ...rest } = user as User & {
      coreIndicators?: unknown;
    };
    void coreIndicators;
    return rest;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.sanitizeUser(user);
  }

  /**
   * Re-issue a fresh access token for an already-authenticated user (sliding
   * session). This never triggers SMS/OTP — it only extends the login so the
   * mobile app can keep the user signed in without re-entering a password.
   */
  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.signToken(user);
  }

  async revokeSession(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionValidAfter: new Date() },
    });
    return { success: true };
  }

  /**
   * Closes a worker or employer account without deleting the row, so platform
   * counts stay stable. The phone number is released for a later signup.
   */
  async deleteOwnAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.role === 'admin' || user.role === 'super_admin') {
      throw new ForbiddenException('Xodim hisobini shu yerdan oʻchirib boʻlmaydi');
    }
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: null,
        phoneNumber: null,
        passwordHash: null,
        fullName: "O'chirilgan hisob",
        firstName: null,
        lastName: null,
        bio: null,
        photoUrl: null,
        coverUrl: null,
        telegram: null,
        personalInfo: Prisma.DbNull,
        companyDocuments: Prisma.DbNull,
        recruiterContacts: Prisma.DbNull,
        tin: null,
        registrationNumber: null,
        website: null,
        officeAddress: null,
        latitude: null,
        longitude: null,
        locationSharingEnabled: false,
        lookingForWork: false,
        isBlocked: true,
        blockReason: 'account_deleted',
        blockedAt: now,
        sessionValidAfter: now,
      },
    });
    return { success: true };
  }
}
