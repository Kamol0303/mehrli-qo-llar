import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { NearbyAnonWorker, OrderLifecycleStatus } from '../../types';
import { SAMARKAND_DEFAULT_COORDS } from '../../constants/yandexServices';

interface YandexGoMapProps {
  center: [number, number];
  zoom?: number;
  selectedPin?: [number, number] | null;
  interactivePin?: boolean;
  onPinChange?: (coords: [number, number]) => void;
  nearbyWorkers?: NearbyAnonWorker[];
  workerLocation?: [number, number] | null;
  orderStatus?: OrderLifecycleStatus | null;
  userLocation?: [number, number] | null;
  className?: string;
}

export default function YandexGoMap({
  center = SAMARKAND_DEFAULT_COORDS,
  zoom = 13,
  selectedPin,
  interactivePin = false,
  onPinChange,
  nearbyWorkers = [],
  workerLocation = null,
  orderStatus = null,
  userLocation = null,
  className = 'w-full h-full',
}: YandexGoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    nearby: L.LayerGroup;
    route: L.LayerGroup;
    pins: L.LayerGroup;
  } | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;
  const interactiveRef = useRef(interactivePin);
  interactiveRef.current = interactivePin;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    const nearby = L.layerGroup().addTo(map);
    const route = L.layerGroup().addTo(map);
    const pins = L.layerGroup().addTo(map);
    layersRef.current = { nearby, route, pins };

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (interactiveRef.current && onPinChangeRef.current) {
        onPinChangeRef.current([e.latlng.lat, e.latlng.lng]);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Re-center smoothly when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, map.getZoom(), { animate: true });
  }, [center[0], center[1]]);

  // Pre-acceptance obfuscated worker privacy circles (~250m)
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.nearby.clearLayers();

    for (const w of nearbyWorkers) {
      if (!Number.isFinite(w.lat) || !Number.isFinite(w.lng)) continue;
      const circle = L.circle([w.lat, w.lng], {
        radius: w.approxRadiusMeters || 250,
        color: '#1a7c78',
        weight: 1.5,
        dashArray: '5 5',
        fillColor: '#1a7c78',
        fillOpacity: 0.12,
      });
      circle.addTo(layers.nearby);

      const dotIcon = L.divIcon({
        className: 'mq-worker-anon-pin',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#102833;color:#fff;border:2px solid #c6a15b;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(16,40,51,0.28);">★${w.rating.toFixed(1)}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([w.lat, w.lng], { icon: dotIcon });
      marker.addTo(layers.nearby);
    }
  }, [nearbyWorkers]);

  // Pins & active route line
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.pins.clearLayers();
    layers.route.clearLayers();

    if (userLocation && (!selectedPin || Math.hypot(userLocation[0] - selectedPin[0], userLocation[1] - selectedPin[1]) > 0.0005)) {
      const gpsIcon = L.divIcon({
        className: 'mq-user-gps',
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:#1a7c78;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker(userLocation, { icon: gpsIcon }).addTo(layers.pins);
    }

    if (selectedPin) {
      const pinIcon = L.divIcon({
        className: 'mq-target-pin',
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:34px;height:34px;border-radius:9999px;background:#102833;border:3px solid #c6a15b;box-shadow:0 6px 16px rgba(16,40,51,0.35);display:flex;align-items:center;justify-content:center;">
            <div style="width:10px;height:10px;border-radius:9999px;background:#ffffff;"></div>
          </div>
          <div style="width:3px;height:10px;background:#102833;margin-top:-2px;border-radius:2px;"></div>
        </div>`,
        iconSize: [34, 44],
        iconAnchor: [17, 42],
      });
      L.marker(selectedPin, {
        icon: pinIcon,
        draggable: interactivePin,
      })
        .on('dragend', (ev) => {
          const pos = (ev.target as L.Marker).getLatLng();
          onPinChangeRef.current?.([pos.lat, pos.lng]);
        })
        .addTo(layers.pins);
    }

    const isPostAccept =
      orderStatus === 'qabul_qilindi' ||
      orderStatus === 'yolda' ||
      orderStatus === 'yetib_keldi' ||
      orderStatus === 'jarayonda';

    if (isPostAccept && workerLocation) {
      const workerPin = L.divIcon({
        className: 'mq-live-worker-pin',
        html: `<div style="width:36px;height:36px;border-radius:9999px;background:#1a7c78;border:3px solid #ffffff;box-shadow:0 6px 18px rgba(26,124,120,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:800;font-size:13px;">M</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker(workerLocation, { icon: workerPin }).addTo(layers.pins);

      if (selectedPin) {
        L.polyline([workerLocation, selectedPin], {
          color: '#1a7c78',
          weight: 4,
          opacity: 0.85,
          dashArray: orderStatus === 'yolda' ? undefined : '6 6',
        }).addTo(layers.route);
      }
    }
  }, [selectedPin, interactivePin, workerLocation, orderStatus, userLocation]);

  return (
    <div
      data-testid="yandex-go-map"
      className={`relative bg-slate-100 dark:bg-slate-900 ${className}`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />
    </div>
  );
}
