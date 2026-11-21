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

function extractSessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') || '';
  const match = header.match(/mq_session=[^;]+/);
  return match ? match[0] : '';
}

test('Auth registration, login, duplicate 409, cookie persistence, and DB survival across server restarts', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-auth-test-'));
  const dbPath = join(tempDir, 'test.db');

  const srv1 = await startTestServer(dbPath);
  let registeredUserId = '';
  let sessionCookie = '';
  let bearerToken = '';

  try {
    // 1. Register via Email + Password (attempt role escalation -> must be forced to worker)
    const regRes = await fetch(`${srv1.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: 'Dilnoza.Test@Example.UZ',
        password: 'StrongPassword123!',
        firstName: 'Dilnoza',
        lastName: 'Karimova',
        role: 'super_admin',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = (await regRes.json()) as { accessToken: string; user: Record<string, unknown> };
    assert.ok(regBody.accessToken, 'Should issue access token');
    assert.equal(regBody.user.email, 'dilnoza.test@example.uz');
    assert.equal(regBody.user.role, 'worker', 'Privilege escalation on signup must be blocked');
    assert.equal('passwordHash' in regBody.user, false, 'Password hash must never be exposed');
    registeredUserId = String(regBody.user.id);
    bearerToken = regBody.accessToken;

    const rawSetCookie = regRes.headers.get('set-cookie') || '';
    assert.match(rawSetCookie, /HttpOnly/i, 'Session cookie must be HttpOnly');
    sessionCookie = extractSessionCookie(regRes);
    assert.ok(sessionCookie, 'Should set mq_session cookie');

    // Verify password is stored as bcrypt hash in SQLite (not plaintext)
    const dbRow = srv1.db.getUserById(registeredUserId);
    assert.ok(dbRow?.passwordHash?.startsWith('$2'), 'Password must be bcrypt hashed in DB');
    assert.notEqual(dbRow?.passwordHash, 'StrongPassword123!');

    // 2. Duplicate email must return 409 Conflict
    const dupRes = await fetch(`${srv1.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: 'dilnoza.test@example.uz',
        password: 'AnotherPassword123!',
        firstName: 'Duplicate',
      }),
    });
    assert.equal(dupRes.status, 409);

    // 3. Weak password must return 400
    const weakRes = await fetch(`${srv1.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: '+998901112233',
        password: '123',
        firstName: 'Short',
      }),
    });
    assert.equal(weakRes.status, 400);

    // 4. Register via Phone + Password as employer
    const phoneRegRes = await fetch(`${srv1.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: '+998 90 777 88 99',
        password: 'EmployerPass123!',
        fullName: 'Samarqand Textile LLC',
        role: 'employer',
      }),
    });
    assert.equal(phoneRegRes.status, 201);
    const phoneRegBody = (await phoneRegRes.json()) as { user: Record<string, unknown> };
    assert.equal(phoneRegBody.user.phoneNumber, '+998907778899');
    assert.equal(phoneRegBody.user.role, 'employer');

    // 4b. Duplicate phone must return 409 Conflict
    const dupPhoneRes = await fetch(`${srv1.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: '907778899',
        password: 'AnotherPassword123!',
        fullName: 'Duplicate Phone',
      }),
    });
    assert.equal(dupPhoneRes.status, 409);

    // 5. GET /api/auth/me works via HttpOnly cookie alone (no Authorization header)
    const meCookieRes = await fetch(`${srv1.baseUrl}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(meCookieRes.status, 200);
    const meCookieBody = (await meCookieRes.json()) as { id: string; email: string };
    assert.equal(meCookieBody.id, registeredUserId);
    assert.equal(meCookieBody.email, 'dilnoza.test@example.uz');

    // 6. Wrong password must return 401
    const badLoginRes = await fetch(`${srv1.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ identifier: 'dilnoza.test@example.uz', password: 'WrongPassword!' }),
    });
    assert.equal(badLoginRes.status, 401);

    // 7. Logout revokes previous token
    const logoutRes = await fetch(`${srv1.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    assert.equal(logoutRes.status, 200);

    // Wait 1.1s so iat < sessionValidAfter (JWT iat has 1s granularity)
    await new Promise((r) => setTimeout(r, 1100));
    const revokedMe = await fetch(`${srv1.baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    assert.equal(revokedMe.status, 401, 'Logged-out token must be rejected');
  } finally {
    await srv1.close();
  }

  // 8. RESTART SIMULATION: Boot a completely new server + DB connection on the SAME SQLite file
  const srv2 = await startTestServer(dbPath);
  try {
    const loginAfterRestart = await fetch(`${srv2.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: 'dilnoza.test@example.uz',
        password: 'StrongPassword123!',
      }),
    });
    assert.equal(loginAfterRestart.status, 200, 'Registered user must persist across server restart');
    const loginBody = (await loginAfterRestart.json()) as { accessToken: string; user: { id: string } };
    assert.equal(loginBody.user.id, registeredUserId);

    // Also confirm phone employer persisted across restart
    const employerLogin = await fetch(`${srv2.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: '907778899',
        password: 'EmployerPass123!',
      }),
    });
    assert.equal(employerLogin.status, 200);
  } finally {
    await srv2.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Security PoC verification: Mass Assignment, Chat IDOR, Private Upload Access, Path Traversal, RBAC, Deprecated OTP, JSON 404', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-sec-test-'));
  const dbPath = join(tempDir, 'sec.db');
  const srv = await startTestServer(dbPath);

  try {
    // Register Alice (worker) and Bob (employer) and Eve (worker)
    const regUser = async (identifier: string, role: 'worker' | 'employer') => {
      const r = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ identifier, password: 'Password123!', firstName: identifier.split('@')[0], role }),
      });
      assert.equal(r.status, 201);
      return (await r.json()) as { accessToken: string; user: { id: string; role: string; isVerified: boolean } };
    };

    const alice = await regUser('alice@test.uz', 'worker');
    const bob = await regUser('bob@test.uz', 'employer');
    const eve = await regUser('eve@test.uz', 'worker');

    // PoC 1: Mass assignment attempt on PATCH /api/users/:id
    const patchRes = await fetch(`${srv.baseUrl}/users/${alice.user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        bio: 'Updated bio',
        role: 'super_admin',
        isVerified: true,
        rating: 5,
      }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as { role: string; isVerified: boolean; bio: string };
    assert.equal(patched.bio, 'Updated bio');
    assert.equal(patched.role, 'worker', 'Mass assignment must not elevate role');
    assert.equal(patched.isVerified, false, 'Mass assignment must not forge verification');

    // PoC 2: Cross-user private chat IDOR blocked
    const sendMsg = await fetch(`${srv.baseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ receiverId: bob.user.id, content: 'Private salary discussion' }),
    });
    assert.equal(sendMsg.status, 201);

    const eveReadChat = await fetch(
      `${srv.baseUrl}/chat-messages?userA=${alice.user.id}&userB=${bob.user.id}`,
      { headers: { Authorization: `Bearer ${eve.accessToken}` } },
    );
    assert.equal(eveReadChat.status, 403, 'Third party must not read private chat messages');

    // PoC 3: Private upload access control & path traversal
    const uploadRes = await fetch(`${srv.baseUrl}/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'passport-scan-bytes',
    });
    assert.equal(uploadRes.status, 201);
    const uploaded = (await uploadRes.json()) as { url: string; filename: string };

    // Unauthenticated read -> 401
    const unauthFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`);
    assert.equal(unauthFile.status, 401, 'Private upload must require auth');

    // Cross-user read (Eve reading Alice's document) -> 403
    const eveFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`, {
      headers: { Authorization: `Bearer ${eve.accessToken}` },
    });
    assert.equal(eveFile.status, 403, 'Another user must not read private upload');

    // Owner read (Alice reading her own document) -> 200
    const aliceFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    assert.equal(aliceFile.status, 200);
    assert.equal(await aliceFile.text(), 'passport-scan-bytes');

    // Path traversal attempt -> 400
    const traversal = await fetch(`${srv.baseUrl}/uploads/private/${alice.user.id}/..%2Fsecret.txt`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    assert.equal(traversal.status, 400, 'Path traversal must be rejected');

    // PoC 4: Unauthorized admin subscription mutation -> 403
    const subRes = await fetch(`${srv.baseUrl}/admin/subscription/price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ priceSom: 1 }),
    });
    assert.equal(subRes.status, 403);

    // PoC 5: Deprecated OTP & unauthenticated password reset return 410 Gone
    const otpRes = await fetch(`${srv.baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ phone: '+998901234567' }),
    });
    assert.equal(otpRes.status, 410);

    const resetRes = await fetch(`${srv.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ phone: '+998901234567', newPassword: 'HackedPassword123' }),
    });
    assert.equal(resetRes.status, 410);

    // PoC 6: Unknown API route returns JSON 404
    const notFound = await fetch(`${srv.baseUrl}/does-not-exist`);
    assert.equal(notFound.status, 404);
    assert.match(notFound.headers.get('content-type') || '', /application\/json/);

    // PoC 7: Super Admin first-run setup locks after single claim
    const origSuperAdminPw = process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SUPER_ADMIN_PASSWORD;
    try {
      const status1 = await (await fetch(`${srv.baseUrl}/auth/super-admin/status`)).json() as { needsSetup: boolean };
      assert.equal(status1.needsSetup, true);

      const setup1 = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ login: 'boss@mexrliqollar.uz', password: 'SuperSecretAdminPassword1!' }),
      });
      assert.equal(setup1.status, 201);

      const setup2 = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ login: 'attacker@evil.uz', password: 'AttackerPassword1!' }),
      });
      assert.equal(setup2.status, 409, 'Second super-admin setup claim must be blocked');
    } finally {
      if (origSuperAdminPw !== undefined) process.env.SUPER_ADMIN_PASSWORD = origSuperAdminPw;
    }
  } finally {
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
