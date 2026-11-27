import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize API/Firebase/ISO dates — never call .toDate() directly on createdAt */
export function toJsDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'object') {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === 'function') {
      try {
        const d = v.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        /* fall through */
      }
    }
    const seconds = typeof v.seconds === 'number' ? v.seconds : v._seconds;
    if (typeof seconds === 'number') {
      const d = new Date(seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const normalizeLanguageCode = (lang?: string) => {
  if (!lang) return 'uz';
  const normalized = lang.toLowerCase();
  if (normalized.startsWith('uz')) return 'uz';
  if (normalized.startsWith('ru')) return 'ru';
  if (normalized.startsWith('en')) return 'en';
  return 'uz';
};

export const getDistrictKey = (district?: string) => {
  if (!district) return '';
  const cleaned = district
    .trim()
    .toLowerCase()
    .replace(/['‘’ʻʼ`]/g, '');
  const map: Record<string, string> = {
    'samarqand shahar': 'samarkand_city',
    'samarqand shahri': 'samarkand_city',
    'samarkand city': 'samarkand_city',
    'urgut': 'urgut',
    'urgut tumani': 'urgut',
    'kattaqorgon': 'kattaqorgon',
    'kattaqorgon tumani': 'kattaqorgon',
    'kattaqorgon shahri': 'kattaqorgon_shahri',
    'pastdargom': 'pastdargom',
    'past dargom': 'pastdargom',
    'past dargom tumani': 'pastdargom',
    'pastdargom tumani': 'pastdargom',
    'payariq': 'payariq',
    'payariq tumani': 'payariq',
    'ishtixon': 'ishtixon',
    'ishtixon tumani': 'ishtixon',
    'narpay': 'narpay',
    'narpay tumani': 'narpay',
    'toyloq': 'toyloq',
    'toyloq tumani': 'toyloq',
    'qoshrabot': 'qoshrabot',
    'qoshrabot tumani': 'qoshrabot',
    'bulungur': 'bulungur',
    'bulungur tumani': 'bulungur',
    'jomboy': 'jomboy',
    'jomboy tumani': 'jomboy',
    'jomboy shahri': 'jomboy_shahri',
    'oqdaryo': 'oqdaryo',
    'oqdaryo tumani': 'oqdaryo',
    'nurobod': 'nurobod',
    'nurobod tumani': 'nurobod',
    'paxtachi': 'paxtachi',
    'paxtachi tumani': 'paxtachi',
    'oqtosh shahri': 'oqtosh_shahri',
    'samarqand tumani': 'samarqand_tumani',
  };
  return map[cleaned] || cleaned.replace(/\s+/g, '_');
};

/** Demo/imported profiles often have empty or alternate Samarkand region labels. */
export function isSamarkandRegion(region?: string | null): boolean {
  if (!region || !region.trim()) return true;
  const value = region.trim().toLowerCase();
  return value.includes('samarqand') || value.includes('samarkand');
}

export function filterWorkersForSamarkand<T extends { region?: string | null; district?: string | null; isBlocked?: boolean }>(
  workers: T[],
  options?: { district?: string },
): T[] {
  return workers.filter((worker) => {
    if (worker.isBlocked) return false;
    if (!isSamarkandRegion(worker.region)) return false;
    if (options?.district && worker.district !== options.district) return false;
    return true;
  });
}

export function filterJobsForSamarkand<T extends { region?: string | null; district?: string | null; status?: string }>(
  jobs: T[],
  options?: { district?: string; status?: string },
): T[] {
  return jobs.filter((job) => {
    if (options?.status && job.status !== options.status) return false;
    if (!isSamarkandRegion(job.region)) return false;
    if (options?.district && job.district !== options.district) return false;
    return true;
  });
}
