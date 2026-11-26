import { useEffect, useRef, useState } from 'react';
import { API_BASE, getAccessToken } from '../lib/api/client';

export type RealtimeEventType =
  | 'connected'
  | 'offer_received'
  | 'order_updated'
  | 'worker_location'
  | 'contract_updated'
  | 'verification_updated'
  | 'sos_alert'
  | 'chat_message';

export type RealtimeHandler = (eventType: RealtimeEventType, payload: Record<string, unknown>) => void;

export function useRealtimeEvents(enabled: boolean, onEvent: RealtimeHandler) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      setConnected(false);
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const token = getAccessToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      const url = `${API_BASE}/realtime/stream${query}`;

      try {
        es = new EventSource(url, { withCredentials: true });
      } catch {
        setConnected(false);
        return;
      }

      const eventTypes: RealtimeEventType[] = [
        'connected',
        'offer_received',
        'order_updated',
        'worker_location',
        'contract_updated',
        'verification_updated',
        'sos_alert',
        'chat_message',
      ];

      for (const evt of eventTypes) {
        es.addEventListener(evt, (e: MessageEvent) => {
          if (evt === 'connected') {
            setConnected(true);
          }
          try {
            const data = e.data ? (JSON.parse(String(e.data)) as Record<string, unknown>) : {};
            handlerRef.current(evt, data);
          } catch {
            handlerRef.current(evt, {});
          }
        });
      }

      es.onopen = () => {
        setConnected(true);
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (!closed && reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      setConnected(false);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      es?.close();
    };
  }, [enabled]);

  return { connected };
}
