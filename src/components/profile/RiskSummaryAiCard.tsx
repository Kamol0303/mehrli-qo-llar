import { useState } from 'react';
import { Sparkles, Loader, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

/** Super Admin-only AI advisory summary of a worker's risk indicators (PII anonymized server-side). */
export function RiskSummaryAiCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function handleSummary() {
    setLoading(true);
    setError('');
    try {
      const lang = (i18n.resolvedLanguage || i18n.language || 'uz').slice(0, 2);
      const res = await api.ai.riskSummary(userId, lang);
      setText(res.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-amber-600" />
          <h3 className="font-bold text-gray-900">{t('profile.ai_risk_summary')}</h3>
        </div>
        <button
          type="button"
          onClick={handleSummary}
          disabled={loading}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50"
        >
          {loading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t('profile.ai_get_summary')}
        </button>
      </div>
      <p className="mb-3 text-xs text-amber-800">
        {t('profile.ai_risk_desc')}
      </p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {text && (
        <div className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-relaxed text-gray-800">
          {text}
        </div>
      )}
    </div>
  );
}
