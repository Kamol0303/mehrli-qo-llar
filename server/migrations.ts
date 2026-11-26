import type { DatabaseSync } from 'node:sqlite';

export interface MigrationDef {
  version: number;
  name: string;
  up: (sqlite: DatabaseSync) => void;
  down: (sqlite: DatabaseSync) => void;
}

const DEFAULT_RATES: Array<{ serviceType: string; durationType: string; rateSom: number }> = [
  // hourly / half_day / full_day across 6 Yandex-mapped services
  { serviceType: 'childcare', durationType: 'hourly', rateSom: 45000 },
  { serviceType: 'childcare', durationType: 'half_day', rateSom: 160000 },
  { serviceType: 'childcare', durationType: 'full_day', rateSom: 280000 },

  { serviceType: 'house_cleaning', durationType: 'hourly', rateSom: 50000 },
  { serviceType: 'house_cleaning', durationType: 'half_day', rateSom: 180000 },
  { serviceType: 'house_cleaning', durationType: 'full_day', rateSom: 320000 },

  { serviceType: 'hotel_cleaning', durationType: 'hourly', rateSom: 55000 },
  { serviceType: 'hotel_cleaning', durationType: 'half_day', rateSom: 200000 },
  { serviceType: 'hotel_cleaning', durationType: 'full_day', rateSom: 350000 },

  { serviceType: 'postpartum_care', durationType: 'hourly', rateSom: 60000 },
  { serviceType: 'postpartum_care', durationType: 'half_day', rateSom: 220000 },
  { serviceType: 'postpartum_care', durationType: 'full_day', rateSom: 380000 },

  { serviceType: 'elder_care', durationType: 'hourly', rateSom: 50000 },
  { serviceType: 'elder_care', durationType: 'half_day', rateSom: 180000 },
  { serviceType: 'elder_care', durationType: 'full_day', rateSom: 310000 },

  { serviceType: 'other', durationType: 'hourly', rateSom: 45000 },
  { serviceType: 'other', durationType: 'half_day', rateSom: 160000 },
  { serviceType: 'other', durationType: 'full_day', rateSom: 270000 },
];

