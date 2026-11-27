import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EducationRecord, ExperienceRecord } from '../../types';
import { EmptyState, ProfileCard } from './ProfileCard';

function newId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function EducationEditor({
  value,
  onChange,
  editable = true,
}: {
  value: EducationRecord[];
  onChange?: (rows: EducationRecord[]) => void;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const update = (id: string, patch: Partial<EducationRecord>) => {
    onChange?.(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <ProfileCard
      title={t('profile.education')}
      description={t('profile.education_desc')}
      action={
        editable ? (
          <button
            type="button"
            onClick={() =>
              onChange?.([
                ...value,
                { id: newId(), institution: '', degree: '', startYear: '', endYear: '', notes: '' },
              ])
            }
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> {t('profile.add_short')}
          </button>
        ) : undefined
      }
    >
      {value.length === 0 ? (
        <EmptyState title={t('profile.no_education_title')} description={t('profile.no_education_desc')} />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-primary/30 pl-5">
          {value.map((row) => (
            <li key={row.id} className="relative">
              <span className="absolute -left-[1.4rem] top-2 h-3 w-3 rounded-full bg-primary" />
              {editable ? (
                <div className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-2">
                  <input
                    value={row.institution}
                    onChange={(e) => update(row.id, { institution: e.target.value })}
                    placeholder={t('profile.institution_ph')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.degree}
                    onChange={(e) => update(row.id, { degree: e.target.value })}
                    placeholder={t('profile.degree_ph')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.startYear || ''}
                    onChange={(e) => update(row.id, { startYear: e.target.value })}
                    placeholder={t('profile.start_year_ph')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.endYear || ''}
                    onChange={(e) => update(row.id, { endYear: e.target.value })}
                    placeholder={t('profile.end_year_ph')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <textarea
                    value={row.notes || ''}
                    onChange={(e) => update(row.id, { notes: e.target.value })}
                    placeholder={t('profile.notes_ph')}
                    className="min-h-16 rounded-lg border border-border px-3 py-2 text-sm md:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() => onChange?.(value.filter((r) => r.id !== row.id))}
                    className="inline-flex items-center gap-1 text-sm text-destructive md:col-span-2"
                  >
                    <Trash2 className="h-4 w-4" /> {t('common.delete')}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="font-medium">{row.degree}</p>
                  <p className="text-sm text-muted-foreground">{row.institution}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.startYear} – {row.endYear}
                  </p>
                  {row.notes && <p className="mt-1 text-sm">{row.notes}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </ProfileCard>
  );
}

export function ExperienceEditor({
  value,
  onChange,
  editable = true,
}: {
  value: ExperienceRecord[];
  onChange?: (rows: ExperienceRecord[]) => void;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const update = (id: string, patch: Partial<ExperienceRecord>) => {
    onChange?.(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <ProfileCard
      title={t('profile.experience')}
      description={t('profile.experience_desc')}
      action={
        editable ? (
          <button
            type="button"
            onClick={() =>
              onChange?.([
                ...value,
                {
                  id: newId(),
                  company: '',
                  position: '',
                  startYear: '',
                  endYear: '',
                  current: false,
                  details: '',
                  achievements: '',
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> {t('profile.add_short')}
          </button>
        ) : undefined
      }
    >
      {value.length === 0 ? (
        <EmptyState title={t('profile.no_experience_title')} description={t('profile.no_experience_desc')} />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-cyan-600/30 pl-5">
          {value.map((row) => (
            <li key={row.id} className="relative">
              <span className="absolute -left-[1.4rem] top-2 h-3 w-3 rounded-full bg-cyan-700" />
              {editable ? (
                <div className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-2">
                  <input
                    value={row.company}
                    onChange={(e) => update(row.id, { company: e.target.value })}
                    placeholder={t('profile.company')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.position}
                    onChange={(e) => update(row.id, { position: e.target.value })}
                    placeholder={t('profile.position')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.startYear || ''}
                    onChange={(e) => update(row.id, { startYear: e.target.value })}
                    placeholder={t('profile.start_year_ph')}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                  <input
                    value={row.endYear || ''}
                    onChange={(e) => update(row.id, { endYear: e.target.value })}
                    placeholder={t('profile.end_year_ph')}
                    disabled={row.current}
                    className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      checked={Boolean(row.current)}
                      onChange={(e) => update(row.id, { current: e.target.checked, endYear: e.target.checked ? '' : row.endYear })}
                    />
                    {t('profile.current_workplace')}
                  </label>
                  <textarea
                    value={row.details || ''}
                    onChange={(e) => update(row.id, { details: e.target.value })}
                    placeholder={t('profile.tasks_ph')}
                    className="min-h-16 rounded-lg border border-border px-3 py-2 text-sm md:col-span-2"
                  />
                  <textarea
                    value={row.achievements || ''}
                    onChange={(e) => update(row.id, { achievements: e.target.value })}
                    placeholder={t('profile.achievements_ph')}
                    className="min-h-16 rounded-lg border border-border px-3 py-2 text-sm md:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() => onChange?.(value.filter((r) => r.id !== row.id))}
                    className="inline-flex items-center gap-1 text-sm text-destructive md:col-span-2"
                  >
                    <Trash2 className="h-4 w-4" /> {t('common.delete')}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="font-medium">{row.position}</p>
                  <p className="text-sm text-muted-foreground">{row.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.startYear} – {row.current ? t('profile.present_time') : row.endYear}
                  </p>
                  {row.details && <p className="mt-1 text-sm">{row.details}</p>}
                  {row.achievements && <p className="mt-1 text-sm text-muted-foreground">{row.achievements}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </ProfileCard>
  );
}
