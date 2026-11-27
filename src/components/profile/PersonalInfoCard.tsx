import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Lock, Save } from 'lucide-react';
import { api } from '../../lib/api';
import {
  calcAgeFromDob,
  CHILDREN_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  PERSONAL_INFO_REQUIRED,
  type WorkerPersonalInfo,
} from '../../types/personalInfo';
import SafeSelect from '../SafeSelect';
import { SERVICE_DIRECTIONS } from '../../constants/categories';
import { validateEmail, validatePhoneNumber, formatPhoneNumber } from '../../lib/validation';
import { ProfileCard } from './ProfileCard';

const emptyInfo = (): WorkerPersonalInfo => ({
  fullName: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  childrenStatus: '',
  childrenCount: undefined,
  profession: '',
  specialty: '',
  educationLevel: '',
  nationality: '',
  citizenship: '',
  currentAddress: '',
  permanentAddress: '',
  phone: '',
  additionalPhone: '',
  email: '',
  about: '',
  notes: '',
});

function FieldLabel({
  label,
  required,
  optionalText,
}: {
  label: string;
  required?: boolean;
  optionalText: string;
}) {
  return (
    <span className="mb-1 block text-sm text-muted-foreground">
      {label}
      {required ? <span className="text-rose-500"> *</span> : (
        <span className="text-xs text-muted-foreground/70"> ({optionalText})</span>
      )}
    </span>
  );
}

