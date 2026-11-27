import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiApp } from '../server';

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

test('Phone and password registration, multi-device login, and session persistence', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-phone-auth-'));
  const dbPath = join(tempDir, 'phone-auth.db');
  const srv = await startTestServer(dbPath);

  try {
    const testPhone = '+998901234567';
    const testPassword = 'MeningParolim123!';
    const fullName = 'Mohira Usmanova';

    // 1. Weak password rejected with 400
    const weakRes = await fetch(`${srv.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: testPhone,
        password: '123',
        fullName,
        role: 'worker',
      }),
    });
    assert.equal(weakRes.status, 400, 'Password under 8 chars must be rejected');

    // 2. Successful Registration with Phone Number + Password
    const regRes = await fetch(`${srv.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: testPhone,
        password: testPassword,
        fullName,
        role: 'worker',
      }),
    });
    assert.equal(regRes.status, 201, 'Registration must succeed with 201');
    const regData = (await regRes.json()) as { accessToken: string; user: Record<string, unknown> };
    assert.ok(regData.accessToken, 'Must return JWT token');
    assert.equal(regData.user.phoneNumber, testPhone);
    assert.equal(regData.user.role, 'worker');
    assert.equal(regData.user.onboardingCompleted, true, 'User must be marked onboarded immediately');
    assert.equal('passwordHash' in regData.user, false, 'Password hash must never leak in API output');

    // Verify bcrypt in DB
    const dbUser = srv.db.getUserByPhone(testPhone);
    assert.ok(dbUser?.passwordHash?.startsWith('$2'), 'Must be stored as bcrypt hash in SQLite');

    // 3. Login from another device using exact phone + password
    const loginRes = await fetch(`${srv.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: testPhone,
        password: testPassword,
      }),
    });
    assert.equal(loginRes.status, 200, 'Login from another device must succeed with 200');
    const loginData = (await loginRes.json()) as { accessToken: string; user: Record<string, unknown> };
    assert.ok(loginData.accessToken);
    assert.equal(loginData.user.phoneNumber, testPhone);
    assert.equal(loginData.user.fullName, fullName);

    // 4. Login from another device using alternate 9-digit format (e.g. 901234567)
    const loginAltRes = await fetch(`${srv.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: '901234567',
        password: testPassword,
      }),
    });
    assert.equal(loginAltRes.status, 200, 'Login with normalized 9 digits must succeed');

    // 5. Wrong password rejected with 401
    const wrongPassRes = await fetch(`${srv.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: testPhone,
        password: 'NotoqriParol123!',
      }),
    });
    assert.equal(wrongPassRes.status, 401, 'Wrong password must return 401');

    // 6. Duplicate registration returns 409
    const dupRes = await fetch(`${srv.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: testPhone,
        password: testPassword,
        fullName: 'Boshqa Ism',
      }),
    });
    assert.equal(dupRes.status, 409, 'Duplicate phone number must return 409 Conflict');

    // 7. Authenticate via Bearer header (device session persistence simulation)
    const meRes = await fetch(`${srv.baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${loginData.accessToken}`,
      },
    });
    assert.equal(meRes.status, 200);
    const meData = (await meRes.json()) as Record<string, unknown>;
    assert.equal(meData.phoneNumber, testPhone);
    assert.equal(meData.fullName, fullName);
  } finally {
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
