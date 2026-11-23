import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import InteractiveLeafletMap, { MapMarkerItem } from './InteractiveLeafletMap';
import {
  Users,
  Briefcase,
  AlertTriangle,
  Building2,
  ShieldCheck,
  Star,
  Phone,
  ExternalLink,
  Loader2,
  X,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface LiveMapData {
  workers: Array<{
    uid: string;
    fullName: string;
    role: 'worker';
    profession: string;
    skills: string[];
    photoUrl: string | null;
    phoneNumber: string | null;
    availability: string;
    rating: number;
    completedJobs: number;
    isVerified: boolean;
    district: string | null;
    region: string;
    latitude: number;
    longitude: number;
  }>;
  employers: Array<{
    uid: string;
    fullName: string;
    companyName: string | null;
    role: 'employer';
    photoUrl: string | null;
    phoneNumber: string | null;
    rating: number;
    isVerified: boolean;
    district: string | null;
    region: string;
    latitude: number;
    longitude: number;
  }>;
  activeJobs: Array<{
    id: string;
    title: string;
    employerId: string;
    employerName: string | null;
    category: string | null;
    price: number | null;
    workType: string | null;
    district: string | null;
    region: string | null;
    status: string;
    latitude: number;
    longitude: number;
  }>;
  disputes: Array<{
    id: string;
    contractId: string;
    openedById: string;
    openedByName?: string;
    reason: string;
    status: string;
    latitude: number;
    longitude: number;
  }>;
}

export default function SuperAdminLiveMap({
  height = '620px',
  showHeader = true,
}: {
  height?: string;
  showHeader?: boolean;
}) {
  const [data, setData] = useState<LiveMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'worker' | 'employer' | 'job' | 'dispute'>('all');
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.admin
      .liveMapData()
      .then((res) => {
        if (mounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <p className="text-xs font-semibold text-muted-foreground">Superadmin jonli xaritasi yuklanmoqda…</p>
      </div>
    );
  }

  const workers = data?.workers || [];
  const employers = data?.employers || [];
  const activeJobs = data?.activeJobs || [];
  const disputes = data?.disputes || [];

  const markers: MapMarkerItem[] = [];

  if (filterType === 'all' || filterType === 'worker') {
    workers.forEach((w) => {
      markers.push({
        id: `worker_${w.uid}`,
        type: 'worker',
        lat: w.latitude,
        lng: w.longitude,
        title: w.fullName,
        subtitle: `${w.profession} · ${w.district || w.region}`,
        rating: w.rating,
        availability: w.availability,
        actionLabel: 'KARTANI KO‘RISH',
        onAction: () => setSelectedEntity({ ...w, entityType: 'worker' }),
      });
    });
  }

  if (filterType === 'all' || filterType === 'employer') {
    employers.forEach((e) => {
      markers.push({
        id: `employer_${e.uid}`,
        type: 'employer',
        lat: e.latitude,
        lng: e.longitude,
        title: e.companyName || e.fullName,
        subtitle: `Ish beruvchi · ${e.district || e.region}`,
        rating: e.rating,
        actionLabel: 'KARTANI KO‘RISH',
        onAction: () => setSelectedEntity({ ...e, entityType: 'employer' }),
      });
    });
  }

  if (filterType === 'all' || filterType === 'job') {
    activeJobs.forEach((j) => {
      markers.push({
        id: `job_${j.id}`,
        type: 'job',
        lat: j.latitude,
        lng: j.longitude,
        title: j.title,
        subtitle: `${j.employerName || 'Ish beruvchi'} · ${(j.price || 0).toLocaleString()} so‘m`,
        actionLabel: 'ISHNI KO‘RISH',
        onAction: () => setSelectedEntity({ ...j, entityType: 'job' }),
      });
    });
  }

  if (filterType === 'all' || filterType === 'dispute') {
    disputes.forEach((d) => {
      markers.push({
        id: `dispute_${d.id}`,
        type: 'dispute',
        lat: d.latitude,
        lng: d.longitude,
        title: `Nizo: ${d.reason.slice(0, 40)}`,
        subtitle: `Ochgan: ${d.openedByName || 'Foydalanuvchi'}`,
        actionLabel: 'NIZONI KO‘RISH',
        onAction: () => setSelectedEntity({ ...d, entityType: 'dispute' }),
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-black text-foreground tracking-tight">Superadmin Jonli Xaritasi</h3>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-foreground'
              }`}
            >
              Barchasi ({markers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('worker')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === 'worker' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-secondary text-foreground'
              }`}
            >
              👷 Ishchilar ({workers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('employer')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === 'employer' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-secondary text-foreground'
              }`}
            >
              🏢 Ish beruvchilar ({employers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('job')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === 'job' ? 'bg-blue-600 text-white shadow-sm' : 'bg-secondary text-foreground'
              }`}
            >
              ⚡ Faol ishlar ({activeJobs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('dispute')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === 'dispute' ? 'bg-rose-600 text-white shadow-sm' : 'bg-secondary text-foreground'
              }`}
            >
              ⚠️ Nizolar ({disputes.length})
            </button>
          </div>
        </div>
      )}

      {/* Map Canvas */}
      <div style={{ height }} className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
        <InteractiveLeafletMap
          markers={markers}
          center={[39.6542, 66.9597]}
          zoom={12}
          selectedId={selectedMarkerId}
          onMarkerSelect={(m) => {
            setSelectedMarkerId(m.id);
            const foundWorker = workers.find((w) => `worker_${w.uid}` === m.id);
            if (foundWorker) {
              setSelectedEntity({ ...foundWorker, entityType: 'worker' });
              return;
            }
            const foundEmp = employers.find((e) => `employer_${e.uid}` === m.id);
            if (foundEmp) {
              setSelectedEntity({ ...foundEmp, entityType: 'employer' });
              return;
            }
            const foundJob = activeJobs.find((j) => `job_${j.id}` === m.id);
            if (foundJob) {
              setSelectedEntity({ ...foundJob, entityType: 'job' });
              return;
            }
            const foundDisp = disputes.find((d) => `dispute_${d.id}` === m.id);
            if (foundDisp) {
              setSelectedEntity({ ...foundDisp, entityType: 'dispute' });
            }
          }}
          className="h-full w-full"
        />

        {/* Compact Entity Quick Card (Requirement #7: ism, role, status, location, telefon, rating, current job, verification) */}
        {selectedEntity && (
          <div className="absolute top-4 left-4 z-[500] max-w-sm w-full animate-slideIn">
            <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                    {selectedEntity.entityType === 'worker'
                      ? 'Ishchi'
                      : selectedEntity.entityType === 'employer'
                        ? 'Ish beruvchi'
                        : selectedEntity.entityType === 'job'
                          ? 'Faol Ish'
                          : 'Nizo / Shikoyat'}
                  </span>
                  <h4 className="text-base font-black text-foreground leading-tight">
                    {selectedEntity.fullName || selectedEntity.title || 'Nizo'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedEntity.entityType === 'worker' && (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-primary">{selectedEntity.profession}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                    <span>📍 {selectedEntity.district || selectedEntity.region}</span>
                    <span>★ {selectedEntity.rating} reyting</span>
                    <span>✓ {selectedEntity.completedJobs} ta ish</span>
                    <span
                      className={`font-bold ${selectedEntity.availability === 'busy' ? 'text-amber-600' : 'text-emerald-600'}`}
                    >
                      {selectedEntity.availability === 'busy' ? 'Band' : 'Mavjud'}
                    </span>
                  </div>
                  {selectedEntity.phoneNumber && (
                    <a
                      href={`tel:${selectedEntity.phoneNumber}`}
                      className="inline-flex items-center gap-1.5 font-bold text-sky-600"
                    >
                      <Phone className="h-3.5 w-3.5" /> {selectedEntity.phoneNumber}
                    </a>
                  )}
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <Link
                      to={`/worker/${selectedEntity.uid}`}
                      className="flex-1 py-2 text-center rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                    >
                      Profilni ochish
                    </Link>
                  </div>
                </div>
              )}

              {selectedEntity.entityType === 'employer' && (
                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground">📍 {selectedEntity.district || selectedEntity.region}</p>
                  {selectedEntity.phoneNumber && (
                    <a
                      href={`tel:${selectedEntity.phoneNumber}`}
                      className="inline-flex items-center gap-1.5 font-bold text-sky-600"
                    >
                      <Phone className="h-3.5 w-3.5" /> {selectedEntity.phoneNumber}
                    </a>
                  )}
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <Link
                      to={`/super-admin/users`}
                      className="flex-1 py-2 text-center rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                    >
                      Foydalanuvchini boshqarish
                    </Link>
                  </div>
                </div>
              )}

              {selectedEntity.entityType === 'job' && (
                <div className="space-y-2 text-xs">
                  <p className="font-bold text-emerald-600">
                    {(selectedEntity.price || 0).toLocaleString()} so‘m
                  </p>
                  <p className="text-muted-foreground">
                    Toifa: {selectedEntity.category || 'Boshqa'} · {selectedEntity.district || selectedEntity.region}
                  </p>
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <Link
                      to={`/super-admin/jobs`}
                      className="flex-1 py-2 text-center rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                    >
                      E‘lonni ko‘rish
                    </Link>
                  </div>
                </div>
              )}

              {selectedEntity.entityType === 'dispute' && (
                <div className="space-y-2 text-xs">
                  <p className="text-rose-600 font-semibold">{selectedEntity.reason}</p>
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <Link
                      to={`/super-admin/disputes`}
                      className="flex-1 py-2 text-center rounded-xl bg-rose-600 text-white font-bold text-xs"
                    >
                      Nizoni hal qilish
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
