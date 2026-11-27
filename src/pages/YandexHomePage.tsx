import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  AlertTriangle,
  Baby,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSignature,
  HeartHandshake,
  Home,
  Loader2,
  LocateFixed,
  MapPin,
  Menu,
  MessageSquare,
  Navigation,
  Phone,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import type {
  NearbyAnonWorker,
  OrderLifecycleStatus,
  TariffRate,
  WorkerLiveStatus,
  WorkerOffer,
  YandexDurationType,
  YandexOrder,
  YandexServiceType,
} from '../types';
import {
  SAMARKAND_DEFAULT_COORDS,
  SAMARKAND_DISTRICTS,
  YANDEX_DURATIONS,
  YANDEX_SERVICES,
  formatSom,
} from '../constants/yandexServices';
import YandexGoMap from '../components/map/YandexGoMap';
import YandexDrawer from '../components/YandexDrawer';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';

function ServiceIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  switch (name) {
    case 'baby':
      return <Baby className={className} />;
    case 'home':
      return <Home className={className} />;
    case 'building':
      return <Building2 className={className} />;
    case 'heart':
      return <HeartHandshake className={className} />;
    case 'users':
      return <Users className={className} />;
    default:
      return <Sparkles className={className} />;
  }
}

export default function YandexHomePage() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const autostart = new URLSearchParams(location.search).get('autostart') === '1';

  const isWorker = profile?.role === 'worker';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Map & GPS coordinates
  const [mapCenter, setMapCenter] = useState<[number, number]>(SAMARKAND_DEFAULT_COORDS);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [selectedPin, setSelectedPin] = useState<[number, number]>(SAMARKAND_DEFAULT_COORDS);
  const [selectedDistrict, setSelectedDistrict] = useState('Samarqand shahar');
  const [gpsError, setGpsError] = useState(false);

  // Tariffs & Nearby obfuscated workers
  const [rates, setRates] = useState<TariffRate[]>([]);
  const [nearbyWorkers, setNearbyWorkers] = useState<NearbyAnonWorker[]>([]);

  // Employer ordering form
  const [serviceType, setServiceType] = useState<YandexServiceType>('house_cleaning');
  const [durationType, setDurationType] = useState<YandexDurationType>('half_day');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card_soon'>('cash');
  const [addressText, setAddressText] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uiError, setUiError] = useState('');
  const [uiToast, setUiToast] = useState('');

  // Active order & worker state
  const [activeOrder, setActiveOrder] = useState<YandexOrder | null>(null);
  const [ratingOrder, setRatingOrder] = useState<YandexOrder | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerLiveStatus | null>(null);
  const [activeOffer, setActiveOffer] = useState<WorkerOffer | null>(null);
  const [offerRemainingSec, setOfferRemainingSec] = useState(0);

  // Cancel & Rating & SOS states
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [stars, setStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [sosFeedback, setSosFeedback] = useState<string | null>(null);

  const lastOrderRef = useRef<YandexOrder | null>(null);
  lastOrderRef.current = activeOrder;

  const showToast = useCallback((msg: string) => {
    setUiToast(msg);
    window.setTimeout(() => {
      setUiToast((prev) => (prev === msg ? '' : prev));
    }, 3500);
  }, []);

  // Load tariffs on mount
  useEffect(() => {
    api.tariffs
      .list()
      .then((res) => setRates(res.rates))
      .catch(() => undefined);
  }, []);

  // Locate current GPS position cleanly
  const locateMe = useCallback(async () => {
    setGpsError(false);
    try {
      let lat: number;
      let lng: number;
      if (Capacitor.isNativePlatform()) {
        const pos = await Geolocation.getCurrentPosition({ timeout: 6000, enableHighAccuracy: true });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else if ('geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            enableHighAccuracy: true,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } else {
        setGpsError(true);
        return;
      }
      const next: [number, number] = [lat, lng];
      setUserLocation(next);
      setSelectedPin(next);
      setMapCenter(next);
    } catch {
      setGpsError(true);
    }
  }, []);

  useEffect(() => {
    void locateMe();
  }, [locateMe]);

  // Load active order & worker status
  const syncOrderAndWorker = useCallback(async () => {
    if (!user) return;
    try {
      const { order } = await api.orders.getActive();
      const prev = lastOrderRef.current;
      if (!order && prev && prev.status !== 'bekor_qilindi' && prev.status !== 'yakunlandi') {
        // Check if previous active order finished so we can prompt mutual rating
        const fresh = await api.orders.get(prev.id).catch(() => null);
        if (fresh?.order && fresh.order.status === 'yakunlandi') {
          const alreadyRated = isWorker ? fresh.order.workerRated : fresh.order.employerRated;
          if (!alreadyRated) {
            setRatingOrder(fresh.order);
          }
        }
      }
      setActiveOrder(order);

      if (isWorker) {
        const [st, off] = await Promise.all([
          api.workerLive.getStatus().catch(() => null),
          api.workerLive.getActiveOffer().catch(() => ({ offer: null })),
        ]);
        if (st) setWorkerStatus(st);
        setActiveOffer(off.offer);
      }
    } catch {
      /* ignore transient */
    }
  }, [user, isWorker]);

  useEffect(() => {
    void syncOrderAndWorker();
  }, [syncOrderAndWorker]);

  // Load obfuscated pre-accept nearby workers when Employer is idle
  useEffect(() => {
    if (!user || isWorker || activeOrder) {
      setNearbyWorkers([]);
      return;
    }
    let cancelled = false;
    api.map
      .nearbyWorkers({
        lat: selectedPin[0],
        lng: selectedPin[1],
        radiusKm: 15,
        serviceType,
      })
      .then((res) => {
        if (!cancelled) setNearbyWorkers(res.workers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, isWorker, activeOrder, selectedPin, serviceType]);

  // SSE Realtime events + fallback 4s poll
  const { connected: sseConnected } = useRealtimeEvents(Boolean(user), (evt, payload) => {
    if (evt === 'worker_location' && payload.orderId && activeOrder?.id === payload.orderId) {
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setActiveOrder((prev) =>
          prev ? { ...prev, workerLocation: { lat, lng, updatedAt: String(payload.updatedAt || '') } } : prev,
        );
      }
      return;
    }
    if (
      evt === 'offer_received' ||
      evt === 'order_updated' ||
      evt === 'contract_updated' ||
      evt === 'verification_updated'
    ) {
      void syncOrderAndWorker();
      if (evt === 'verification_updated') void refreshProfile();
    }
  });

  useEffect(() => {
    if (!user) return;
    const ms = sseConnected ? 12000 : 4000;
    const id = window.setInterval(() => {
      void syncOrderAndWorker();
    }, ms);
    return () => window.clearInterval(id);
  }, [user, sseConnected, syncOrderAndWorker]);

  // Broadcast live worker coordinates during active accepted order (foreground only; clears on completion)
  useEffect(() => {
    if (!user || !isWorker || !activeOrder) return;
    if (!['qabul_qilindi', 'yolda', 'yetib_keldi', 'jarayonda'].includes(activeOrder.status)) return;

    const pushCurrentCoords = async () => {
      const coords = userLocation || selectedPin;
      if (!coords) return;
      await api.orders.updateLocation(activeOrder.id, { lat: coords[0], lng: coords[1] }).catch(() => undefined);
    };
    void pushCurrentCoords();
    const timer = window.setInterval(() => {
      void pushCurrentCoords();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [user, isWorker, activeOrder?.id, activeOrder?.status, userLocation, selectedPin]);

  // Countdown clock for incoming worker offer
  useEffect(() => {
    if (!activeOffer?.expiresAt) {
      setOfferRemainingSec(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((new Date(activeOffer.expiresAt).getTime() - Date.now()) / 1000));
      setOfferRemainingSec(left);
      if (left <= 0) {
        setActiveOffer(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeOffer]);

  // District selector fallback handler
  const handleDistrictSelect = (name: string) => {
    setSelectedDistrict(name);
    const d = SAMARKAND_DISTRICTS.find((x) => x.name === name);
    if (d) {
      const coords: [number, number] = [d.lat, d.lng];
      setSelectedPin(coords);
      setMapCenter(coords);
    }
  };

  // --- EMPLOYER ACTIONS ---
  const handleCreateOrder = async () => {
    if (!user) {
      navigate('/auth?mode=register');
      return;
    }
    setUiError('');
    setSubmitting(true);
    try {
      const res = await api.orders.create({
        serviceType,
        durationType,
        paymentMethod,
        lat: selectedPin[0],
        lng: selectedPin[1],
        addressText: addressText.trim() || undefined,
        district: selectedDistrict,
        note: orderNote.trim() || undefined,
      });
      setActiveOrder(res.order);
      setAddressText('');
      setOrderNote('');
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitionOrder = async (orderId: string, nextStatus: OrderLifecycleStatus, reason?: string) => {
    setUiError('');
    setSubmitting(true);
    try {
      const res = await api.orders.transition(orderId, nextStatus, reason);
      if (nextStatus === 'bekor_qilindi') {
        setActiveOrder(null);
        setCancelOpen(false);
        setCancelReason('');
      } else if (nextStatus === 'yakunlandi') {
        setActiveOrder(null);
        setRatingOrder(res.order);
      } else {
        await syncOrderAndWorker();
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignContractInline = async (order: YandexOrder) => {
    if (!order.contractId || !profile) return;
    setSubmitting(true);
    setUiError('');
    try {
      const updates: Record<string, unknown> =
        profile.role === 'worker' ? { signedByWorker: true } : { signedByEmployer: true };
      await api.contracts.update(order.contractId, updates);
      await syncOrderAndWorker();
      showToast(t('yandex.both_signed'));
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  // --- WORKER ACTIONS ---
  const handleToggleOnline = async () => {
    if (!workerStatus) return;
    setUiError('');
    setSubmitting(true);
    try {
      const coords = userLocation || selectedPin;
      const updated = await api.workerLive.updateStatus({
        isOnline: !workerStatus.isOnline,
        lat: coords[0],
        lng: coords[1],
        backgroundConsent: true,
      });
      setWorkerStatus(updated);
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleWorkerService = async (srv: YandexServiceType) => {
    if (!workerStatus) return;
    const exists = workerStatus.serviceTypes.includes(srv);
    const next = exists
      ? workerStatus.serviceTypes.filter((s) => s !== srv)
      : [...workerStatus.serviceTypes, srv];
    const updated = await api.workerLive.updateStatus({ serviceTypes: next }).catch(() => null);
    if (updated) setWorkerStatus(updated);
  };

  const handleRadiusChange = async (radiusKm: number) => {
    const updated = await api.workerLive.updateStatus({ radiusKm }).catch(() => null);
    if (updated) setWorkerStatus(updated);
  };

  const handleAcceptOffer = async (offerId: string) => {
    setSubmitting(true);
    setUiError('');
    try {
      await api.workerLive.acceptOffer(offerId);
      setActiveOffer(null);
      await syncOrderAndWorker();
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    setSubmitting(true);
    try {
      await api.workerLive.rejectOffer(offerId);
      setActiveOffer(null);
    } finally {
      setSubmitting(false);
    }
  };

  // --- SAFETY: SOS & SHARE & RATING ---
  const handleSos = async () => {
    if (!user) return;
    try {
      const coords = userLocation || selectedPin;
      const res = await api.safety.triggerSos({
        orderId: activeOrder?.id || null,
        lat: coords?.[0] ?? null,
        lng: coords?.[1] ?? null,
        message: 'Ilovadan tezkor SOS signali',
      });
      setSosFeedback(res.trustedSummary);
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    }
  };

  const handleShareOrder = async () => {
    if (!activeOrder) return;
    try {
      const res = await api.orders.share(activeOrder.id);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(res.shareText).catch(() => undefined);
      }
      showToast(t('yandex.share_copied'));
    } catch {
      /* ignore */
    }
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingOrder) return;
    setSubmitting(true);
    try {
      await api.orders.rate(ratingOrder.id, { rating: stars, comment: ratingComment.trim() || undefined });
      setRatingOrder(null);
      setRatingComment('');
      setStars(5);
      showToast(t('reviews.saved'));
    } catch (err) {
      setUiError(err instanceof Error ? err.message : t('errors.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  const activeOrderDisplayPin: [number, number] | null = activeOrder?.lat && activeOrder?.lng
    ? [activeOrder.lat, activeOrder.lng]
    : !isWorker && !activeOrder
      ? selectedPin
      : null;

  const activeWorkerMapLoc: [number, number] | null = activeOrder?.workerLocation
    ? [activeOrder.workerLocation.lat, activeOrder.workerLocation.lng]
    : null;

  const hasAcceptedOrder =
    Boolean(activeOrder) &&
    ['qabul_qilindi', 'yolda', 'yetib_keldi', 'jarayonda'].includes(activeOrder!.status);

  const partnerInfo = isWorker ? activeOrder?.employer : activeOrder?.worker;
  const mySignedContract = isWorker
    ? Boolean(activeOrder?.contract?.signedByWorker)
    : Boolean(activeOrder?.contract?.signedByEmployer);
  const bothSigned = Boolean(
    activeOrder?.contractSigned ||
      (activeOrder?.contract?.signedByWorker && activeOrder?.contract?.signedByEmployer),
  );

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background text-foreground">
      {/* 1. Fullscreen Map */}
      <YandexGoMap
        center={
          hasAcceptedOrder && activeOrderDisplayPin
            ? activeOrderDisplayPin
            : mapCenter
        }
        selectedPin={activeOrderDisplayPin}
        interactivePin={!isWorker && !activeOrder}
        onPinChange={(coords) => {
          setSelectedPin(coords);
        }}
        nearbyWorkers={!isWorker && !activeOrder ? nearbyWorkers : []}
        workerLocation={activeWorkerMapLoc}
        orderStatus={activeOrder?.status || null}
        userLocation={userLocation}
        className="w-full h-full"
      />

      {/* 2. Floating Top Controls (Left Hamburger Menu + Right Locate Me / Safety) */}
      <div className="absolute top-4 left-4 right-4 z-[600] flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('drawer.menu')}
          className="pointer-events-auto min-h-[46px] min-w-[46px] rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-lg flex items-center justify-center text-[#102833] dark:text-white hover:bg-card"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="pointer-events-auto flex items-center gap-2">
          {hasAcceptedOrder && (
            <>
              <button
                type="button"
                onClick={() => void handleShareOrder()}
                className="min-h-[44px] px-3.5 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-lg inline-flex items-center gap-1.5 text-xs font-bold text-[#102833] dark:text-white"
              >
                <Share2 className="w-4 h-4 text-[#1a7c78]" />
                <span>{t('yandex.share_button')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSos()}
                className="min-h-[44px] px-3.5 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/30 inline-flex items-center gap-1.5 text-xs font-extrabold"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{t('yandex.sos_button')}</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void locateMe()}
            aria-label={t('yandex.locate_me')}
            className="min-h-[46px] min-w-[46px] rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-lg flex items-center justify-center text-[#1a7c78] hover:bg-card"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating Feedback Toasts */}
      {(uiToast || uiError || sosFeedback) && (
        <div className="absolute top-20 left-4 right-4 z-[650] max-w-md mx-auto space-y-2 pointer-events-none">
          {uiToast && (
            <div className="pointer-events-auto rounded-2xl bg-[#102833] text-white px-4 py-3 text-xs font-semibold shadow-xl flex items-center justify-between gap-2">
              <span>{uiToast}</span>
              <button type="button" onClick={() => setUiToast('')} aria-label="Yopish">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {uiError && (
            <div className="pointer-events-auto rounded-2xl bg-rose-600 text-white px-4 py-3 text-xs font-semibold shadow-xl flex items-center justify-between gap-2">
              <span>{uiError}</span>
              <button type="button" onClick={() => setUiError('')} aria-label="Yopish">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {sosFeedback && (
            <div className="pointer-events-auto rounded-2xl bg-rose-950 text-white border border-rose-500 px-4 py-3 text-xs shadow-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold">{t('yandex.sos_sent_title')}</span>
                <button type="button" onClick={() => setSosFeedback(null)} aria-label="Yopish">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-rose-200">{t('yandex.sos_sent_desc')}</p>
              <p className="text-rose-300 text-[11px]">{sosFeedback}</p>
            </div>
          )}
        </div>
      )}

      {/* 3. Adaptive Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 z-[600] max-h-[60dvh] md:max-h-[calc(100dvh-2rem)] md:left-4 md:bottom-4 md:right-auto md:w-[440px] flex flex-col">
        <div className="bg-card/98 backdrop-blur-xl border-t md:border border-border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-y-auto px-4 pt-3 pb-4 md:p-5 space-y-3">
          <div className="w-10 h-1 rounded-full bg-border mx-auto md:hidden shrink-0" />

          {/* MUTUAL RATING SHEET AFTER COMPLETION */}
          {ratingOrder ? (
            <form onSubmit={handleSubmitRating} className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-foreground">{t('yandex.rate_partner_title')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t('yandex.rate_partner_desc')}</p>
              </div>

              <div className="flex items-center justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} yulduz`}
                    className="p-2 rounded-xl hover:bg-secondary transition-colors"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        n <= stars ? 'fill-[#c6a15b] text-[#c6a15b]' : 'text-muted-foreground'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                rows={2}
                placeholder={t('reviews.comment_placeholder')}
                className="w-full px-4 py-3 rounded-2xl border border-border bg-background text-sm"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm"
                >
                  {t('yandex.submit_rating')}
                </button>
                <button
                  type="button"
                  onClick={() => setRatingOrder(null)}
                  className="min-h-[48px] px-4 rounded-2xl border border-border text-xs font-bold text-muted-foreground"
                >
                  {t('yandex.skip_rating')}
                </button>
              </div>
            </form>
          ) : isWorker ? (
            /* WORKER BOTTOM SHEET */
            activeOffer ? (
              /* INCOMING OFFER CARD */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#1a7c78]">{t('yandex.incoming_offer')}</p>
                    <h2 className="text-lg font-extrabold text-foreground">
                      {t(`services.${activeOffer.serviceType}`)} · {t(`durations.${activeOffer.durationType}`)}
                    </h2>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-sm font-extrabold text-[#102833] dark:text-white">
                      {t('yandex.offer_countdown', { sec: offerRemainingSec })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span className="font-bold text-foreground">{formatSom(activeOffer.recommendedRate)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('yandex.distance_eta', { km: activeOffer.distanceKm.toFixed(1), min: activeOffer.etaMin })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeOffer.district || selectedDistrict}</span>
                  <span aria-hidden="true">·</span>
                  <span>★ {(activeOffer.employerRating ?? 5).toFixed(1)}</span>
                </div>

                <p className="text-[11px] text-muted-foreground">{t('yandex.penalty_free_note')}</p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleRejectOffer(activeOffer.id)}
                    className="min-h-[50px] rounded-2xl border border-border bg-secondary text-foreground font-bold text-sm"
                  >
                    {t('yandex.reject_offer')}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleAcceptOffer(activeOffer.id)}
                    className="min-h-[50px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm shadow-lg shadow-[#1a7c78]/25"
                  >
                    {t('yandex.accept_offer')}
                  </button>
                </div>
              </div>
            ) : activeOrder ? (
              /* WORKER ACTIVE ORDER LIFECYCLE SHEET */
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#1a7c78]">
                      {t(`yandex.status_${activeOrder.status}`)}
                    </p>
                    <h2 className="text-lg font-extrabold text-foreground">
                      {t(`services.${activeOrder.serviceType}`)} · {t(`durations.${activeOrder.durationType}`)}
                    </h2>
                  </div>
                  <p className="text-sm font-extrabold tabular-nums">{formatSom(activeOrder.agreedRate)}</p>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/45">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#102833] text-white flex items-center justify-center shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">
                        {partnerInfo?.fullName || activeOrder.employerName || 'Ish beruvchi'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activeOrder.addressText || activeOrder.district || 'Tuman belgilangan'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {partnerInfo?.phoneNumber && (
                      <a
                        href={`tel:${partnerInfo.phoneNumber}`}
                        aria-label={t('yandex.call')}
                        className="min-h-[42px] min-w-[42px] rounded-xl bg-card border border-border flex items-center justify-center text-[#1a7c78]"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {partnerInfo?.id && (
                      <Link
                        to={`/chat?with=${partnerInfo.id}`}
                        aria-label={t('yandex.chat')}
                        className="min-h-[42px] min-w-[42px] rounded-xl bg-card border border-border flex items-center justify-center text-[#102833] dark:text-white"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>

                {activeOrder.lat != null && activeOrder.lng != null && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${activeOrder.lat}&mlon=${activeOrder.lng}#map=16/${activeOrder.lat}/${activeOrder.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full min-h-[42px] rounded-xl border border-border bg-secondary/35 flex items-center justify-center gap-2 text-xs font-bold text-[#102833] dark:text-white"
                  >
                    <Navigation className="w-4 h-4 text-[#1a7c78]" />
                    <span>{t('yandex.open_external_map')}</span>
                  </a>
                )}

                {/* Digital Contract Step */}
                {activeOrder.contractId && (
                  <div className="p-3.5 rounded-2xl border border-[#c6a15b]/60 bg-secondary/30 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <FileSignature className="w-4 h-4 text-[#c6a15b]" />
                        {t('yandex.digital_contract')}
                      </span>
                      <span className={bothSigned ? 'text-emerald-600' : 'text-amber-600'}>
                        {bothSigned
                          ? t('yandex.both_signed')
                          : mySignedContract
                            ? t('yandex.waiting_partner_sign')
                            : t('yandex.sign_contract')}
                      </span>
                    </div>
                    {!mySignedContract && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleSignContractInline(activeOrder)}
                        className="w-full min-h-[44px] rounded-xl bg-[#102833] text-white text-xs font-bold"
                      >
                        {t('yandex.sign_contract')}
                      </button>
                    )}
                  </div>
                )}

                {/* Worker Progression Controls */}
                <div className="flex gap-2">
                  {activeOrder.status === 'qabul_qilindi' && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleTransitionOrder(activeOrder.id, 'yolda')}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm"
                    >
                      {t('yandex.on_the_way')}
                    </button>
                  )}
                  {activeOrder.status === 'yolda' && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleTransitionOrder(activeOrder.id, 'yetib_keldi')}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm"
                    >
                      {t('yandex.arrived')}
                    </button>
                  )}
                  {activeOrder.status === 'yetib_keldi' && (
                    <button
                      type="button"
                      disabled={submitting || !bothSigned}
                      onClick={() => void handleTransitionOrder(activeOrder.id, 'jarayonda')}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#1a7c78] text-white font-bold text-sm disabled:opacity-45"
                    >
                      {t('yandex.start_work')}
                    </button>
                  )}
                  {activeOrder.status === 'jarayonda' && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleTransitionOrder(activeOrder.id, 'yakunlandi')}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#102833] text-white font-bold text-sm"
                    >
                      {t('yandex.finish_work')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="min-h-[48px] px-4 rounded-2xl border border-rose-300 text-rose-700 text-xs font-bold"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              /* WORKER IDLE / GO ONLINE SHEET */
              <div className="space-y-4">
                {!workerStatus?.kycVerified && (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                        {t('yandex.kyc_required_banner')}
                      </p>
                    </div>
                    <Link
                      to="/verification"
                      className="shrink-0 min-h-[38px] px-3 inline-flex items-center rounded-xl bg-[#102833] text-white text-xs font-bold whitespace-nowrap"
                    >
                      KYC
                    </Link>
                  </div>
                )}

                <button
                  type="button"
                  disabled={submitting || !workerStatus?.kycVerified}
                  onClick={() => void handleToggleOnline()}
                  className={`w-full min-h-[54px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-45 ${
                    workerStatus?.isOnline
                      ? 'bg-[#1a7c78] text-white shadow-lg shadow-[#1a7c78]/25'
                      : 'bg-[#102833] text-white'
                  }`}
                >
                  <span>
                    {workerStatus?.isOnline ? t('yandex.worker_online') : t('yandex.worker_online_toggle')}
                  </span>
                </button>

                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-2">{t('yandex.service_filters')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {YANDEX_SERVICES.map((srv) => {
                      const active = workerStatus?.serviceTypes?.includes(srv.id) ?? false;
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => void handleToggleWorkerService(srv.id)}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition-colors ${
                            active
                              ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#102833] dark:text-white'
                              : 'border-border bg-secondary/35 text-muted-foreground'
                          }`}
                        >
                          <ServiceIcon name={srv.iconName} className="w-4 h-4 shrink-0 text-[#1a7c78]" />
                          <span className="truncate">{t(srv.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {t('yandex.radius_label', { km: workerStatus?.radiusKm ?? 15 })}
                  </span>
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 25].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => void handleRadiusChange(r)}
                        className={`min-h-[34px] px-2.5 rounded-lg text-xs font-bold tabular-nums ${
                          (workerStatus?.radiusKm ?? 15) === r
                            ? 'bg-[#102833] text-white'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">{t('yandex.background_gps_note')}</p>
              </div>
            )
          ) : /* EMPLOYER BOTTOM SHEET */
          activeOrder ? (
            /* ACTIVE ORDER TRACKING FOR EMPLOYER */
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#1a7c78]">
                    {t(`yandex.status_${activeOrder.status}`)}
                  </p>
                  <h2 className="text-lg font-extrabold text-foreground">
                    {t(`services.${activeOrder.serviceType}`)} · {t(`durations.${activeOrder.durationType}`)}
                  </h2>
                </div>
                <p className="text-sm font-extrabold tabular-nums">{formatSom(activeOrder.recommendedRate)}</p>
              </div>

              {activeOrder.status === 'qidirilmoqda' || activeOrder.status === 'taklif_yuborildi' ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-secondary/45 flex items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-[#1a7c78] shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{t('yandex.searching_title')}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t('yandex.searching_radius', { radius: activeOrder.currentRadiusKm })}
                        {activeOrder.status === 'taklif_yuborildi' ? ` · ${t('yandex.offer_sent_hint')}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="w-full min-h-[46px] rounded-2xl border border-rose-300 text-rose-700 font-bold text-xs"
                  >
                    {t('yandex.cancel_order')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeOrder.worker && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/45">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-[#102833] text-white flex items-center justify-center overflow-hidden shrink-0">
                          {activeOrder.worker.photoUrl ? (
                            <img
                              src={activeOrder.worker.photoUrl}
                              alt={activeOrder.worker.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-extrabold text-sm truncate">{activeOrder.worker.fullName}</p>
                            {activeOrder.worker.isVerified && (
                              <ShieldCheck className="w-4 h-4 text-[#1a7c78] shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            ★ {(activeOrder.worker.rating ?? 5).toFixed(1)}
                            {activeOrder.distanceKm != null && activeOrder.etaMin != null
                              ? ` · ${t('yandex.distance_eta', { km: activeOrder.distanceKm, min: activeOrder.etaMin })}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeOrder.worker.phoneNumber && (
                          <a
                            href={`tel:${activeOrder.worker.phoneNumber}`}
                            aria-label={t('yandex.call')}
                            className="min-h-[42px] min-w-[42px] rounded-xl bg-card border border-border flex items-center justify-center text-[#1a7c78]"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                        <Link
                          to={`/chat?with=${activeOrder.worker.id}`}
                          aria-label={t('yandex.chat')}
                          className="min-h-[42px] min-w-[42px] rounded-xl bg-card border border-border flex items-center justify-center text-[#102833] dark:text-white"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  )}

                  {activeOrder.contractId && (
                    <div className="p-3.5 rounded-2xl border border-[#c6a15b]/60 bg-secondary/30 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <FileSignature className="w-4 h-4 text-[#c6a15b]" />
                          {t('yandex.digital_contract')}
                        </span>
                        <span className={bothSigned ? 'text-emerald-600' : 'text-amber-600'}>
                          {bothSigned
                            ? t('yandex.both_signed')
                            : mySignedContract
                              ? t('yandex.waiting_partner_sign')
                              : t('yandex.contract_required_note')}
                        </span>
                      </div>
                      {!mySignedContract && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleSignContractInline(activeOrder)}
                          className="w-full min-h-[44px] rounded-xl bg-[#102833] text-white text-xs font-bold"
                        >
                          {t('yandex.sign_contract')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {activeOrder.status === 'yetib_keldi' && (
                      <button
                        type="button"
                        disabled={submitting || !bothSigned}
                        onClick={() => void handleTransitionOrder(activeOrder.id, 'jarayonda')}
                        className="flex-1 min-h-[46px] rounded-2xl bg-[#1a7c78] text-white font-bold text-xs disabled:opacity-45"
                      >
                        {t('yandex.start_work')}
                      </button>
                    )}
                    {activeOrder.status === 'jarayonda' && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleTransitionOrder(activeOrder.id, 'yakunlandi')}
                        className="flex-1 min-h-[46px] rounded-2xl bg-[#102833] text-white font-bold text-xs"
                      >
                        {t('yandex.finish_work')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCancelOpen(true)}
                      className="min-h-[46px] px-4 rounded-2xl border border-rose-300 text-rose-700 font-bold text-xs"
                    >
                      {t('yandex.cancel_order')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* EMPLOYER ORDER CREATION (3-4 TAPS) */
            <div className="space-y-3">
              {gpsError && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="leading-snug">{t('yandex.manual_pin_hint')}</span>
                  <select
                    aria-label={t('yandex.district_select')}
                    value={selectedDistrict}
                    onChange={(e) => handleDistrictSelect(e.target.value)}
                    className="min-h-[34px] shrink-0 px-2.5 rounded-xl border border-border bg-background text-xs font-semibold text-foreground"
                  >
                    {SAMARKAND_DISTRICTS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {nearbyWorkers.length > 0 && (
                <p className="text-[11px] font-medium text-muted-foreground tabular-nums">
                  {t('yandex.nearby_workers_count', { count: nearbyWorkers.length })}
                </p>
              )}

              {/* Step 1: 6 Service Cards */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">{t('yandex.select_service')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {YANDEX_SERVICES.map((srv) => {
                    const active = serviceType === srv.id;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => setServiceType(srv.id)}
                        className={`min-h-[44px] px-2.5 py-2 rounded-2xl border text-left transition-all flex items-center gap-2 ${
                          active
                            ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#102833] dark:text-white'
                            : 'border-border bg-secondary/35 text-foreground hover:bg-secondary/60'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                            active ? 'bg-[#1a7c78] text-white' : 'bg-card text-[#1a7c78]'
                          }`}
                        >
                          <ServiceIcon name={srv.iconName} className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold leading-tight">{t(srv.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: 3 Durations with Recommended Tariff */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">{t('yandex.select_duration')}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {YANDEX_DURATIONS.map((dur) => {
                    const active = durationType === dur.id;
                    const price =
                      rates.find((r) => r.serviceType === serviceType && r.durationType === dur.id)?.rateSom ??
                      (dur.id === 'hourly' ? 60000 : dur.id === 'half_day' ? 180000 : 320000);
                    return (
                      <button
                        key={dur.id}
                        type="button"
                        onClick={() => setDurationType(dur.id)}
                        className={`min-h-[48px] px-2 py-1.5 rounded-2xl border text-center transition-all flex flex-col justify-center ${
                          active
                            ? 'border-[#102833] bg-[#102833] text-white'
                            : 'border-border bg-secondary/35 text-foreground'
                        }`}
                      >
                        <span className="text-xs font-bold whitespace-nowrap">{t(dur.labelKey)}</span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                            active ? 'text-[#c6a15b]' : 'text-muted-foreground'
                          }`}
                        >
                          {formatSom(price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Payment method & optional address */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${
                    paymentMethod === 'cash'
                      ? 'border-[#1a7c78] bg-[#1a7c78]/10 text-[#102833] dark:text-white'
                      : 'border-border bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  {t('yandex.payment_cash')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('card_soon');
                    showToast(t('yandex.card_soon_note'));
                  }}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-bold whitespace-nowrap inline-flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === 'card_soon'
                      ? 'border-[#c6a15b] bg-[#c6a15b]/15 text-[#102833] dark:text-white'
                      : 'border-border bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{t('yandex.payment_card_soon')}</span>
                </button>
              </div>

              <div className="relative">
                <MapPin className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  placeholder={t('yandex.address_placeholder')}
                  className="w-full min-h-[40px] pl-10 pr-4 py-1.5 rounded-2xl border border-border bg-background text-xs font-medium"
                />
              </div>

              {/* Step 4: Sticky Primary CTA always pinned above fold */}
              <div className="sticky -bottom-4 md:-bottom-5 -mx-4 md:-mx-5 px-4 md:px-5 pt-2.5 pb-4 md:pb-5 bg-card/98 backdrop-blur-xl border-t border-border/60">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleCreateOrder()}
                  className="w-full min-h-[50px] px-4 rounded-2xl bg-[#1a7c78] hover:bg-[#156865] text-white font-extrabold text-sm shadow-lg shadow-[#1a7c78]/25 flex items-center justify-center transition-all disabled:opacity-60"
                >
                  <span>{user ? t('yandex.find_worker') : t('common.register')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Order Reason Modal */}
      {cancelOpen && activeOrder && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-extrabold text-foreground">{t('yandex.cancel_confirm_title')}</h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder={t('yandex.cancel_reason_placeholder')}
              className="w-full px-4 py-3 rounded-2xl border border-border bg-background text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-border text-xs font-bold"
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  void handleTransitionOrder(activeOrder.id, 'bekor_qilindi', cancelReason.trim() || undefined)
                }
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                {t('yandex.cancel_order')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Slide-over Modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-card border border-border p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-foreground">{t('drawer.help')}</h3>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl hover:bg-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">{t('onboarding.privacy_note')}</p>
              <p>{t('yandex.contract_required_note')}</p>
              <p>{t('drawer.free_for_women_families')}</p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/safety"
                onClick={() => setHelpOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-[#102833] text-white text-xs font-bold flex items-center justify-center"
              >
                {t('drawer.safety')}
              </Link>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-h-[44px] px-4 rounded-xl border border-border text-xs font-bold"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Drawer */}
      <YandexDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        profile={profile}
        hasActiveOrder={Boolean(activeOrder)}
        onSignOut={async () => {
          await signOut();
          navigate(autostart ? '/auth?autostart=1' : '/auth', { replace: true });
        }}
        onOpenHelp={() => setHelpOpen(true)}
      />
    </div>
  );
}