export function PersonalInfoCard({
  userId,
  editable,
  seedFullName,
  seedPhone,
  seedEmail,
}: {
  userId: string;
  editable: boolean;
  seedFullName?: string;
  seedPhone?: string;
  seedEmail?: string;
}) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<WorkerPersonalInfo>(emptyInfo());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'en' ? 'en-US' : 'uz-UZ';
  const optionalText = t('common.optional_label');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.users.getPersonalInfo(userId);
        if (cancelled) return;
        const loaded = res.personalInfo || emptyInfo();
        setInfo({
          ...emptyInfo(),
          ...loaded,
          fullName: loaded.fullName || seedFullName || '',
          phone: loaded.phone || seedPhone || '',
          email: loaded.email || seedEmail || '',
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('core_indicators.load_error'));
          setInfo({
            ...emptyInfo(),
            fullName: seedFullName || '',
            phone: seedPhone || '',
            email: seedEmail || '',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, seedFullName, seedPhone, seedEmail, t]);

  const computedAge = useMemo(
    () => calcAgeFromDob(info.dateOfBirth) ?? info.age,
    [info.dateOfBirth, info.age],
  );

  const patch = (partial: Partial<WorkerPersonalInfo>) => {
    setInfo((prev) => ({ ...prev, ...partial }));
    setSuccess('');
    setError('');
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const key of PERSONAL_INFO_REQUIRED) {
      const value = info[key];
      if (value == null || String(value).trim() === '') {
        errors[key] = t('profile.req_field_err');
      }
    }
    if (info.email) {
      const e = validateEmail(info.email);
      if (!e.isValid) errors.email = e.error || t('profile.invalid_email_err');
    }
    if (info.phone) {
      const p = validatePhoneNumber(info.phone);
      if (!p.isValid) errors.phone = p.error || t('profile.invalid_phone_err');
    }
    if (info.additionalPhone) {
      const p = validatePhoneNumber(info.additionalPhone);
      if (!p.isValid) errors.additionalPhone = p.error || t('profile.invalid_phone_err');
    }
    if (info.dateOfBirth) {
      const d = new Date(info.dateOfBirth);
      if (Number.isNaN(d.getTime()) || d > new Date()) {
        errors.dateOfBirth = t('profile.invalid_date_err');
      }
    }
    if (info.childrenStatus === 'has_children') {
      const n = Number(info.childrenCount);
      if (!Number.isFinite(n) || n < 1) {
        errors.childrenCount = t('profile.enter_children_count_err');
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!editable || saving) return;
    if (!validate()) {
      setError(t('profile.fill_req_fields_err'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: WorkerPersonalInfo = {
        ...info,
        age: calcAgeFromDob(info.dateOfBirth),
        childrenCount:
          info.childrenStatus === 'none' ? 0 : info.childrenCount,
      };
      const res = await api.users.updatePersonalInfo(userId, payload);
      setInfo({ ...emptyInfo(), ...(res.personalInfo || payload) });
      setSuccess(t('profile.saved_personal_info'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('core_indicators.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ProfileCard title={t('profile.personal_info_title')}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </ProfileCard>
    );
  }

  return (
    <ProfileCard
      title={t('profile.personal_info_title')}
      description={t('profile.confidential_section_desc')}
    >
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{t('profile.confidential_privacy_note')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <FieldLabel label={t('common.full_name')} required optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.fullName || ''}
            onChange={(e) => patch({ fullName: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={120}
          />
          {fieldErrors.fullName && <p className="mt-1 text-xs text-rose-600">{fieldErrors.fullName}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.date_of_birth')} required optionalText={optionalText} />
          <input
            type="text"
            inputMode="numeric"
            placeholder="YYYY-MM-DD"
            pattern="\d{4}-\d{2}-\d{2}"
            disabled={!editable}
            value={info.dateOfBirth || ''}
            onChange={(e) => patch({ dateOfBirth: e.target.value, age: calcAgeFromDob(e.target.value) })}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-slate-900"
            style={{ colorScheme: 'light' }}
          />
          {fieldErrors.dateOfBirth && <p className="mt-1 text-xs text-rose-600">{fieldErrors.dateOfBirth}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.age')} optionalText={optionalText} />
          <input
            type="number"
            disabled
            value={computedAge ?? ''}
            className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm"
            placeholder={t('profile.age_auto')}
          />
        </label>

        <label>
          <FieldLabel label={t('profile.gender')} required optionalText={optionalText} />
          <SafeSelect
            disabled={!editable}
            value={info.gender || ''}
            onChange={(e) => patch({ gender: e.target.value as WorkerPersonalInfo['gender'] })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          >
            <option value="">{t('common.select')}</option>
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </SafeSelect>
          {fieldErrors.gender && <p className="mt-1 text-xs text-rose-600">{fieldErrors.gender}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.marital_status')} required optionalText={optionalText} />
          <SafeSelect
            disabled={!editable}
            value={info.maritalStatus || ''}
            onChange={(e) => patch({ maritalStatus: e.target.value as WorkerPersonalInfo['maritalStatus'] })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          >
            <option value="">{t('common.select')}</option>
            {MARITAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </SafeSelect>
          {fieldErrors.maritalStatus && <p className="mt-1 text-xs text-rose-600">{fieldErrors.maritalStatus}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.children_status')} required optionalText={optionalText} />
          <SafeSelect
            disabled={!editable}
            value={info.childrenStatus || ''}
            onChange={(e) =>
              patch({
                childrenStatus: e.target.value as WorkerPersonalInfo['childrenStatus'],
                childrenCount: e.target.value === 'none' ? 0 : info.childrenCount,
              })
            }
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          >
            <option value="">{t('common.select')}</option>
            {CHILDREN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </SafeSelect>
          {fieldErrors.childrenStatus && <p className="mt-1 text-xs text-rose-600">{fieldErrors.childrenStatus}</p>}
        </label>

        {info.childrenStatus === 'has_children' && (
          <label>
            <FieldLabel label={t('profile.children_count')} required optionalText={optionalText} />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              disabled={!editable}
              value={info.childrenCount ?? ''}
              onChange={(e) => patch({ childrenCount: Number(e.target.value) })}
              className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm"
            />
            {fieldErrors.childrenCount && <p className="mt-1 text-xs text-rose-600">{fieldErrors.childrenCount}</p>}
          </label>
        )}

        <div>
          <FieldLabel label={t('profile.profession')} required optionalText={optionalText} />
          <SafeSelect
            disabled={!editable}
            value={info.profession || ''}
            onChange={(e) => patch({ profession: e.target.value })}
            className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t('common.select')}</option>
            {SERVICE_DIRECTIONS.map((d) => (
              <option key={d.id} value={d.name}>
                {t(`jobs.directions.${d.id}`, { defaultValue: d.name })}
              </option>
            ))}
          </SafeSelect>
          {fieldErrors.profession && <p className="mt-1 text-xs text-rose-600">{fieldErrors.profession}</p>}
        </div>

        <div>
          <FieldLabel label={t('profile.specialty')} required optionalText={optionalText} />
          <SafeSelect
            disabled={!editable}
            value={info.specialty || ''}
            onChange={(e) => patch({ specialty: e.target.value })}
            className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t('common.select')}</option>
            {SERVICE_DIRECTIONS.map((d) => (
              <option key={d.id} value={d.name}>
                {t(`jobs.directions.${d.id}`, { defaultValue: d.name })}
              </option>
            ))}
          </SafeSelect>
          {fieldErrors.specialty && <p className="mt-1 text-xs text-rose-600">{fieldErrors.specialty}</p>}
        </div>

        <label>
          <FieldLabel label={t('profile.education_level')} required optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.educationLevel || ''}
            onChange={(e) => patch({ educationLevel: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            placeholder={t('profile.example_higher_edu')}
            maxLength={120}
          />
          {fieldErrors.educationLevel && <p className="mt-1 text-xs text-rose-600">{fieldErrors.educationLevel}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.nationality')} optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.nationality || ''}
            onChange={(e) => patch({ nationality: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={80}
          />
        </label>

        <label>
          <FieldLabel label={t('profile.citizenship')} required optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.citizenship || ''}
            onChange={(e) => patch({ citizenship: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={80}
          />
          {fieldErrors.citizenship && <p className="mt-1 text-xs text-rose-600">{fieldErrors.citizenship}</p>}
        </label>

        <label className="sm:col-span-2">
          <FieldLabel label={t('profile.current_address')} required optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.currentAddress || ''}
            onChange={(e) => patch({ currentAddress: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={300}
          />
          {fieldErrors.currentAddress && <p className="mt-1 text-xs text-rose-600">{fieldErrors.currentAddress}</p>}
        </label>

        <label className="sm:col-span-2">
          <FieldLabel label={t('profile.permanent_address')} optionalText={optionalText} />
          <input
            disabled={!editable}
            value={info.permanentAddress || ''}
            onChange={(e) => patch({ permanentAddress: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={300}
          />
        </label>

        <label>
          <FieldLabel label={t('profile.phone')} required optionalText={optionalText} />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={!editable}
            value={info.phone || ''}
            onChange={(e) => patch({ phone: formatPhoneNumber(e.target.value) })}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="+998 90 123 45 67"
          />
          {fieldErrors.phone && <p className="mt-1 text-xs text-rose-600">{fieldErrors.phone}</p>}
        </label>

        <label>
          <FieldLabel label={t('profile.additional_phone')} optionalText={optionalText} />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={!editable}
            value={info.additionalPhone || ''}
            onChange={(e) => patch({ additionalPhone: formatPhoneNumber(e.target.value) })}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="+998 ..."
          />
          {fieldErrors.additionalPhone && <p className="mt-1 text-xs text-rose-600">{fieldErrors.additionalPhone}</p>}
        </label>

        <label className="sm:col-span-2">
          <FieldLabel label={t('common.email')} required optionalText={optionalText} />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            disabled={!editable}
            value={info.email || ''}
            onChange={(e) => patch({ email: e.target.value })}
            className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={160}
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>}
        </label>

        <label className="sm:col-span-2">
          <FieldLabel label={t('profile.about_short')} optionalText={optionalText} />
          <textarea
            disabled={!editable}
            rows={3}
            value={info.about || ''}
            onChange={(e) => patch({ about: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={2000}
          />
        </label>

        <label className="sm:col-span-2">
          <FieldLabel label={t('profile.additional_notes')} optionalText={optionalText} />
          <textarea
            disabled={!editable}
            rows={2}
            value={info.notes || ''}
            onChange={(e) => patch({ notes: e.target.value })}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            maxLength={2000}
          />
        </label>
      </div>

      {(info.updatedAt || info.updatedBy) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t('profile.last_updated_at')}: {info.updatedAt ? new Date(info.updatedAt).toLocaleString(dateLocale) : '—'}
          {info.updatedByRole ? ` · ${info.updatedByRole}` : ''}
        </p>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {editable && (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? t('common.saving') : t('profile.save_personal_info_btn')}
        </button>
      )}
    </ProfileCard>
  );
}
