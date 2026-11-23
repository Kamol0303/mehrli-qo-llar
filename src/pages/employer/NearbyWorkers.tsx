import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { api, EmployerWorker } from '../../lib/api';
import { getCurrentPosition, isGeolocationAvailable } from '../../lib/geolocation';
import { useAuth } from '../../hooks/useAuth';
import { SKILLS } from '../../constants/categories';
import { REGIONS } from '../../constants/locations';
import SafeSelect from '../../components/SafeSelect';
import InteractiveLeafletMap, { MapMarkerItem } from '../../components/map/InteractiveLeafletMap';
import InviteWorkerModal from '../../components/map/InviteWorkerModal';
import {
  MapPin,
  Search,
  Phone,
  BadgeCheck,
  Loader2,
  User,
  Navigation,
  Layers,
  Map as MapIcon,
  List as ListIcon,
  Sparkles,
  Send,
  Star,
  CheckCircle,
} from 'lucide-react';

const RADIUS_OPTIONS = [5, 10, 30, 50, 100] as const;

export default function NearbyWorkers() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const [radiusKm, setRadiusKm] = useState<number>(30);
  const [skill, setSkill] = useState('');
  const [region, setRegion] = useState('');
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [workers, setWorkers] = useState<EmployerWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWorkerForInvite, setSelectedWorkerForInvite] = useState<EmployerWorker | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'split' | 'map' | 'list'>('split');

  const runNearby = useCallback(
    async (lat: number, lng: number, radiusArg = radiusKm) => {
      setLoading(true);
      setError('');
      try {
        const res = await api.employer.workersNearby({
          lat,
          lng,
          radius_km: radiusArg,
          skill: skill || undefined,
          region: region || undefined,
          page: 1,
          pageSize: 50,
        });
        setWorkers(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('nearby_workers.search_error', { defaultValue: 'Qidiruvda xatolik' }));
      } finally {
        setLoading(false);
      }
    },
    [radiusKm, skill, region, t],
  );

  const useMyLocation = useCallback(async () => {
    setError('');
    if (!isGeolocationAvailable()) {
      const fallback = { lat: 39.6542, lng: 66.9597 };
      setCoords(fallback);
      await runNearby(fallback.lat, fallback.lng, radiusKm);
      return;
    }
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      const current = { lat: pos.latitude, lng: pos.longitude };
      setCoords(current);
      await runNearby(pos.latitude, pos.longitude, radiusKm);
    } catch {
      const fallback = { lat: 39.6542, lng: 66.9597 };
      setCoords(fallback);
      await runNearby(fallback.lat, fallback.lng, radiusKm);
    } finally {
      setLoading(false);
    }
  }, [radiusKm, runNearby]);

  useEffect(() => {
    void useMyLocation();
  }, []);

  const changeRadius = (r: number) => {
    setRadiusKm(r);
    const target = coords || { lat: 39.6542, lng: 66.9597 };
    void runNearby(target.lat, target.lng, r);
  };

  // Filter local search if entered
  const filteredWorkers = workers.filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.fullName.toLowerCase().includes(q) ||
      (w.profession && w.profession.toLowerCase().includes(q)) ||
      (w.skills && w.skills.some((s) => s.toLowerCase().includes(q)))
    );
  });

  // Map markers
  const mapMarkers: MapMarkerItem[] = filteredWorkers
    .filter((w) => w.latitude != null && w.longitude != null)
    .map((w) => ({
      id: w.uid,
      type: 'worker',
      lat: Number(w.latitude),
      lng: Number(w.longitude),
      title: w.fullName,
      subtitle: w.profession || (w.skills && w.skills[0]) || 'Mutaxassis',
      rating: w.rating,
      distanceLabel: w.distanceLabel,
      matchScore: w.matchScore || 90,
      availability: w.availability || 'available',
      phone: w.phoneNumber,
      actionLabel: 'ISHCHINI TAKLIF QILISH',
      onAction: () => setSelectedWorkerForInvite(w),
    }));

  return (
    <DashboardLayout title={t('nearby_workers.title', { defaultValue: 'Yaqin atrofdagi ishchilar xaritasi' })}>
      <div className="flex flex-col gap-4">
        {/* Top Filter Bar */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void useMyLocation()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 text-xs font-bold text-white shadow-sm transition-all"
              >
                <Navigation className="h-4 w-4" />
                <span>Yaqin atrofdagilar</span>
              </button>

              <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
                <span className="text-[11px] font-bold text-muted-foreground px-2">Radius:</span>
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => changeRadius(r)}
                    className={`min-h-[34px] rounded-lg px-2.5 text-xs font-bold transition-all ${
                      radiusKm === r
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 self-start md:self-auto lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                  mobileView === 'split' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Split
              </button>
              <button
                type="button"
                onClick={() => setMobileView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                  mobileView === 'map' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" /> Xarita
              </button>
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                  mobileView === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" /> Ro‘yxat ({filteredWorkers.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-border/50">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ism yoki kasb bo‘yicha qidirish…"
                className="w-full min-h-[42px] rounded-xl border border-border bg-background pl-9 pr-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div>
              <SafeSelect
                value={skill}
                onChange={(e) => {
                  setSkill(e.target.value);
                  const target = coords || { lat: 39.6542, lng: 66.9597 };
                  void runNearby(target.lat, target.lng, radiusKm);
                }}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="">Barcha ko‘nikmalar</option>
                {SKILLS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(`skills.${s.id}`, { defaultValue: s.name })}
                  </option>
                ))}
              </SafeSelect>
            </div>

            <div>
              <SafeSelect
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  const target = coords || { lat: 39.6542, lng: 66.9597 };
                  void runNearby(target.lat, target.lng, radiusKm);
                }}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="">Barcha hududlar</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SafeSelect>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/30">
            {error}
          </div>
        )}

        {/* MAP + LIST SPLIT VIEW */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px]">
          {/* LEFT: WORKER CARDS LIST */}
          <div
            className={`lg:col-span-6 xl:col-span-5 flex flex-col gap-3 ${
              mobileView === 'map' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-muted-foreground">
                Mavjud ishchilar: <strong className="text-foreground">{filteredWorkers.length} nafar</strong>
              </span>
              <span className="text-xs font-bold text-sky-600 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Moslik bo‘yicha saralangan
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-border bg-card">
                <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                <p className="text-xs text-muted-foreground">Yaqin atrofdagi ishchilar qidirilmoqda…</p>
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-border bg-card text-center p-6">
                <User className="h-10 w-10 text-muted-foreground mb-2" />
                <h4 className="text-sm font-bold text-foreground">Hozircha yaqin atrofda ishchi topilmadi</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Radiusni kattalashtiring yoki boshqa tuman va kasblarni tanlab ko‘ring.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredWorkers.map((w) => {
                  const isSelected = selectedMarkerId === w.uid;
                  const match = w.matchScore || 90;
                  const isAvailable = w.availability !== 'busy';

                  return (
                    <div
                      key={w.uid}
                      onClick={() => setSelectedMarkerId(w.uid)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 bg-card flex flex-col gap-3 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 shadow-md'
                          : 'border-border hover:border-border/80 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative h-13 w-13 shrink-0 overflow-hidden rounded-2xl bg-primary/10 flex items-center justify-center">
                          {w.photoUrl ? (
                            <img src={w.photoUrl} alt={w.fullName} className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-primary" />
                          )}
                          <span
                            className={`absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white ${
                              isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            title={isAvailable ? 'Hozir mavjud' : 'Band'}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link
                                to={`/worker/${w.uid}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-sm text-foreground truncate hover:text-primary"
                              >
                                {w.fullName}
                              </Link>
                              {w.isVerified && <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" />}
                            </div>

                            <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                              {match}% mos
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-primary truncate">
                            {w.profession || w.skills?.[0] || 'Mutaxassis'}
                          </p>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {w.rating > 0 && (
                              <span className="flex items-center gap-0.5 font-bold text-amber-600">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                {w.rating}
                              </span>
                            )}
                            {w.distanceLabel && (
                              <span className="flex items-center gap-0.5 text-sky-700 dark:text-sky-400 font-semibold">
                                <MapPin className="h-3 w-3" />
                                {w.distanceLabel}
                              </span>
                            )}
                            <span className="text-[11px] text-muted-foreground truncate">
                              {[w.region, w.district].filter(Boolean).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Skills */}
                      {w.skills && w.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {w.skills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                            >
                              {t(`skills.${s}`, { defaultValue: s })}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkerForInvite(w);
                          }}
                          className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground shadow hover:opacity-95 transition-all"
                        >
                          <Send className="h-3.5 w-3.5" />
                          ISHCHINI TAKLIF QILISH
                        </button>
                        {w.phoneNumber && (
                          <a
                            href={`tel:${w.phoneNumber}`}
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-primary hover:text-white transition-all"
                            title="Qo‘ng‘iroq qilish"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: INTERACTIVE LIVE MAP */}
          <div
            className={`lg:col-span-6 xl:col-span-7 h-[420px] lg:h-[720px] sticky top-4 ${
              mobileView === 'list' ? 'hidden lg:block' : 'block'
            }`}
          >
            <InteractiveLeafletMap
              markers={mapMarkers}
              center={coords ? [coords.lat, coords.lng] : [39.6542, 66.9597]}
              zoom={13}
              selectedId={selectedMarkerId}
              onMarkerSelect={(m) => setSelectedMarkerId(m.id)}
              userLocation={coords ? [coords.lat, coords.lng] : null}
              onLocateMe={() => void useMyLocation()}
              className="h-full w-full shadow-sm"
            />
          </div>
        </div>
      </div>

      <InviteWorkerModal
        worker={selectedWorkerForInvite}
        isOpen={!!selectedWorkerForInvite}
        onClose={() => setSelectedWorkerForInvite(null)}
        onSuccess={() => {
          // Success feedback
        }}
      />
    </DashboardLayout>
  );
}
