import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiApp } from '../server';
import { sweepExpiredOffersAndLocations } from '../server/matching';

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

test('Control Panel Order Routing, Full User Edit/Delete, and Non-Expiring Offers', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-admin-dispatch-'));
  const dbPath = join(tempDir, 'dispatch.db');
  const srv = await startTestServer(dbPath);

  const authHeaders = (token: string) => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Authorization: `Bearer ${token}`,
  });

  const prevSuperAdminPw = process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_PASSWORD;

  try {
    // 1. Bootstrap Super Admin
    const saRes = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        login: '+998901119999',
        password: 'ControlPanelSecret!123',
      }),
    });
    assert.equal(saRes.status, 201);
    const { accessToken: adminToken } = (await saRes.json()) as { accessToken: string };

    // 2. Register employer + two workers (including Karimova Dilnoza)
    const reg = async (identifier: string, firstName: string, lastName: string) => {
      const r = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ identifier, password: 'Password123!', firstName, lastName }),
      });
      assert.equal(r.status, 201);
      return (await r.json()) as { accessToken: string; user: { id: string } };
    };

    const emp = await reg('emp-hotel@mq.uz', 'Grand', 'Hotel');
    const dilnoza = await reg('dilnoza@mq.uz', 'Dilnoza', 'Karimova');
    const sevara = await reg('sevara@mq.uz', 'Sevara', 'Rustamova');

    const empRow = srv.db.getUserById(emp.user.id)!;
    empRow.role = 'employer';
    empRow.phoneNumber = '+998915551100';
    empRow.isVerified = true;
    empRow.verificationStatus = 'verified';
    srv.db.upsertUser(empRow);

    for (const [idx, wId] of [dilnoza.user.id, sevara.user.id].entries()) {
      const u = srv.db.getUserById(wId)!;
      u.role = 'worker';
      u.isVerified = true;
      u.verificationStatus = 'verified';
      u.phoneNumber = idx === 0 ? '+998915551101' : '+998915551102';
      srv.db.upsertUser(u);
    }

    // Put Sevara online so automatic order creation sends initial offer to Sevara
    const sevaraOnline = await fetch(`${srv.baseUrl}/worker/status`, {
      method: 'PUT',
      headers: authHeaders(sevara.accessToken),
      body: JSON.stringify({
        isOnline: true,
        lat: 39.6545,
        lng: 66.9598,
        serviceTypes: ['hotel_cleaning', 'house_cleaning'],
        radiusKm: 15,
        backgroundConsent: true,
      }),
    });
    assert.equal(sevaraOnline.status, 200);

    // Verify default offer_timeout_sec is 0 (non-expiring until worker accepts)
    const matchSettingsRes = await fetch(`${srv.baseUrl}/admin/matching-settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(matchSettingsRes.status, 200);
    const matchSettings = (await matchSettingsRes.json()) as { offerTimeoutSec: number };
    assert.equal(matchSettings.offerTimeoutSec, 0);

    // 3. Employer places hotel_cleaning order -> offer created with noExpiry & 9999 sentinel
    const ordRes = await fetch(`${srv.baseUrl}/orders`, {
      method: 'POST',
      headers: authHeaders(emp.accessToken),
      body: JSON.stringify({
        serviceType: 'hotel_cleaning',
        durationType: 'full_day',
        paymentMethod: 'cash',
        lat: 39.6542,
        lng: 66.9597,
        district: 'Samarqand shahar',
      }),
    });
    assert.equal(ordRes.status, 201);
    const ordJson = (await ordRes.json()) as {
      order: { id: string; status: string };
      dispatch: { offer: { id: string; expiresAt: string } | null };
    };
    const orderId = ordJson.order.id;
    assert.ok(ordJson.dispatch.offer?.expiresAt.startsWith('9999-'), 'Auto offer must not carry a 60s expiry');

    // Run sweep manually -> offer MUST stay kutilmoqda
    sweepExpiredOffersAndLocations(srv.db.sqlite);
    const sevaraActiveOfferRes = await fetch(`${srv.baseUrl}/worker/offers/active`, {
      headers: { Authorization: `Bearer ${sevara.accessToken}` },
    });
    assert.equal(sevaraActiveOfferRes.status, 200);
    const sevaraActiveOfferJson = (await sevaraActiveOfferRes.json()) as {
      offer: { id: string; noExpiry?: boolean; expiresAt: string } | null;
    };
    assert.ok(sevaraActiveOfferJson.offer, 'Offer must stay active after sweep when offerTimeoutSec = 0');
    assert.equal(sevaraActiveOfferJson.offer?.noExpiry, true);

    // 4. RBAC: Non-admin cannot assign orders or edit/delete users
    const forbiddenAssign = await fetch(`${srv.baseUrl}/admin/orders/${orderId}/assign`, {
      method: 'POST',
      headers: authHeaders(emp.accessToken),
      body: JSON.stringify({ workerId: dilnoza.user.id, mode: 'offer' }),
    });
    assert.equal(forbiddenAssign.status, 403);

    // 5. Control Panel routes hotel_cleaning order as an offer specifically to Dilnoza Karimova (even if offline)
    const routeOfferRes = await fetch(`${srv.baseUrl}/admin/orders/${orderId}/assign`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ workerId: dilnoza.user.id, mode: 'offer' }),
    });
    assert.equal(routeOfferRes.status, 200);
    const routeOfferJson = (await routeOfferRes.json()) as {
      order: { pendingOfferWorkerId: string | null; pendingOfferWorkerName: string | null };
    };
    assert.equal(routeOfferJson.order.pendingOfferWorkerId, dilnoza.user.id);

    const dilnozaOfferRes = await fetch(`${srv.baseUrl}/worker/offers/active`, {
      headers: { Authorization: `Bearer ${dilnoza.accessToken}` },
    });
    assert.equal(dilnozaOfferRes.status, 200);
    const dilnozaOfferJson = (await dilnozaOfferRes.json()) as {
      offer: { id: string; noExpiry?: boolean; expiresAt: string } | null;
    };
    assert.ok(dilnozaOfferJson.offer, 'Dilnoza Karimova should receive admin-routed offer');
    assert.equal(dilnozaOfferJson.offer?.noExpiry, true);

    // Dilnoza accepts the routed offer
    const dilnozaAcceptRes = await fetch(`${srv.baseUrl}/worker/offers/${dilnozaOfferJson.offer!.id}/accept`, {
      method: 'POST',
      headers: authHeaders(dilnoza.accessToken),
      body: JSON.stringify({}),
    });
    assert.equal(dilnozaAcceptRes.status, 200);
    const acceptJson = (await dilnozaAcceptRes.json()) as { success: boolean; contractId: string };
    assert.equal(acceptJson.success, true);
    assert.ok(acceptJson.contractId);
    const acceptedOrderRes = await fetch(`${srv.baseUrl}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${dilnoza.accessToken}` },
    });
    assert.equal(acceptedOrderRes.status, 200);
    const acceptedOrderJson = (await acceptedOrderRes.json()) as { order: { status: string; workerId: string } };
    assert.equal(acceptedOrderJson.order.status, 'qabul_qilindi');
    assert.equal(acceptedOrderJson.order.workerId, dilnoza.user.id);

    // 6. Control Panel directly assigns a house_cleaning order from another employer to Sevara
    const emp2 = await reg('emp-home@mq.uz', 'Malika', 'Sattorova');
    const emp2Row = srv.db.getUserById(emp2.user.id)!;
    emp2Row.role = 'employer';
    emp2Row.phoneNumber = '+998915551199';
    emp2Row.isVerified = true;
    emp2Row.verificationStatus = 'verified';
    srv.db.upsertUser(emp2Row);

    const houseOrderRes = await fetch(`${srv.baseUrl}/orders`, {
      method: 'POST',
      headers: authHeaders(emp2.accessToken),
      body: JSON.stringify({
        serviceType: 'house_cleaning',
        durationType: 'hourly',
        paymentMethod: 'cash',
        lat: 39.6542,
        lng: 66.9597,
      }),
    });
    assert.equal(houseOrderRes.status, 201);
    const { order: houseOrder } = (await houseOrderRes.json()) as { order: { id: string } };

    const directAssignRes = await fetch(`${srv.baseUrl}/admin/orders/${houseOrder.id}/assign`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ workerId: sevara.user.id, mode: 'direct' }),
    });
    assert.equal(directAssignRes.status, 200);
    const directAssignJson = (await directAssignRes.json()) as {
      order: { status: string; workerId: string; contractId: string | null };
    };
    assert.equal(directAssignJson.order.status, 'qabul_qilindi');
    assert.equal(directAssignJson.order.workerId, sevara.user.id);
    assert.ok(directAssignJson.order.contractId);

    // 7. Control Panel edits Dilnoza Karimova's user profile & verifies 409 on duplicate phone
    const dupPhoneRes = await fetch(`${srv.baseUrl}/admin/users/${dilnoza.user.id}`, {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({ phoneNumber: '+998915551102' }),
    });
    assert.equal(dupPhoneRes.status, 409);

    const editUserRes = await fetch(`${srv.baseUrl}/admin/users/${dilnoza.user.id}`, {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        fullName: 'Karimova Dilnoza Alisherovna',
        district: 'Urgut',
        profession: 'Uy va mehmonxona tozalash mutaxassisi',
        skills: ['house_cleaning', 'hotel_cleaning'],
        isVerified: true,
      }),
    });
    assert.equal(editUserRes.status, 200);
    const updatedDilnoza = srv.db.getUserById(dilnoza.user.id)!;
    assert.equal(updatedDilnoza.fullName, 'Karimova Dilnoza Alisherovna');
    assert.equal(updatedDilnoza.district, 'Urgut');
    assert.deepEqual(updatedDilnoza.skills, ['house_cleaning', 'hotel_cleaning']);

    // 8. Control Panel permanently deletes Sevara & releases her assigned house_cleaning order back to qidirilmoqda
    const forbiddenDel = await fetch(`${srv.baseUrl}/admin/users/${sevara.user.id}`, {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Authorization: `Bearer ${emp.accessToken}` },
    });
    assert.equal(forbiddenDel.status, 403);

    const delRes = await fetch(`${srv.baseUrl}/admin/users/${sevara.user.id}`, {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest', Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRes.status, 200);
    assert.equal(srv.db.getUserById(sevara.user.id), null, 'Deleted user must be permanently removed from database');

    const releasedOrder = srv.db.sqlite
      .prepare('SELECT status, worker_id FROM ish_buyurtmasi WHERE id = ?')
      .get(houseOrder.id) as { status: string; worker_id: string | null };
    assert.equal(releasedOrder.status, 'qidirilmoqda');
    assert.equal(releasedOrder.worker_id, null);
  } finally {
    if (prevSuperAdminPw !== undefined) process.env.SUPER_ADMIN_PASSWORD = prevSuperAdminPw;
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
