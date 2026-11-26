import React, { useEffect, useState } from 'react';
import { Briefcase, FileText, Loader2, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DrawerPageShell from './DrawerPageShell';
import { api } from '../../lib/api';
import { formatSom } from '../../constants/yandexServices';
import type { YandexOrder } from '../../types';
import { useAuth } from '../../hooks/useAuth';

export default function OrdersHistoryPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<YandexOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ratingTarget, setRatingTarget] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.orders.list();
      setOrders(res.orders || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRate = async (orderId: string) => {
    setSavingRating(true);
    try {
      await api.orders.rate(orderId, { rating: stars, comment: comment.trim() || undefined });
      setRatingTarget(null);
      setComment('');
      setStars(5);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSavingRating(false);
    }
  };

  const title = profile?.role === 'worker' ? t('drawer.job_history') : t('drawer.my_jobs');

  return (
    <DrawerPageShell title={title}>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#1a7c78]" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-2">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">{t('dashboard.no_jobs')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const partnerName = profile?.role === 'worker' ? order.employerName : order.workerName;
            const myRated = profile?.role === 'worker' ? Boolean(order.workerRated) : Boolean(order.employerRated);
            const isFinished = order.status === 'yakunlandi';
            const isCancelled = order.status === 'bekor_qilindi';
            const borderAccent = isFinished
              ? 'border-l-[#1a7c78]'
              : isCancelled
                ? 'border-l-rose-500'
                : 'border-l-[#c6a15b]';

            return (
              <div
                key={order.id}
                className={`rounded-2xl border border-border border-l-4 ${borderAccent} bg-card p-4 shadow-sm space-y-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#1a7c78]">
                      {t(`yandex.status_${order.status}`, { defaultValue: order.status })}
                    </div>
                    <h2 className="text-base font-extrabold text-foreground">
                      {t(`services.${order.serviceType}`)} · {t(`durations.${order.durationType}`)}
                    </h2>
                    {partnerName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{partnerName}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-foreground tabular-nums">
                      {formatSom(order.agreedRate || order.recommendedRate)} so‘m
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {(order.addressText || order.district) && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1a7c78]" />
                    <span className="truncate">{[order.district, order.addressText].filter(Boolean).join(', ')}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {order.contractId && (
                    <Link
                      to={`/contracts/${order.contractId}`}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#1a7c78]" />
                      {t('yandex.digital_contract')}
                    </Link>
                  )}

                  {isFinished && !myRated && (
                    <button
                      type="button"
                      onClick={() => {
                        setRatingTarget(ratingTarget === order.id ? null : order.id);
                        setStars(5);
                        setComment('');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#102833] px-3 text-xs font-bold text-white hover:opacity-95"
                    >
                      <Star className="h-3.5 w-3.5 text-[#c6a15b]" />
                      {t('yandex.rate_partner_title')}
                    </button>
                  )}

                  {isFinished && myRated && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                      {t('reviews.rated')}
                    </span>
                  )}
                </div>

                {ratingTarget === order.id && (
                  <div className="rounded-xl border border-border bg-background p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStars(value)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border"
                          aria-label={`${value}`}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              value <= stars ? 'fill-[#c6a15b] text-[#c6a15b]' : 'text-muted-foreground'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('reviews.comment_placeholder')}
                      className="w-full min-h-[44px] rounded-xl border border-border bg-card px-3 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingRating}
                        onClick={() => void handleRate(order.id)}
                        className="flex-1 min-h-[44px] rounded-xl bg-[#1a7c78] text-sm font-bold text-white disabled:opacity-50"
                      >
                        {t('yandex.submit_rating')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRatingTarget(null)}
                        className="min-h-[44px] rounded-xl border border-border px-4 text-sm font-semibold"
                      >
                        {t('profile.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DrawerPageShell>
  );
}
