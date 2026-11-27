import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Loader, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useSubscription } from '../../context/SubscriptionContext';
import { formatSom } from '../../constants/yandexServices';

function formatCard(raw: string): string {
  const digits = raw.replace(/\s/g, '');
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Payment frame. Opens on the Super Admin panel only after the month has ended. */
export default function SubscriptionBlock() {
  const { t, i18n } = useTranslation();
  const { status, refresh } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<{ cardNumber: string; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!status?.blocked) return;
    let cancelled = false;
    setLoading(true);
    api.subscription
      .pay()
      .then((details) => {
        if (!cancelled) setCard(details);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status?.blocked, t]);

  if (!status?.blocked) return null;

  const amount = card?.amount ?? status.priceSom ?? 0;

  async function handleConfirmPayment() {
    setLoading(true);
    setError(null);
    try {
      await api.subscription.confirmPayment();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('profile.payment_confirm_err'));
    } finally {
      setLoading(false);
    }
  }

  async function copyCard() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.cardNumber.replace(/\s/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-pay-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#c6a15b] bg-card p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <CreditCard className="h-7 w-7 text-[#1a7c78]" />
          </div>
          <h2 id="subscription-pay-title" className="text-2xl font-black text-foreground">
            {t('profile.subscription_pay_title')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('profile.subscription_pay_desc')}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-secondary/40 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('profile.card_number')}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="font-mono text-lg font-black tracking-wider text-foreground">
                {card ? formatCard(card.cardNumber) : loading ? '...' : '—'}
              </p>
              {card && (
                <button
                  type="button"
                  onClick={copyCard}
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold"
                >
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  {copied ? t('profile.copied_card') : t('profile.copy_card')}
                </button>
              )}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('profile.amount_label')}</p>
            <p className="text-xl font-black text-foreground">{formatSom(amount, i18n.language)}</p>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {t('profile.payment_instruction')}
          </p>
          <button
            type="button"
            onClick={handleConfirmPayment}
            disabled={loading || !card}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a7c78] font-bold text-white disabled:opacity-50"
          >
            {loading ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            {t('profile.confirm_payment_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
