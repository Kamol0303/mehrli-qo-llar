import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Shield, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';
import { api } from '../../lib/api';

export default function SafetyPage() {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [sosSent, setSosSent] = useState<{ summary: string } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleSos = async () => {
    setSending(true);
    setError('');
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
              resolve();
            },
            () => resolve(),
            { timeout: 3000 },
          );
        });
      }
      const res = await api.safety.triggerSos({
        lat,
        lng,
        message: note.trim() || undefined,
      });
      setSosSent({ summary: res.trustedSummary });
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSending(false);
    }
  };

  return (
    <DrawerPageShell title={t('drawer.safety')}>
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-foreground">{t('yandex.sos_button')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('yandex.sos_sent_desc')}</p>
          </div>
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('yandex.note_placeholder')}
          className="w-full min-h-[44px] rounded-xl border border-border bg-card px-3 text-sm"
        />

        {error && (
          <div role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {sosSent && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">{t('yandex.sos_sent_title')}</p>
              <p>{sosSent.summary}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSos()}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          {t('yandex.sos_button')}
        </button>
      </div>

      <div className="rounded-2xl border border-border border-l-4 border-l-[#1a7c78] bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 font-extrabold text-sm text-foreground">
          <Shield className="h-4 w-4 text-[#1a7c78]" />
          {t('onboarding.privacy_note')}
        </div>
        <p className="text-xs text-muted-foreground">{t('yandex.background_gps_note')}</p>
      </div>

      <Link
        to="/trusted-contacts"
        className="flex min-h-[48px] items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground hover:bg-secondary"
      >
        <span className="flex items-center gap-2.5">
          <Users className="h-4 w-4 text-[#1a7c78]" />
          {t('drawer.trusted_contacts')}
        </span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </DrawerPageShell>
  );
}