export const MIGRATIONS: MigrationDef[] = [
  {
    version: 1,
    name: '001_yandex_style_core',
    up: (sqlite: DatabaseSync) => {
      sqlite.exec(`
        -- 1. ishchi_holati (online status, geo-bucket index, active order lock, service preferences)
        CREATE TABLE IF NOT EXISTS ishchi_holati (
          worker_id TEXT PRIMARY KEY,
          is_online INTEGER NOT NULL DEFAULT 0,
          kyc_verified INTEGER NOT NULL DEFAULT 0,
          service_types TEXT NOT NULL DEFAULT '[]',
          radius_km REAL NOT NULL DEFAULT 10,
          lat REAL,
          lng REAL,
          lat_bucket INTEGER,
          lng_bucket INTEGER,
          active_order_id TEXT,
          background_consent INTEGER NOT NULL DEFAULT 0,
          acceptance_rate REAL NOT NULL DEFAULT 1.0,
          total_offers INTEGER NOT NULL DEFAULT 0,
          accepted_offers INTEGER NOT NULL DEFAULT 0,
          rejected_offers INTEGER NOT NULL DEFAULT 0,
          last_activity_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ishchi_online_geo
          ON ishchi_holati(is_online, kyc_verified, lat_bucket, lng_bucket);
        CREATE INDEX IF NOT EXISTS idx_ishchi_active_order
          ON ishchi_holati(active_order_id);

        -- 2. ish_buyurtmasi (Yandex Go style order lifecycle + locations + contract link)
        CREATE TABLE IF NOT EXISTS ish_buyurtmasi (
          id TEXT PRIMARY KEY,
          employer_id TEXT NOT NULL,
          employer_name TEXT,
          worker_id TEXT,
          worker_name TEXT,
          contract_id TEXT,
          service_type TEXT NOT NULL,
          duration_type TEXT NOT NULL CHECK(duration_type IN ('hourly','half_day','full_day')),
          payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','card_soon')),
          recommended_rate INTEGER NOT NULL DEFAULT 0,
          agreed_rate INTEGER NOT NULL DEFAULT 0,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          address_text TEXT,
          district TEXT,
          note TEXT,
          status TEXT NOT NULL DEFAULT 'qidirilmoqda',
          current_radius_km REAL NOT NULL DEFAULT 5,
          search_step INTEGER NOT NULL DEFAULT 0,
          contract_signed INTEGER NOT NULL DEFAULT 0,
          employer_rated INTEGER NOT NULL DEFAULT 0,
          worker_rated INTEGER NOT NULL DEFAULT 0,
          cancel_reason TEXT,
          cancelled_by_role TEXT,
          cancelled_by_id TEXT,
          status_history TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          matched_at TEXT,
          accepted_at TEXT,
          arrived_at TEXT,
          started_at TEXT,
          completed_at TEXT,
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_buyurtma_employer ON ish_buyurtmasi(employer_id, status);
        CREATE INDEX IF NOT EXISTS idx_buyurtma_worker ON ish_buyurtmasi(worker_id, status);
        CREATE INDEX IF NOT EXISTS idx_buyurtma_status ON ish_buyurtmasi(status, created_at);

        -- 3. buyurtma_takliflari (Sequential matching offer queue with countdown expiry)
        CREATE TABLE IF NOT EXISTS buyurtma_takliflari (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          worker_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'kutilmoqda',
          score REAL NOT NULL DEFAULT 0,
          distance_km REAL NOT NULL DEFAULT 0,
          eta_min INTEGER NOT NULL DEFAULT 15,
          search_radius_km REAL NOT NULL DEFAULT 5,
          expires_at TEXT NOT NULL,
          responded_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_taklif_order_status ON buyurtma_takliflari(order_id, status);
        CREATE INDEX IF NOT EXISTS idx_taklif_worker_status ON buyurtma_takliflari(worker_id, status);

        -- 4. sos_hodisalari (Emergency SOS triggers from active work)
        CREATE TABLE IF NOT EXISTS sos_hodisalari (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT,
          user_role TEXT NOT NULL,
          order_id TEXT,
          lat REAL,
          lng REAL,
          message TEXT,
          status TEXT NOT NULL DEFAULT 'yangi' CHECK(status IN ('yangi','korilmoqda','yopildi')),
          trusted_notified INTEGER NOT NULL DEFAULT 0,
          trusted_contact_summary TEXT,
          admin_note TEXT,
          handled_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_hodisalari(status, created_at);

        -- 5. ishonchli_shaxslar (Trusted emergency contacts for safety sharing & SOS)
        CREATE TABLE IF NOT EXISTS ishonchli_shaxslar (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          telegram_username TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trusted_user ON ishonchli_shaxslar(user_id);

        -- 6. tarif_stavkalari + tarif_stavkalari_tarixi (Recommended price matrix + audit history)
        CREATE TABLE IF NOT EXISTS tarif_stavkalari (
          id TEXT PRIMARY KEY,
          service_type TEXT NOT NULL,
          duration_type TEXT NOT NULL,
          rate_som INTEGER NOT NULL,
          updated_by TEXT,
          updated_at TEXT NOT NULL,
          UNIQUE(service_type, duration_type)
        );
        CREATE TABLE IF NOT EXISTS tarif_stavkalari_tarixi (
          id TEXT PRIMARY KEY,
          service_type TEXT NOT NULL,
          duration_type TEXT NOT NULL,
          old_rate_som INTEGER NOT NULL,
          new_rate_som INTEGER NOT NULL,
          changed_by TEXT,
          changed_by_name TEXT,
          changed_at TEXT NOT NULL
        );

        -- 7. matching_sozlamalari (Super Admin configurable weights, radii, timer & location TTL)
        CREATE TABLE IF NOT EXISTS matching_sozlamalari (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          weight_distance INTEGER NOT NULL DEFAULT 40,
          weight_rating INTEGER NOT NULL DEFAULT 25,
          weight_acceptance INTEGER NOT NULL DEFAULT 15,
          weight_service INTEGER NOT NULL DEFAULT 20,
          initial_radius_km REAL NOT NULL DEFAULT 5,
          radius_step_km REAL NOT NULL DEFAULT 5,
          max_radius_km REAL NOT NULL DEFAULT 30,
          offer_timeout_sec INTEGER NOT NULL DEFAULT 45,
          live_location_ttl_sec INTEGER NOT NULL DEFAULT 300,
          updated_by TEXT,
          updated_at TEXT NOT NULL
        );

        -- 8. tashkilot_obunalari (B2B annual subscription plans; households/workers remain free)
        CREATE TABLE IF NOT EXISTS tashkilot_obunalari (
          id TEXT PRIMARY KEY,
          employer_id TEXT NOT NULL,
          company_name TEXT NOT NULL,
          plan_name TEXT NOT NULL DEFAULT 'Yillik Tashkilot Rejasi',
          annual_price_som INTEGER NOT NULL DEFAULT 15000000,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','expired','cancelled')),
          starts_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_obuna_employer ON tashkilot_obunalari(employer_id);

        -- 9. admin_audit_jurnali (Strict admin audit trail including exact coordinate views)
        CREATE TABLE IF NOT EXISTS admin_audit_jurnali (
          id TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL,
          admin_name TEXT,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details TEXT,
          viewed_exact_coords INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_jurnali(created_at);

        -- 10. push_tokens (Web/Capacitor FCM & APNs device tokens)
        CREATE TABLE IF NOT EXISTS push_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          platform TEXT NOT NULL CHECK(platform IN ('web','android','ios')),
          token TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, token)
        );
        CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens(user_id);

        -- 11. live_order_locations (Ephemeral active-order tracking only; deleted on complete/cancel & by TTL)
        CREATE TABLE IF NOT EXISTS live_order_locations (
          order_id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          heading REAL,
          updated_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
      `);

      const now = new Date().toISOString();
      const insertRate = sqlite.prepare(`
        INSERT OR IGNORE INTO tarif_stavkalari (id, service_type, duration_type, rate_som, updated_by, updated_at)
        VALUES (?, ?, ?, ?, 'system', ?)
      `);
      for (const r of DEFAULT_RATES) {
        insertRate.run(`${r.serviceType}__${r.durationType}`, r.serviceType, r.durationType, r.rateSom, now);
      }

      sqlite.prepare(`
        INSERT OR IGNORE INTO matching_sozlamalari (
          id, weight_distance, weight_rating, weight_acceptance, weight_service,
          initial_radius_km, radius_step_km, max_radius_km, offer_timeout_sec,
          live_location_ttl_sec, updated_by, updated_at
        ) VALUES (1, 40, 25, 15, 20, 5, 5, 30, 45, 300, 'system', ?)
      `).run(now);

      // Sync existing verified workers into ishchi_holati without dropping or altering existing user rows.
      // Preserves existing latitude/longitude; keeps them offline until they explicitly toggle online or opt in.
      const existingWorkers = sqlite.prepare(`
        SELECT id, is_verified, profile_json
        FROM users WHERE role = 'worker'
      `).all() as Array<{
        id: string;
        is_verified: number;
        profile_json: string;
      }>;

      const upsertWorkerState = sqlite.prepare(`
        INSERT OR IGNORE INTO ishchi_holati (
          worker_id, is_online, kyc_verified, service_types, radius_km,
          lat, lng, lat_bucket, lng_bucket, active_order_id, background_consent,
          acceptance_rate, total_offers, accepted_offers, rejected_offers, last_activity_at, updated_at
        ) VALUES (?, 0, ?, ?, 15, ?, ?, ?, ?, NULL, 0, 1.0, 0, 0, 0, ?, ?)
      `);
      for (const w of existingWorkers) {
        let services: string[] = [];
        let lat: number | null = null;
        let lng: number | null = null;
        let lastActive = now;
        try {
          const parsed = JSON.parse(w.profile_json) as {
            profession?: string;
            skills?: string[];
            latitude?: number | null;
            longitude?: number | null;
            lastActive?: string | null;
          };
          services = Array.from(
            new Set([parsed.profession, ...(Array.isArray(parsed.skills) ? parsed.skills : [])].filter(Boolean) as string[]),
          );
          if (typeof parsed.latitude === 'number' && Number.isFinite(parsed.latitude)) lat = parsed.latitude;
          if (typeof parsed.longitude === 'number' && Number.isFinite(parsed.longitude)) lng = parsed.longitude;
          if (parsed.lastActive) lastActive = parsed.lastActive;
        } catch {
          services = [];
        }
        const latB = lat != null ? Math.floor(lat * 100) : null;
        const lngB = lng != null ? Math.floor(lng * 100) : null;
        upsertWorkerState.run(
          w.id,
          w.is_verified ? 1 : 0,
          JSON.stringify(services),
          lat,
          lng,
          latB,
          lngB,
          lastActive,
          now,
        );
      }
    },
    down: (sqlite: DatabaseSync) => {
      sqlite.exec(`
        DROP TABLE IF EXISTS live_order_locations;
        DROP TABLE IF EXISTS push_tokens;
        DROP TABLE IF EXISTS admin_audit_jurnali;
        DROP TABLE IF EXISTS tashkilot_obunalari;
        DROP TABLE IF EXISTS matching_sozlamalari;
        DROP TABLE IF EXISTS tarif_stavkalari_tarixi;
        DROP TABLE IF EXISTS tarif_stavkalari;
        DROP TABLE IF EXISTS ishonchli_shaxslar;
        DROP TABLE IF EXISTS sos_hodisalari;
        DROP TABLE IF EXISTS buyurtma_takliflari;
        DROP TABLE IF EXISTS ish_buyurtmasi;
        DROP TABLE IF EXISTS ishchi_holati;
      `);
    },
  },
];

export function runMigrations(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (sqlite.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      m.up(sqlite);
      sqlite
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, new Date().toISOString());
      sqlite.exec('COMMIT');
    } catch (err) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }
  }
}

export function rollbackLastMigration(sqlite: DatabaseSync): number | null {
  const row = sqlite
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: number; name: string } | undefined;
  if (!row) return null;
  const def = MIGRATIONS.find((m) => m.version === row.version);
  if (!def) throw new Error(`Migration definition not found for version ${row.version}`);

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    def.down(sqlite);
    sqlite.prepare('DELETE FROM schema_migrations WHERE version = ?').run(row.version);
    sqlite.exec('COMMIT');
    return row.version;
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
}
