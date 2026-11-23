import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Navigation, ZoomIn, ZoomOut, Compass } from 'lucide-react';

export interface MapMarkerItem {
  id: string;
  type: 'worker' | 'job' | 'employer' | 'dispute' | 'user';
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  rating?: number;
  distanceLabel?: string;
  priceLabel?: string;
  matchScore?: number;
  availability?: string;
  status?: string;
  photoUrl?: string | null;
  phone?: string | null;
  onAction?: () => void;
  actionLabel?: string;
}

interface InteractiveLeafletMapProps {
  markers: MapMarkerItem[];
  center?: [number, number];
  zoom?: number;
  selectedId?: string | null;
  onMarkerSelect?: (marker: MapMarkerItem) => void;
  userLocation?: [number, number] | null;
  onLocateMe?: () => void;
  className?: string;
}

const DISTRICT_CENTERS: Record<string, [number, number]> = {
  'Samarqand shahar': [39.6542, 66.9597],
  Urgut: [39.4022, 67.2431],
  Jomboy: [39.7003, 67.0933],
  'Kattaqo‘rg‘on': [39.8989, 66.2561],
  'Pastdarg‘om': [39.7133, 66.7439],
  'Bulung‘ur': [39.7647, 67.2714],
  Payariq: [39.9881, 66.8489],
  Ishtixon: [39.9658, 66.4883],
  Narpay: [39.8972, 65.9875],
  Toyloq: [39.5878, 67.0856],
  'Qo‘shrabot': [40.3547, 66.6433],
};

function createCustomIcon(m: MapMarkerItem, isSelected: boolean): L.DivIcon {
  if (m.type === 'user') {
    return L.divIcon({
      className: 'custom-leaflet-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-sky-500/30 animate-ping absolute"></div>
          <div class="w-5 h-5 rounded-full bg-sky-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold">
            •
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  const baseColor =
    m.type === 'worker'
      ? m.availability === 'busy'
        ? 'bg-amber-600'
        : 'bg-emerald-600'
      : m.type === 'job'
        ? 'bg-blue-600'
        : m.type === 'dispute'
          ? 'bg-rose-600'
          : 'bg-indigo-600';

  const badgeText =
    m.matchScore != null
      ? `${m.matchScore}%`
      : m.priceLabel
        ? m.priceLabel
        : m.rating
          ? `★${m.rating}`
          : m.type === 'worker'
            ? 'Ishchi'
            : 'Ish';

  const scale = isSelected ? 'scale-110 ring-4 ring-primary' : 'hover:scale-105';

  return L.divIcon({
    className: 'custom-leaflet-pin',
    html: `
      <div class="cursor-pointer transition-transform duration-200 ${scale} flex flex-col items-center">
        <div class="px-2 py-0.5 rounded-full text-[11px] font-black text-white ${baseColor} shadow-md border border-white flex items-center gap-1 whitespace-nowrap">
          <span>${badgeText}</span>
        </div>
        <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white -mt-0.5"></div>
      </div>
    `,
    iconSize: [60, 30],
    iconAnchor: [30, 28],
  });
}

export default function InteractiveLeafletMap({
  markers,
  center = [39.6542, 66.9597],
  zoom = 12,
  selectedId,
  onMarkerSelect,
  userLocation,
  onLocateMe,
  className = 'h-full w-full',
}: InteractiveLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerObjectsRef = useRef<Map<string, L.Marker>>(new Map());

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markerObjectsRef.current.clear();

    // Add user location marker if provided
    if (userLocation) {
      const userMarkerItem: MapMarkerItem = {
        id: '__user_pos__',
        type: 'user',
        lat: userLocation[0],
        lng: userLocation[1],
        title: 'Sizning joylashuvingiz',
      };
      const userPin = L.marker([userLocation[0], userLocation[1]], {
        icon: createCustomIcon(userMarkerItem, false),
      });
      userPin.bindPopup('<div class="p-2 font-bold text-xs text-slate-800">Siz shu yerdasiz</div>');
      layer.addLayer(userPin);
    }

    markers.forEach((m) => {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) return;
      const isSelected = selectedId === m.id;
      const marker = L.marker([m.lat, m.lng], {
        icon: createCustomIcon(m, isSelected),
      });

      const popupContent = document.createElement('div');
      popupContent.className = 'p-3 min-w-[220px] max-w-[260px] text-slate-900 font-sans';
      popupContent.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <h4 class="font-bold text-sm leading-tight text-slate-900 line-clamp-1">${m.title}</h4>
          ${
            m.matchScore != null
              ? `<span class="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">${m.matchScore}% mos</span>`
              : ''
          }
        </div>
        ${m.subtitle ? `<p class="text-xs text-slate-600 line-clamp-1 mb-1">${m.subtitle}</p>` : ''}
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mb-2.5">
          ${m.distanceLabel ? `<span>📍 ${m.distanceLabel}</span>` : ''}
          ${m.priceLabel ? `<span class="font-bold text-emerald-600">${m.priceLabel}</span>` : ''}
          ${m.rating ? `<span class="font-semibold text-amber-600">★ ${m.rating}</span>` : ''}
        </div>
        ${
          m.actionLabel
            ? `<button id="btn-action-${m.id}" class="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors">
                ${m.actionLabel}
              </button>`
            : ''
        }
      `;

      if (m.actionLabel && m.onAction) {
        setTimeout(() => {
          const btn = popupContent.querySelector(`#btn-action-${m.id}`);
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              m.onAction?.();
            });
          }
        }, 0);
      }

      marker.bindPopup(popupContent, { offset: [0, -20], closeButton: false });

      marker.on('click', () => {
        onMarkerSelect?.(m);
      });

      layer.addLayer(marker);
      markerObjectsRef.current.set(m.id, marker);
    });
  }, [markers, selectedId, userLocation, onMarkerSelect]);

  // Focus selected marker smoothly
  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const target = markerObjectsRef.current.get(selectedId);
    if (target) {
      const latlng = target.getLatLng();
      mapRef.current.flyTo(latlng, Math.max(14, mapRef.current.getZoom()), {
        duration: 0.8,
      });
      target.openPopup();
    }
  }, [selectedId]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleDistrictChange = (coords: [number, number]) => {
    mapRef.current?.flyTo(coords, 13, { duration: 0.8 });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-slate-100 dark:bg-slate-900 ${className}`}>
      <div ref={containerRef} className="h-full w-full z-0" />

      {/* Floating map controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        {onLocateMe && (
          <button
            type="button"
            onClick={onLocateMe}
            title="Mening joylashuvim"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-slate-800 shadow-md backdrop-blur-sm hover:bg-white hover:text-primary transition-all dark:bg-slate-800 dark:text-slate-100"
          >
            <Navigation className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Kattalashtirish"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-slate-800 shadow-md backdrop-blur-sm hover:bg-white transition-all dark:bg-slate-800 dark:text-slate-100"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Kichiklashtirish"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-slate-800 shadow-md backdrop-blur-sm hover:bg-white transition-all dark:bg-slate-800 dark:text-slate-100"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>

      {/* Quick district selector pills */}
      <div className="absolute bottom-3 left-3 right-3 z-[400] pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto p-1.5 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md rounded-2xl border border-border shadow-lg custom-scrollbar">
          <span className="text-[11px] font-bold text-muted-foreground px-2 shrink-0 flex items-center gap-1">
            <Compass className="h-3 w-3" /> Tuman:
          </span>
          {Object.entries(DISTRICT_CENTERS).map(([name, coords]) => (
            <button
              key={name}
              type="button"
              onClick={() => handleDistrictChange(coords)}
              className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground transition-all whitespace-nowrap"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
