import { useState } from 'react';
import { Sparkles, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

/** Worker-facing AI resume improvement suggestions (reads the worker's own profile server-side). */
export function ResumeAiCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function handleSuggest() {
    setLoading(true);
    setError('');
    try {
      const lang = ((i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2) as 'uz' | 'ru' | 'en');
      const res = await api.ai.resume({ userId, language: lang });
      setText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-violet-500" />
          <h3 className="font-bold">{t('profile.ai_resume_advice')}</h3>
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
        >
          {loading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t('profile.ai_get_advice')}
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {t('profile.ai_resume_desc')}
      </p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {text && (
        <div className="whitespace-pre-wrap rounded-xl bg-secondary/50 p-4 text-sm leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}
