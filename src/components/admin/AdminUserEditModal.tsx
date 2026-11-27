import React, { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

export interface EditableAdminUser {
  uid: string;
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role: 'worker' | 'employer' | 'admin' | 'super_admin';
  region?: string | null;
  district?: string | null;
  profession?: string | null;
  skills?: string[] | null;
  companyName?: string | null;
  bio?: string | null;
  isVerified?: boolean;
  isBlocked?: boolean;
}

interface AdminUserEditModalProps {
  user: EditableAdminUser;
  onClose: () => void;
  onSaved: (updated: EditableAdminUser) => void;
}

export default function AdminUserEditModal({ user, onClose, onSaved }: AdminUserEditModalProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(user.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<EditableAdminUser['role']>(user.role);
  const [region, setRegion] = useState(user.region || 'Samarqand viloyati');
  const [district, setDistrict] = useState(user.district || '');
  const [profession, setProfession] = useState(user.profession || '');
  const [skillsText, setSkillsText] = useState((user.skills || []).join(', '));
  const [companyName, setCompanyName] = useState(user.companyName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [isVerified, setIsVerified] = useState(Boolean(user.isVerified));
  const [isBlocked, setIsBlocked] = useState(Boolean(user.isBlocked));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFullName(user.fullName || '');
    setPhoneNumber(user.phoneNumber || '');
    setEmail(user.email || '');
    setRole(user.role);
    setRegion(user.region || 'Samarqand viloyati');
    setDistrict(user.district || '');
    setProfession(user.profession || '');
    setSkillsText((user.skills || []).join(', '));
    setCompanyName(user.companyName || '');
    setBio(user.bio || '');
    setIsVerified(Boolean(user.isVerified));
    setIsBlocked(Boolean(user.isBlocked));
    setError('');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (fullName.trim().length < 2) {
      setError(t('common.required_field'));
      return;
    }

    setSaving(true);
    try {
      const skillsArray = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.adminYandex.updateUser(user.uid, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        email: email.trim() || null,
        role,
        region: region.trim() || undefined,
        district: district.trim() || null,
        profession: profession.trim() || null,
        skills: skillsArray,
        companyName: companyName.trim() || null,
        bio: bio.trim() || null,
        isVerified,
        isBlocked,
      });

      const u = res.user as Record<string, unknown>;
      onSaved({
        uid: String(u.uid || user.uid),
        fullName: String(u.fullName || fullName.trim()),
        email: u.email != null ? String(u.email) : null,
        phoneNumber: u.phoneNumber != null ? String(u.phoneNumber) : null,
        role: (String(u.role || role) as EditableAdminUser['role']),
        region: u.region != null ? String(u.region) : region.trim(),
        district: u.district != null ? String(u.district) : null,
        profession: u.profession != null ? String(u.profession) : null,
        skills: Array.isArray(u.skills) ? (u.skills as string[]) : skillsArray,
        companyName: u.companyName != null ? String(u.companyName) : null,
        bio: u.bio != null ? String(u.bio) : null,
        isVerified: Boolean(u.isVerified),
        isBlocked: Boolean(u.isBlocked),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('super_admin.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-foreground">{t('super_admin.edit_user_modal_title')}</h2>
            <p className="text-xs text-muted-foreground font-mono">{user.uid}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="edit-fullName" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('auth.full_name')}
              </label>
              <input
                id="edit-fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-role" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('super_admin.role_label')}
              </label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) => setRole(e.target.value as EditableAdminUser['role'])}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground"
              >
                <option value="worker">{t('auth.worker')}</option>
                <option value="employer">{t('auth.employer')}</option>
                <option value="admin">{t('auth.admin')}</option>
                <option value="super_admin">{t('auth.super_admin')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-phone" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('auth.phone')}
              </label>
              <input
                id="edit-phone"
                type="text"
                value={phoneNumber}
                placeholder="+998901234567"
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium tabular-nums text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-email" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('auth.email')}
              </label>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-region" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('super_admin.field_region')}
              </label>
              <input
                id="edit-region"
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-district" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('super_admin.field_district')}
              </label>
              <input
                id="edit-district"
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-profession" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('super_admin.field_profession')}
              </label>
              <input
                id="edit-profession"
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>

            <div>
              <label htmlFor="edit-company" className="mb-1 block text-xs font-bold text-muted-foreground">
                {t('super_admin.field_company')}
              </label>
              <input
                id="edit-company"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-skills" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('super_admin.field_skills_hint')}
            </label>
            <input
              id="edit-skills"
              type="text"
              value={skillsText}
              placeholder="house_cleaning, hotel_cleaning"
              onChange={(e) => setSkillsText(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
            />
          </div>

          <div>
            <label htmlFor="edit-bio" className="mb-1 block text-xs font-bold text-muted-foreground">
              {t('profile.bio')}
            </label>
            <textarea
              id="edit-bio"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm font-medium text-foreground"
            />
          </div>

          <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-background p-3.5">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
                className="h-4 w-4 accent-[#1a7c78]"
              />
              {t('super_admin.field_verified')}
            </label>

            {role !== 'super_admin' && (
              <label className="inline-flex items-center gap-2 text-xs font-bold text-rose-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBlocked}
                  onChange={(e) => setIsBlocked(e.target.checked)}
                  className="h-4 w-4 accent-rose-600"
                />
                {t('super_admin.field_blocked')}
              </label>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-border bg-background px-4 text-xs font-bold text-foreground hover:bg-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#1a7c78] px-5 text-xs font-extrabold text-white hover:bg-[#146460] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
