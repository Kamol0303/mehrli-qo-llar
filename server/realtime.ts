import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db';

export type RealtimeEventName =
  | 'connected'
  | 'ping'
  | 'offer_received'
  | 'offer_expired'
  | 'order_updated'
  | 'contract_updated'
  | 'worker_location'
  | 'sos_alert'
  | 'chat_message'
  | 'notification'
  | 'verification_updated';

interface SseClient {
  id: string;
  userId: string;
  role: string;
  res: Response;
}

class RealtimeHub {
  private clientsByUser = new Map<string, Set<SseClient>>();
  private staffClients = new Set<SseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.heartbeatTimer = setInterval(() => {
      for (const set of this.clientsByUser.values()) {
        for (const client of set) {
          this.writeFrame(client.res, 'ping', { ts: Date.now() });
        }
      }
    }, 20_000);
    // Avoid blocking process exit during tests
    this.heartbeatTimer.unref?.();
  }

  addClient(userId: string, role: string, res: Response): () => void {
    const client: SseClient = { id: randomUUID(), userId, role, res };
    let set = this.clientsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.clientsByUser.set(userId, set);
    }
    set.add(client);
    if (role === 'super_admin' || role === 'admin') {
      this.staffClients.add(client);
    }

    this.writeFrame(res, 'connected', { userId, ts: new Date().toISOString() });

    return () => {
      const userSet = this.clientsByUser.get(userId);
      if (userSet) {
        userSet.delete(client);
        if (userSet.size === 0) this.clientsByUser.delete(userId);
      }
      this.staffClients.delete(client);
    };
  }

  emitToUser(userId: string, event: RealtimeEventName, data: unknown): void {
    const set = this.clientsByUser.get(userId);
    if (!set || set.size === 0) return;
    for (const client of set) {
      this.writeFrame(client.res, event, data);
    }
  }

  emitToUsers(userIds: string[], event: RealtimeEventName, data: unknown): void {
    const seen = new Set<string>();
    for (const uid of userIds) {
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      this.emitToUser(uid, event, data);
    }
  }

  emitToSuperAdmins(event: RealtimeEventName, data: unknown): void {
    for (const client of this.staffClients) {
      this.writeFrame(client.res, event, data);
    }
  }

  private writeFrame(res: Response, event: RealtimeEventName, data: unknown): void {
    try {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* client disconnected */
    }
  }
}

export const realtimeHub = new RealtimeHub();

export interface PushDispatchPayload {
  userId: string;
  title: string;
  message: string;
  eventType: 'new_offer' | 'accepted' | 'arrived' | 'completed' | 'sos_alert' | 'order_update' | 'expired';
  link?: string | null;
  orderId?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Persists a notification, broadcasts via SSE, and records/dispatches
 * to registered FCM/APNs/Web push tokens for the user.
 */
export function dispatchPushEvent(db: AppDatabase, payload: PushDispatchPayload): void {
  const now = new Date().toISOString();
  const notif = {
    id: `ntf_${randomUUID().slice(0, 8)}`,
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.eventType,
    read: false,
    link: payload.link ?? '/',
    createdAt: now,
  };
  db.upsertNotification(notif);

  realtimeHub.emitToUser(payload.userId, 'notification', {
    ...notif,
    orderId: payload.orderId ?? null,
    ...(payload.data || {}),
  });

  // Look up registered device push tokens; real FCM server key dispatch can plug in here when FCM_SERVER_KEY is set
  const tokens = db.listPushTokensForUser(payload.userId);
  if (tokens.length > 0 && process.env.FCM_SERVER_KEY) {
    // Non-blocking remote push delivery
    for (const tok of tokens) {
      if (tok.platform === 'web') continue;
      void fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${process.env.FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: tok.token,
          notification: {
            title: payload.title,
            body: payload.message,
          },
          data: {
            eventType: payload.eventType,
            orderId: payload.orderId || '',
            link: payload.link || '/',
          },
        }),
      }).catch(() => {
        /* push endpoint failure is non-fatal */
      });
    }
  }
}
