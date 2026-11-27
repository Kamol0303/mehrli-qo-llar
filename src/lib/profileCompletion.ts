import i18n from '../i18n';
import type { Profile } from '../types';

export interface CompletionItem {
  id: string;
  label: string;
  done: boolean;
}

export function getWorkerCompletion(profile: Profile): { percent: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { id: 'personal', label: i18n.t('profile.comp_personal'), done: Boolean((profile.firstName || profile.fullName) && profile.phoneNumber && profile.region) },
    { id: 'photo', label: i18n.t('profile.comp_photo'), done: Boolean(profile.photoUrl) },
    { id: 'summary', label: i18n.t('profile.comp_summary'), done: Boolean(profile.professionalSummary || profile.bio) },
    { id: 'skills', label: i18n.t('profile.comp_skills'), done: (profile.skills?.length ?? 0) >= 2 },
    { id: 'education', label: i18n.t('profile.comp_education'), done: (profile.education?.length ?? 0) > 0 },
    { id: 'experience', label: i18n.t('profile.comp_experience'), done: (profile.experience?.length ?? 0) > 0 },
    { id: 'certificates', label: i18n.t('profile.comp_certificates'), done: (profile.certificates?.length ?? 0) > 0 },
    { id: 'portfolio', label: i18n.t('profile.comp_portfolio'), done: (profile.portfolio?.length ?? 0) > 0 },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items };
}

export function getEmployerCompletion(profile: Profile): { percent: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { id: 'company', label: i18n.t('profile.comp_company'), done: Boolean(profile.companyName || profile.fullName) },
    { id: 'logo', label: i18n.t('profile.comp_logo'), done: Boolean(profile.photoUrl) },
    { id: 'cover', label: i18n.t('profile.comp_cover'), done: Boolean(profile.coverUrl) },
    { id: 'about', label: i18n.t('profile.comp_about'), done: Boolean(profile.bio || profile.professionalSummary) },
    { id: 'contact', label: i18n.t('profile.comp_contact'), done: Boolean(profile.phoneNumber || profile.email || profile.telegram) },
    { id: 'address', label: i18n.t('profile.comp_address'), done: Boolean(profile.officeAddress || profile.region) },
    { id: 'legal', label: i18n.t('profile.comp_legal'), done: Boolean(profile.tin || profile.registrationNumber) },
    { id: 'industry', label: i18n.t('profile.comp_industry'), done: Boolean(profile.industry || profile.businessType) },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items };
}
