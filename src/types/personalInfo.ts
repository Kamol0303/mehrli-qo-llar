/** Confidential worker personal information — worker self + super_admin only */
export type Gender = 'male' | 'female' | 'other' | '';

export type MaritalStatus =
  | 'single'
  | 'married'
  | 'divorced'
  | 'widowed'
  | 'other'
  | '';

export type ChildrenStatus = 'none' | 'has_children' | '';

export interface WorkerPersonalInfo {
  fullName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  age?: number;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  childrenStatus?: ChildrenStatus;
  childrenCount?: number;
  profession?: string;
  specialty?: string;
  educationLevel?: string;
  nationality?: string;
  citizenship?: string;
  currentAddress?: string;
  permanentAddress?: string;
  phone?: string;
  additionalPhone?: string;
  email?: string;
  about?: string;
  notes?: string;
  /** Audit — last editor */
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
}

export const PERSONAL_INFO_REQUIRED: Array<keyof WorkerPersonalInfo> = [
  'fullName',
  'dateOfBirth',
  'gender',
  'maritalStatus',
  'childrenStatus',
  'profession',
  'specialty',
  'educationLevel',
  'citizenship',
  'currentAddress',
  'phone',
  'email',
];

export const GENDER_OPTIONS: { value: Gender; labelKey: string }[] = [
  { value: 'male', labelKey: 'profile.gender_male' },
  { value: 'female', labelKey: 'profile.gender_female' },
  { value: 'other', labelKey: 'profile.gender_other' },
];

export const MARITAL_OPTIONS: { value: MaritalStatus; labelKey: string }[] = [
  { value: 'single', labelKey: 'profile.marital_single' },
  { value: 'married', labelKey: 'profile.marital_married' },
  { value: 'divorced', labelKey: 'profile.marital_divorced' },
  { value: 'widowed', labelKey: 'profile.marital_widowed' },
  { value: 'other', labelKey: 'profile.marital_other' },
];

export const CHILDREN_OPTIONS: { value: ChildrenStatus; labelKey: string }[] = [
  { value: 'none', labelKey: 'profile.children_none' },
  { value: 'has_children', labelKey: 'profile.children_has_children' },
];

export function calcAgeFromDob(dateOfBirth?: string): number | undefined {
  if (!dateOfBirth) return undefined;
  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age;
}
