import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SERVICE_DIRECTIONS } from '../../constants/categories';
import { cn } from '../../lib/utils';

export function SkillsSelector({
  value,
  onChange,
  editable = true,
}: {
  value: string[];
  onChange?: (skills: string[]) => void;
  editable?: boolean;
}) {
  const { t } = useTranslation();

  const labelFor = (skill: string) => {
    const dir = SERVICE_DIRECTIONS.find(
      (d) => d.id === skill || d.name.toLowerCase() === skill.toLowerCase(),
    );
    if (dir) return t(`categories.${dir.id}`, { defaultValue: dir.name });
    return skill;
  };

  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of value) {
      const dir = SERVICE_DIRECTIONS.find(
        (d) => d.id === item || d.name.toLowerCase() === item.toLowerCase(),
      );
      set.add(dir ? dir.id : item);
    }
    return set;
  }, [value]);

  const add = (id: string) => {
    if (!onChange || selectedIds.has(id)) return;
    onChange([...value, id]);
  };

  const remove = (skill: string) => {
    onChange?.(value.filter((s) => s !== skill));
  };

  const available = SERVICE_DIRECTIONS.filter((d) => !selectedIds.has(d.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('profile.no_skills_yet')}</p>
        )}
        {value.map((skill) => (
          <span
            key={skill}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            {labelFor(skill)}
            {editable && (
              <button
                type="button"
                aria-label={t('profile.remove_skill_aria', { skill: labelFor(skill) })}
                onClick={() => remove(skill)}
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>

      {editable && available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.map((dir) => (
            <button
              key={dir.id}
              type="button"
              onClick={() => add(dir.id)}
              className={cn(
                'rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary',
              )}
            >
              + {t(`categories.${dir.id}`, { defaultValue: dir.name })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
