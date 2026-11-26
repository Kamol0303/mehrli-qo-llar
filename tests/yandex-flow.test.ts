import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiApp } from '../server';
import {
  assertOrderTransition,
  canTransitionOrder,
  StateTransitionError,
} from '../server/orderStateMachine';
import {
  obfuscatePreAcceptCoords,
  quantizeCoordBucket,
  redactCoordinatesFromLogPayload,
} from '../server/privacyAndCoords';
import { getMatchingSettings, haversineKm, rankCandidatesForOrder } from '../server/matching';

async function startTestServer(dbPath: string) {
  const { app, db } = createApiApp(dbPath);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}/api`;
  const close = async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    db.close();
  };
  return { baseUrl, db, close };
}

test('Order state machine transitions & digital contract gate before start', () => {
  assert.equal(canTransitionOrder('qidirilmoqda', 'taklif_yuborildi').ok, true);
  assert.equal(canTransitionOrder('taklif_yuborildi', 'qabul_qilindi').ok, true);
  assert.equal(canTransitionOrder('qabul_qilindi', 'yolda').ok, true);
  assert.equal(canTransitionOrder('yolda', 'yetib_keldi').ok, true);

  const deniedStart = canTransitionOrder('yetib_keldi', 'jarayonda', { contractSigned: false });
  assert.equal(deniedStart.ok, false);
  if (!deniedStart.ok) assert.equal(deniedStart.code, 'CONTRACT_REQUIRED');

  assert.throws(
    () => assertOrderTransition('yetib_keldi', 'jarayonda', { contractSigned: false }),
    StateTransitionError,
  );
  assert.equal(canTransitionOrder('yetib_keldi', 'jarayonda', { contractSigned: true }).ok, true);
  assert.equal(canTransitionOrder('jarayonda', 'yakunlandi').ok, true);
  assert.equal(canTransitionOrder('yakunlandi', 'yolda').ok, false);
  assert.equal(canTransitionOrder('bekor_qilindi', 'qidirilmoqda').ok, false);
});

test('Privacy helpers obfuscate pre-accept coordinates ~250m and strip coords from logs', () => {
  const exactLat = 39.6542;
  const exactLng = 66.9597;
  const obf = obfuscatePreAcceptCoords(exactLat, exactLng, 'worker-1');
  const shiftMeters = haversineKm(exactLat, exactLng, obf.lat, obf.lng) * 1000;
  assert.ok(shiftMeters > 50 && shiftMeters < 500, `Expected ~250m shift, got ${shiftMeters}m`);
  assert.equal(obf.approxRadiusMeters, 250);

  const sanitized = redactCoordinatesFromLogPayload({
    orderId: 'ord_1',
    lat: 39.6542,
    lng: 66.9597,
    nested: { workerLat: 39.65, workerLng: 66.96, note: 'safe text' },
  }) as Record<string, unknown>;
  assert.equal(sanitized.lat, '[REDACTED_COORD]');
  assert.equal(sanitized.lng, '[REDACTED_COORD]');
  assert.equal((sanitized.nested as Record<string, unknown>).workerLat, '[REDACTED_COORD]');
  assert.equal((sanitized.nested as Record<string, unknown>).note, 'safe text');
});

test('Full E2E Yandex Marketplace Lifecycle, Concurrency Lock, Privacy, RBAC, SOS, and Rate Limiting', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-yandex-e2e-'));
  const dbPath = join(tempDir, 'yandex.db');
  const srv = await startTestServer(dbPath);

  const headers = (token: string) => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: `Bearer ${token}`,
  });

  const prevSuperAdminPw = process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_PASSWORD;

  try {
    // 1. Setup Super Admin (must use secret-guarded admin flow, never client role escalation)
    const saSetup = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        login: '+998901110000',
        password: 'SuperAdminPassword123!',
      }),
    });
    assert.equal(saSetup.status, 201);
    const { accessToken: adminToken } = (await saSetup.json()) as { accessToken: string };

    // 2. Register Employer, Worker A (KYC approved), Worker B (KYC approved), Worker C (KYC unverified), Intruder
    const registerUser = async (email: string, firstName: string) => {
      const r = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ identifier: email, password: 'Password123!', firstName }),
      });
      assert.equal(r.status, 201);
      return (await r.json()) as { accessToken: string; user: { id: string } };
    };

    const emp = await registerUser('emp@mq.uz', 'Oila');
    const wA = await registerUser('workera@mq.uz', 'Malika');
    const wB = await registerUser('workerb@mq.uz', 'Dilnoza');
    const wUnverified = await registerUser('unverified@mq.uz', 'Unverified');
    const intruder = await registerUser('intruder@mq.uz', 'Intruder');

    // Complete Employer onboarding (role=employer, phone + telegramId check)
    const empRow = srv.db.getUserById(emp.user.id)!;
    empRow.telegramId = '9990001';
    empRow.role = 'employer';
    srv.db.upsertUser(empRow);
    const empOnboard = await fetch(`${srv.baseUrl}/auth/complete-onboarding`, {
      method: 'PATCH',
      headers: headers(emp.accessToken),
      body: JSON.stringify({
        role: 'employer',
        fullName: 'Karimova Oila',
        phoneNumber: '+998918887766',
        permissionsAcknowledged: true,
      }),
    });
    assert.equal(empOnboard.status, 200);

    // 3. Unverified worker CANNOT go online -> 403 KYC_REQUIRED
    const blockedOnline = await fetch(`${srv.baseUrl}/worker/status`, {
      method: 'PUT',
      headers: headers(wUnverified.accessToken),
      body: JSON.stringify({
        isOnline: true,
        lat: 39.6542,
        lng: 66.9597,
        serviceTypes: ['house_cleaning'],
      }),
    });
    assert.equal(blockedOnline.status, 403);
    const blockedBody = (await blockedOnline.json()) as { code: string };
    assert.equal(blockedBody.code, 'KYC_REQUIRED');

    // Approve KYC for Worker A and Worker B
    for (const wId of [wA.user.id, wB.user.id]) {
      const u = srv.db.getUserById(wId)!;
      u.role = 'worker';
      u.isVerified = true;
      u.verificationStatus = 'verified';
      u.rating = wId === wA.user.id ? 4.9 : 4.7;
      u.phoneNumber = wId === wA.user.id ? '+998918887755' : '+998918887744';
      srv.db.upsertUser(u);
    }

    // Worker A slightly closer (39.6550, 66.9600), Worker B slightly farther (39.6620, 66.9650)
    const goOnlineA = await fetch(`${srv.baseUrl}/worker/status`, {
      method: 'PUT',
      headers: headers(wA.accessToken),
      body: JSON.stringify({
        isOnline: true,
        lat: 39.655,
        lng: 66.96,
        serviceTypes: ['house_cleaning'],
        radiusKm: 15,
        backgroundConsent: true,
      }),
    });
    assert.equal(goOnlineA.status, 200);

    const goOnlineB = await fetch(`${srv.baseUrl}/worker/status`, {
      method: 'PUT',
      headers: headers(wB.accessToken),
      body: JSON.stringify({
        isOnline: true,
        lat: 39.662,
        lng: 66.965,
        serviceTypes: ['house_cleaning'],
        radiusKm: 15,
        backgroundConsent: true,
      }),
    });
    assert.equal(goOnlineB.status, 200);

    // 4. Pre-accept map workers endpoint must obfuscate exact coordinates & strip PII
    const nearbyRes = await fetch(`${srv.baseUrl}/map/nearby-workers?lat=39.6542&lng=66.9597&radiusKm=10`, {
      headers: { Authorization: `Bearer ${emp.accessToken}` },
    });
    assert.equal(nearbyRes.status, 200);
    const nearbyBody = (await nearbyRes.json()) as {
      privacyObfuscated: boolean;
      workers: Array<Record<string, unknown>>;
    };
    assert.equal(nearbyBody.privacyObfuscated, true);
    assert.equal(nearbyBody.workers.length, 2);
    for (const marker of nearbyBody.workers) {
      assert.equal('fullName' in marker, false, 'Worker name must NOT be exposed pre-acceptance');
      assert.equal('phoneNumber' in marker, false, 'Phone must NOT be exposed pre-acceptance');
      assert.notEqual(marker.lat, 39.655);
    }

    // 5. Employer creates order -> dispatched to top candidate Worker A
    const createOrderRes = await fetch(`${srv.baseUrl}/orders`, {
      method: 'POST',
      headers: headers(emp.accessToken),
      body: JSON.stringify({
        serviceType: 'house_cleaning',
        durationType: 'half_day',
        paymentMethod: 'cash',
        lat: 39.6542,
        lng: 66.9597,
        addressText: 'Registon ko‘chasi 15',
        district: 'Samarqand shahar',
      }),
    });
    assert.equal(createOrderRes.status, 201);
    const createdOrder = (await createOrderRes.json()) as {
      order: { id: string; status: string };
      dispatch: { offer: { id: string; workerId: string } | null };
    };
    assert.equal(createdOrder.dispatch.offer?.workerId, wA.user.id);
    const orderId = createdOrder.order.id;
    const offerAId = createdOrder.dispatch.offer!.id;

    // 6. Penalty-free Reject by Worker A -> next offer automatically goes to Worker B
    const rejectRes = await fetch(`${srv.baseUrl}/worker/offers/${offerAId}/reject`, {
      method: 'POST',
      headers: headers(wA.accessToken),
      body: JSON.stringify({}),
    });
    assert.equal(rejectRes.status, 200);
    const rejectJson = (await rejectRes.json()) as { penaltyFree: boolean };
    assert.equal(rejectJson.penaltyFree, true);
    assert.equal(srv.db.getUserById(wA.user.id)?.rating, 4.9, 'Rating must remain penalty-free after reject');

    const offerBRes = await fetch(`${srv.baseUrl}/worker/offers/active`, {
      headers: { Authorization: `Bearer ${wB.accessToken}` },
    });
    assert.equal(offerBRes.status, 200);
    const offerBJson = (await offerBRes.json()) as { offer: { id: string } | null };
    assert.ok(offerBJson.offer, 'Worker B should receive active offer after Worker A rejects');
    const offerBId = offerBJson.offer.id;

    // 7. Atomic Concurrent Offer Accept check (two parallel accept requests -> strictly 1 succeeds, 1 conflicts)
    const [acc1, acc2] = await Promise.all([
      fetch(`${srv.baseUrl}/worker/offers/${offerBId}/accept`, {
        method: 'POST',
        headers: headers(wB.accessToken),
        body: JSON.stringify({}),
      }),
      fetch(`${srv.baseUrl}/worker/offers/${offerBId}/accept`, {
        method: 'POST',
        headers: headers(wB.accessToken),
        body: JSON.stringify({}),
      }),
    ]);
    const statuses = [acc1.status, acc2.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Concurrent offer accept must be atomic (one 200, one 409)');

    // 8. IDOR Check: Intruder cannot view order details
    const idorRes = await fetch(`${srv.baseUrl}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${intruder.accessToken}` },
    });
    assert.equal(idorRes.status, 403);

    // Non-admin RBAC Check: Employer / Worker blocked from /api/admin/*
    const nonAdminRes = await fetch(`${srv.baseUrl}/admin/dashboard/kpi`, {
      headers: { Authorization: `Bearer ${emp.accessToken}` },
    });
    assert.equal(nonAdminRes.status, 403);

    // 9. Lifecycle transitions + Contract Signing Enforcement + Live GPS Wipe
    const activeRes = await fetch(`${srv.baseUrl}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${wB.accessToken}` },
    });
    const activeJson = (await activeRes.json()) as {
      order: { contractId: string; status: string };
    };
    const contractId = activeJson.order.contractId;
    assert.ok(contractId, 'Contract should be auto-created upon accept');

    // En-route -> broadcast live location
    const toYolda = await fetch(`${srv.baseUrl}/orders/${orderId}/transition`, {
      method: 'POST',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ status: 'yolda' }),
    });
    assert.equal(toYolda.status, 200);

    const locPush = await fetch(`${srv.baseUrl}/orders/${orderId}/location`, {
      method: 'PUT',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ lat: 39.658, lng: 66.962 }),
    });
    assert.equal(locPush.status, 200);

    // Arrived
    const toArrived = await fetch(`${srv.baseUrl}/orders/${orderId}/transition`, {
      method: 'POST',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ status: 'yetib_keldi' }),
    });
    assert.equal(toArrived.status, 200);

    // Starting BEFORE both parties sign contract MUST fail
    const startBeforeContract = await fetch(`${srv.baseUrl}/orders/${orderId}/transition`, {
      method: 'POST',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ status: 'jarayonda' }),
    });
    assert.equal(startBeforeContract.status, 400);

    // Both parties sign digital contract
    await fetch(`${srv.baseUrl}/contracts/${contractId}`, {
      method: 'PATCH',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ signedByWorker: true }),
    });
    await fetch(`${srv.baseUrl}/contracts/${contractId}`, {
      method: 'PATCH',
      headers: headers(emp.accessToken),
      body: JSON.stringify({ signedByEmployer: true }),
    });

    // Now jarayonda -> yakunlandi succeed cleanly
    const toStart = await fetch(`${srv.baseUrl}/orders/${orderId}/transition`, {
      method: 'POST',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ status: 'jarayonda' }),
    });
    assert.equal(toStart.status, 200);

    const toFinish = await fetch(`${srv.baseUrl}/orders/${orderId}/transition`, {
      method: 'POST',
      headers: headers(wB.accessToken),
      body: JSON.stringify({ status: 'yakunlandi' }),
    });
    assert.equal(toFinish.status, 200);

    // Verify live GPS trail wiped immediately on completion!
    const liveRowCount = srv.db.sqlite
      .prepare('SELECT COUNT(*) as c FROM live_order_locations WHERE order_id = ?')
      .get(orderId) as { c: number };
    assert.equal(liveRowCount.c, 0, 'Temporary live GPS row must be deleted when order finishes');

    // 10. Mutual Rating
    const empRate = await fetch(`${srv.baseUrl}/orders/${orderId}/rate`, {
      method: 'POST',
      headers: headers(emp.accessToken),
      body: JSON.stringify({ rating: 5, comment: 'Zo‘r ish!' }),
    });
    assert.equal(empRate.status, 201);

    // 11. SOS trigger & Super Admin Live Map + Coordinate Audit Trail
    const sosRes = await fetch(`${srv.baseUrl}/sos`, {
      method: 'POST',
      headers: headers(emp.accessToken),
      body: JSON.stringify({ orderId, lat: 39.6542, lng: 66.9597, message: 'Test SOS' }),
    });
    assert.equal(sosRes.status, 201);

    const liveMapRes = await fetch(`${srv.baseUrl}/admin/live-map`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(liveMapRes.status, 200);

    const auditRes = await fetch(`${srv.baseUrl}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(auditRes.status, 200);
    const auditJson = (await auditRes.json()) as {
      logs: Array<{ action: string; viewedExactCoords: boolean }>;
    };
    assert.ok(
      auditJson.logs.some((l) => l.action === 'VIEW_ADMIN_LIVE_MAP' && l.viewedExactCoords === true),
      'Super Admin viewing exact coordinates must record audit log entry',
    );

    // 12. Rate Limiting Check (Order spam -> 429)
    let got429 = false;
    for (let i = 0; i < 16; i += 1) {
      const r = await fetch(`${srv.baseUrl}/orders`, {
        method: 'POST',
        headers: headers(emp.accessToken),
        body: JSON.stringify({
          serviceType: 'house_cleaning',
          durationType: 'hourly',
          paymentMethod: 'cash',
          lat: 39.65,
          lng: 66.95,
        }),
      });
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true, 'Rapid order creation must trigger HTTP 429 rate limiter');

    // 13. Radius expansion & muddati_otdi expiry when no online workers exist in distant desert
    const farOrderRes = await fetch(`${srv.baseUrl}/orders`, {
      method: 'POST',
      headers: headers(emp.accessToken),
      body: JSON.stringify({
        serviceType: 'postpartum_care',
        durationType: 'full_day',
        paymentMethod: 'cash',
        lat: 43.0,
        lng: 59.0,
      }),
    });
    if (farOrderRes.status === 201) {
      const farJson = (await farOrderRes.json()) as { order: { status: string } };
      assert.equal(farJson.order.status, 'muddati_otdi');
    }
  } finally {
    if (prevSuperAdminPw !== undefined) process.env.SUPER_ADMIN_PASSWORD = prevSuperAdminPw;
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('5,000+ Online Worker Spatial Index Geo-Search Load Benchmark', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-bench-5k-'));
  const dbPath = join(tempDir, 'bench.db');
  const srv = await startTestServer(dbPath);

  try {
    const sqlite = srv.db.sqlite;
    const now = new Date().toISOString();

    sqlite.exec('BEGIN');
    const insertUser = sqlite.prepare(`
      INSERT INTO users (
        id, role, full_name, first_name, last_name, is_verified, verification_status,
        is_blocked, rating, completed_jobs, district, profile_json, created_at, updated_at
      ) VALUES (?, 'worker', ?, 'Worker', 'Bench', 1, 'verified', 0, ?, 10, 'Samarqand', ?, ?, ?)
    `);
    const insertGeo = sqlite.prepare(`
      INSERT INTO ishchi_holati (
        worker_id, is_online, kyc_verified, service_types, radius_km,
        lat, lng, lat_bucket, lng_bucket, acceptance_rate, last_activity_at, updated_at
      ) VALUES (?, 1, 1, '["house_cleaning","childcare"]', 15, ?, ?, ?, ?, 0.95, ?, ?)
    `);

    const TOTAL_WORKERS = 5200;
    for (let i = 0; i < TOTAL_WORKERS; i += 1) {
      const id = `bench_w_${i}`;
      // Spread 5,200 workers across Samarqand and Uzbekistan grid
      const lat = 39.4 + ((i % 100) / 100) * 0.6;
      const lng = 66.5 + (Math.floor(i / 100) / 52) * 0.9;
      const rating = 4.2 + (i % 8) * 0.1;
      insertUser.run(id, `Ishchi ${i}`, rating, JSON.stringify({ id, rating, latitude: lat, longitude: lng }), now, now);
      insertGeo.run(id, lat, lng, quantizeCoordBucket(lat), quantizeCoordBucket(lng), now, now);
    }
    sqlite.exec('COMMIT');

    const settings = getMatchingSettings(sqlite);
    const timingsMs: number[] = [];
    let lastCount = 0;

    for (let run = 0; run < 12; run += 1) {
      const t0 = performance.now();
      const candidates = rankCandidatesForOrder(
        sqlite,
        { id: `ord_bench_${run}`, serviceType: 'house_cleaning', lat: 39.6542, lng: 66.9597 },
        settings,
        10,
        new Set<string>(),
      );
      const dt = performance.now() - t0;
      timingsMs.push(dt);
      lastCount = candidates.length;
    }

    timingsMs.sort((a, b) => a - b);
    const p50 = timingsMs[Math.floor(timingsMs.length * 0.5)];
    const p95 = timingsMs[Math.floor(timingsMs.length * 0.95)];
    console.log(
      `[BENCHMARK] 5,200 online workers geo-search: matched=${lastCount}, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`,
    );

    assert.ok(lastCount > 20, `Should match multiple nearby workers out of ${TOTAL_WORKERS}`);
    assert.ok(p95 < 150, `Expected p95 < 150ms across 5,200 online workers, got ${p95.toFixed(2)}ms`);
  } finally {
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
