import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { api } from '../../lib/api';
import { Job } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { getCurrentPosition, isGeolocationAvailable } from '../../lib/geolocation';
import { getDistrictKey } from '../../lib/utils';
import { SERVICE_DIRECTIONS, isServiceDirection } from '../../constants/categories';
import { REGIONS } from '../../constants/locations';
import ApplyModal from '../../components/ApplyModal';
import SafeSelect from '../../components/SafeSelect';
import InteractiveLeafletMap, { MapMarkerItem } from '../../components/map/InteractiveLeafletMap';
import {
  MapPin,
  Search,
  Banknote,
  Loader2,
  Navigation,
  Briefcase,
  Layers,
  Map as MapIcon,
  List as ListIcon,
  Sparkles,
  Star,
  Clock,
} from 'lucide-react';

const RADIUS_OPTIONS = [5, 10, 30, 50, 100] as const;

export default function NearbyJobs() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [radiusKm, setRadiusKm] = useState<number>(30);
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'split' | 'map' | 'list'>('split');

  const runNearby = useCallback(
    async (lat: number, lng: number, radiusArg = radiusKm) => {
      setLoading(true);
      setError('');
      try {
        const res = await api.jobs.nearby({
          lat,
          lng,
          radius_km: radiusArg,
          category: category || undefined,
          region: region || undefined,
          page: 1,
          pageSize: 50,
        });
        setJobs(res.data);
        setSearched(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('nearby_jobs.search_error', { defaultValue: 'Qidiruvda xatolik' }));
      } finally {
        setLoading(false);
      }
    },
    [radiusKm, category, region, t],
  );

  const useMyLocation = useCallback(async () => {
    setError('');
    if (!isGeolocationAvailable()) {
      // Default to Samarkand center
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
      // Graceful fallback to Samarkand center if GPS denied
      const fallback = { lat: 39.6542, lng: 66.9597 };
      setCoords(fallback);
      await runNearby(fallback.lat, fallback.lng, radiusKm);
    } finally {
      setLoading(false);
    }
  }, [radiusKm, runNearby]);

  // Initial load
  useEffect(() => {
    void useMyLocation();
  }, []);

  const changeRadius = (r: number) => {
    setRadiusKm(r);
    const target = coords || { lat: 39.6542, lng: 66.9597 };
    void runNearby(target.lat, target.lng, r);
  };

  const onApply = (job: Job) => {
    if (!profile) {
      navigate('/auth?mode=login');
      return;
    }
    if (profile.role !== 'worker') return;
    setSelectedJob(job);
  };

  // Convert jobs to map markers
  const mapMarkers: MapMarkerItem[] = jobs
    .filter((j) => (j as any).latitude != null && (j as any).longitude != null)
    .map((j) => {
      const lat = Number((j as any).latitude);
      const lng = Number((j as any).longitude);
      const priceVal = j.price || j.salary || 0;
      return {
        id: j.id,
        type: 'job',
        lat,
        lng,
        title: j.title,
        subtitle: j.employerName || 'Ish beruvchi',
        priceLabel: priceVal > 0 ? `${(priceVal / 1000).toFixed(0)}k so‘m` : undefined,
        distanceLabel: j.distanceLabel,
        matchScore: j.matchScore || 88,
        actionLabel: "ISHNI KO'RISH",
        onAction: () => onApply(j),
      };
    });

  return (
    <DashboardLayout title={t('nearby_jobs.title', { defaultValue: 'Yaqin atrofdagi ishlar xaritasi' })}>
      <div className="flex flex-col gap-4">
        {/* Top Filter & Geolocation Bar */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void useMyLocation()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 text-xs font-bold text-white shadow-sm transition-all"
              >
                <Navigation className="h-4 w-4" />
                <span>Yaqinimdagi ishlar</span>
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
                <ListIcon className="h-3.5 w-3.5" /> Ro‘yxat ({jobs.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/50">
            <div className="relative">
              <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <SafeSelect
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const target = coords || { lat: 39.6542, lng: 66.9597 };
                  void runNearby(target.lat, target.lng, radiusKm);
                }}
                className="w-full min-h-[42px] rounded-xl border border-border bg-background pl-9 pr-3 text-xs font-semibold text-foreground"
              >
                <option value="">Barcha toifalar va kasblar</option>
                {SERVICE_DIRECTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(`jobs.directions.${item.id}`, { defaultValue: item.name })}
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
          {/* LEFT: JOB CARDS LIST */}
          <div
            className={`lg:col-span-6 xl:col-span-5 flex flex-col gap-3 ${
              mobileView === 'map' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-muted-foreground">
                Topilgan e‘lonlar: <strong className="text-foreground">{jobs.length} ta</strong>
              </span>
              <span className="text-xs font-bold text-sky-600 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Eng mos natijalar
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-border bg-card">
                <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                <p className="text-xs text-muted-foreground">Yaqin atrofdagi ishlar yuklanmoqda…</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-border bg-card text-center p-6">
                <MapPin className="h-10 w-10 text-muted-foreground mb-2" />
                <h4 className="text-sm font-bold text-foreground">Hozircha yaqin atrofda e‘lon topilmadi</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Radiusni kattalashtiring yoki boshqa tuman va toifalarni tanlab ko‘ring.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1 custom-scrollbar">
                {jobs.map((job) => {
                  const isSelected = selectedMarkerId === job.id;
                  const price = job.price || job.salary || 0;
                  const match = job.matchScore || 88;

                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedMarkerId(job.id)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 bg-card flex flex-col gap-2.5 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 shadow-md'
                          : 'border-border hover:border-border/80 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                            {isServiceDirection(job.category)
                              ? t(`jobs.directions.${job.category}`)
                              : job.category || 'Kasb'}
                          </span>
                          <h3 className="font-bold text-base text-foreground leading-snug line-clamp-1">
                            {job.title}
                          </h3>
                        </div>

                        <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                          {match}% mos
                        </span>
                      </div>

                      {job.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {job.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
                        {job.distanceLabel && (
                          <span className="flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400">
                            <MapPin className="h-3.5 w-3.5" /> {job.distanceLabel}
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-black text-emerald-600 dark:text-emerald-400">
                          <Banknote className="h-4 w-4" />
                          {price.toLocaleString()} so‘m
                        </span>
                        {job.workType && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {job.workType === 'one_time' ? 'Bir martalik' : job.workType}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onApply(job);
                          }}
                          className="flex-1 min-h-[42px] inline-flex items-center justify-center rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground shadow hover:opacity-95 transition-all"
                        >
                          ISHNI KO‘RISH
                        </button>
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

      {selectedJob && profile && (
        <ApplyModal
          job={selectedJob}
          profile={profile}
          isOpen={!!selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </DashboardLayout>
  );
}
