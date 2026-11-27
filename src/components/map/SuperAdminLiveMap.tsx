import React, { useEffect, useState } from 'react';
import { AlertTriangle, Briefcase, Loader2, Phone, RefreshCw, ShieldCheck, Star, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import InteractiveLeafletMap, { MapMarkerItem } from './InteractiveLeafletMap';
import { api } from '../../lib/api';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';
import { formatSom } from '../../constants/yandexServices';

type LiveMapPayload = Awaited<ReturnType<typeof api.adminYandex.liveMap>>;

export default function SuperAdminLiveMap({
  height = '620px',
  showHeader = true,
}: {
  height?: string;
  showHeader?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<LiveMapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'worker' | 'order' | 'sos'>('all');
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.adminYandex.liveMap();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useRealtimeEvents(true, (eventType) => {
    if (eventType === 'sos_alert' || eventType === 'order_updated' || eventType === 'worker_location') {
      void load();
    }
  });

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6"
      >
        <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#1a7c78]" />
        <p className="text-xs font-semibold text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  const workers = data?.workers || [];
  const orders = data?.orders || [];
  const sosList = data?.sos || [];

  const markers: MapMarkerItem[] = [];

  if (filterType === 'all' || filterType === 'worker') {
    workers.forEach((w) => {
      markers.push({
        id: `worker_${w.uid}`,
        type: 'worker',
        lat: w.lat,
        lng: w.lng,
        title: w.fullName,
        subtitle: `${w.isOnline ? t('super_admin.online_badge') : t('super_admin.offline_badge')} · ${w.district || t('districts.samarkand_city')}`,
        rating: w.rating,
        availability: w.isOnline ? 'available' : 'busy',
        actionLabel: t('notifications.view_details'),
        onAction: () => setSelectedEntity({ ...w, entityType: 'worker' }),
      });
    });
  }

  if (filterType === 'all' || filterType === 'order') {
    orders.forEach((o) => {
      if (o.lat == null || o.lng == null) return;
      markers.push({
        id: `order_${o.id}`,
        type: 'job',
        lat: o.lat,
        lng: o.lng,
        title: `${t(`services.${o.serviceType}`)} (${t(`yandex.status_${o.status}`)})`,
        subtitle: `${o.employerName || '—'} · ${formatSom(o.agreedRate || o.recommendedRate, i18n.language)}`,
        actionLabel: t('notifications.view_details'),
        onAction: () => setSelectedEntity({ ...o, entityType: 'order' }),
      });
    });
  }

  if (filterType === 'all' || filterType === 'sos') {
    sosList.forEach((s) => {
      markers.push({
        id: `sos_${s.id}`,
        type: 'dispute',
        lat: s.lat,
        lng: s.lng,
        title: `SOS: ${s.userName || s.userId}`,
        subtitle: s.message || s.status,
        actionLabel: t('notifications.view_details'),
        onAction: () => setSelectedEntity({ ...s, entityType: 'sos' }),
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-foreground tracking-tight">{t('super_admin.nav_dashboard')}</h3>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={t('super_admin.refresh_map_aria')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                filterType === 'all' ? 'bg-[#102833] text-white' : 'bg-secondary text-foreground'
              }`}
            >
              {t('common.all')} ({workers.length + orders.length + sosList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('worker')}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold ${
                filterType === 'worker' ? 'bg-[#1a7c78] text-white' : 'bg-secondary text-foreground'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              {t('super_admin.online_workers')} ({workers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('order')}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold ${
                filterType === 'order' ? 'bg-[#102833] text-white' : 'bg-secondary text-foreground'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              {t('super_admin.active_orders')} ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('sos')}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold ${
                filterType === 'sos' ? 'bg-rose-600 text-white' : 'bg-secondary text-foreground'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('super_admin.open_sos')} ({sosList.length})
            </button>
          </div>
        </div>
      )}

      <div style={{ height }} className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
        <InteractiveLeafletMap
          markers={markers}
          center={[39.6542, 66.9597]}
          zoom={12}
          selectedId={selectedMarkerId}
          onMarkerSelect={(m) => {
            setSelectedMarkerId(m.id);
            const foundW = workers.find((w) => `worker_${w.uid}` === m.id);
            if (foundW) return setSelectedEntity({ ...foundW, entityType: 'worker' });
            const foundO = orders.find((o) => `order_${o.id}` === m.id);
            if (foundO) return setSelectedEntity({ ...foundO, entityType: 'order' });
            const foundS = sosList.find((s) => `sos_${s.id}` === m.id);
            if (foundS) return setSelectedEntity({ ...foundS, entityType: 'sos' });
          }}
          className="h-full w-full"
        />

        {selectedEntity && (
          <div className="absolute left-4 top-4 z-[500] w-full max-w-sm">
            <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#1a7c78]">
                    {selectedEntity.entityType === 'worker'
                      ? t('auth.worker')
                      : selectedEntity.entityType === 'order'
                        ? t('my_work.job')
                        : 'SOS'}
                  </span>
                  <h4 className="text-sm font-black text-foreground">
                    {selectedEntity.fullName ||
                      selectedEntity.userName ||
                      (selectedEntity.serviceType ? t(`services.${selectedEntity.serviceType}`) : '—')}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedEntity.entityType === 'worker' && (
                <>
                  <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-[#c6a15b] text-[#c6a15b]" />
                      {Number(selectedEntity.rating || 0).toFixed(1)}
                    </span>
                    {selectedEntity.kycVerified && (
                      <span className="inline-flex items-center gap-1 text-[#1a7c78] font-bold">
                        <ShieldCheck className="h-3.5 w-3.5" /> KYC
                      </span>
                    )}
                    <span>{selectedEntity.district || '—'}</span>
                  </div>
                  {selectedEntity.phoneNumber && (
                    <a href={`tel:${selectedEntity.phoneNumber}`} className="inline-flex items-center gap-1 font-bold text-[#1a7c78] tabular-nums">
                      <Phone className="h-3.5 w-3.5" /> {selectedEntity.phoneNumber}
                    </a>
                  )}
                  <Link
                    to="/super-admin/workers"
                    className="block w-full rounded-xl bg-[#102833] py-2 text-center font-bold text-white"
                  >
                    {t('super_admin.nav_workers')}
                  </Link>
                </>
              )}

              {selectedEntity.entityType === 'order' && (
                <>
                  <p className="font-bold text-[#1a7c78] tabular-nums">
                    {formatSom(selectedEntity.agreedRate || selectedEntity.recommendedRate, i18n.language)} · {t(`yandex.status_${selectedEntity.status}`)}
                  </p>
                  <p className="text-muted-foreground">{selectedEntity.addressText || selectedEntity.district || '—'}</p>
                  <Link
                    to="/super-admin/orders"
                    className="block w-full rounded-xl bg-[#102833] py-2 text-center font-bold text-white"
                  >
                    {t('super_admin.nav_orders')}
                  </Link>
                </>
              )}

              {selectedEntity.entityType === 'sos' && (
                <>
                  <p className="font-semibold text-rose-600">{selectedEntity.message || selectedEntity.status}</p>
                  <Link
                    to="/super-admin/sos"
                    className="block w-full rounded-xl bg-rose-600 py-2 text-center font-bold text-white"
                  >
                    {t('super_admin.nav_sos')}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
