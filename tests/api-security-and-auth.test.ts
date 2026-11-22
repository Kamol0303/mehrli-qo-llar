import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiApp } from '../server';
import { setTelegramJwksForTest } from '../server/telegramAuth';

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

    // PoC 3: Private upload magic-byte validation, multipart parsing, access control & path traversal
    const badUploadRes = await fetch(`${srv.baseUrl}/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html',
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: '<script>alert(1)</script>',
    });
    assert.equal(badUploadRes.status, 400, 'Non-image/non-PDF uploads (like HTML/XSS) must be rejected');

    // Minimal valid 1x1 PNG bytes
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f80f00000101000518d84e0000000049454e44ae426082',
      'hex',
    );
    const idForm = new FormData();
    idForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'passport.png');
    idForm.append('kind', 'verification_id');
    const uploadRes = await fetch(`${srv.baseUrl}/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${alice.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: idForm,
    });
    assert.equal(uploadRes.status, 201);
    const uploaded = (await uploadRes.json()) as { url: string; filename: string; mimeType: string };
    assert.equal(uploaded.mimeType, 'image/png');
    assert.match(uploaded.filename, /\.png$/);

    // Unauthenticated read -> 401
    const unauthFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`);
    assert.equal(unauthFile.status, 401, 'Private upload must require auth');

    // Cross-user read (Eve reading Alice's document) -> 403
    const eveFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`, {
      headers: { Authorization: `Bearer ${eve.accessToken}` },
    });
    assert.equal(eveFile.status, 403, 'Another user must not read private upload');

    // Owner read (Alice reading her own document) -> 200 with exact PNG bytes & Content-Type
    const aliceFile = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${uploaded.url}`, {
      headers: { Authorization: `Bearer ${alice.accessToken}` },
    });
    assert.equal(aliceFile.status, 200);
    assert.equal(aliceFile.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await aliceFile.arrayBuffer()), pngBytes);

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

    // PoC 5: Deprecated SMS OTP & unauthenticated password reset return 410 Gone
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

    // PoC 7: Super Admin first-run setup locks after single claim + end-to-end verification review
    const origSuperAdminPw = process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SUPER_ADMIN_PASSWORD;
    try {
      const status1 = (await (await fetch(`${srv.baseUrl}/auth/super-admin/status`)).json()) as { needsSetup: boolean };
      assert.equal(status1.needsSetup, true);

      const setup1 = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ login: 'boss@mexrliqollar.uz', password: 'SuperSecretAdminPassword1!' }),
      });
      assert.equal(setup1.status, 201);
      const superAdmin = (await setup1.json()) as { accessToken: string };

      const setup2 = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ login: 'attacker@evil.uz', password: 'AttackerPassword1!' }),
      });
      assert.equal(setup2.status, 409, 'Second super-admin setup claim must be blocked');

      // Alice uploads selfie & submits verification request with passport data
      const selfieForm = new FormData();
      selfieForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'selfie.png');
      selfieForm.append('kind', 'verification_selfie');
      const selfieRes = await fetch(`${srv.baseUrl}/uploads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${alice.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: selfieForm,
      });
      assert.equal(selfieRes.status, 201);
      const selfieUploaded = (await selfieRes.json()) as { url: string };

      const submitVer = await fetch(`${srv.baseUrl}/verification-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${alice.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          idPhotoUrl: uploaded.url,
          documentUrl: uploaded.url,
          selfieUrl: selfieUploaded.url,
          documentType: 'passport',
          passportData: { series: 'AA', number: '1234567', pinfl: '12345678901234', fullName: 'Alice Test' },
        }),
      });
      assert.equal(submitVer.status, 201);
      const verReq = (await submitVer.json()) as { id: string; passportData?: { series: string } };
      assert.equal(verReq.passportData?.series, 'AA');

      // Super Admin lists pending verification requests & fetches Alice's uploaded PNG images
      const listPending = await fetch(`${srv.baseUrl}/verification-requests?status=pending`, {
        headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
      });
      assert.equal(listPending.status, 200);
      const rows = (await listPending.json()) as Array<{ id: string; idPhotoUrl: string; selfieUrl: string; passportData?: { pinfl: string } }>;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].passportData?.pinfl, '12345678901234');

      const adminFetchId = await fetch(`http://127.0.0.1:${new URL(srv.baseUrl).port}${rows[0].idPhotoUrl}`, {
        headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
      });
      assert.equal(adminFetchId.status, 200);
      assert.equal(adminFetchId.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await adminFetchId.arrayBuffer()), pngBytes);

      // Super Admin approves using { action: 'approve' }
      const approveRes = await fetch(`${srv.baseUrl}/verification-requests/${verReq.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdmin.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ action: 'approve', adminNotes: 'Hammasi to‘g‘ri' }),
      });
      assert.equal(approveRes.status, 200);
      const approved = (await approveRes.json()) as { status: string };
      assert.equal(approved.status, 'verified');

      // Pending filter should now return 0 items; verified filter returns 1
      const pendingAfter = (await (
        await fetch(`${srv.baseUrl}/verification-requests?status=pending`, {
          headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
        })
      ).json()) as unknown[];
      assert.equal(pendingAfter.length, 0);
    } finally {
      if (origSuperAdminPw !== undefined) process.env.SUPER_ADMIN_PASSWORD = origSuperAdminPw;
    }
  } finally {
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Super Admin env login succeeds even when a regular user already registered with SUPER_ADMIN_EMAIL', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-sa-collision-'));
  const dbPath = join(tempDir, 'sa.db');
  const srv = await startTestServer(dbPath);

  const prevEmail = process.env.SUPER_ADMIN_EMAIL;
  const prevPhone = process.env.SUPER_ADMIN_PHONE;
  const prevPass = process.env.SUPER_ADMIN_PASSWORD;

  process.env.SUPER_ADMIN_EMAIL = 'owner@example.uz';
  process.env.SUPER_ADMIN_PHONE = '+998991234567';
  process.env.SUPER_ADMIN_PASSWORD = 'OwnerSuperPassword1!';

  try {
    // Owner also registers a regular worker account using the same email
    const reg = await fetch(`${srv.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        identifier: 'owner@example.uz',
        password: 'WorkerPassword1!',
        firstName: 'Owner',
        role: 'worker',
      }),
    });
    assert.equal(reg.status, 201);

    // Super Admin login by phone must succeed (200) without crashing on UNIQUE(email)
    const saLogin = await fetch(`${srv.baseUrl}/auth/super-admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        login: '+998991234567',
        password: 'OwnerSuperPassword1!',
      }),
    });
    assert.equal(saLogin.status, 200);
    const body = (await saLogin.json()) as { accessToken: string; user: { role: string } };
    assert.ok(body.accessToken);
    assert.equal(body.user.role, 'super_admin');
  } finally {
    if (prevEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
    else process.env.SUPER_ADMIN_EMAIL = prevEmail;
    if (prevPhone === undefined) delete process.env.SUPER_ADMIN_PHONE;
    else process.env.SUPER_ADMIN_PHONE = prevPhone;
    if (prevPass === undefined) delete process.env.SUPER_ADMIN_PASSWORD;
    else process.env.SUPER_ADMIN_PASSWORD = prevPass;
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Passwordless Telegram OIDC (RS256 + single-use nonce) & unified +998 phone linking', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-tg-test-'));
  const dbPath = join(tempDir, 'tg.db');
  const srv = await startTestServer(dbPath);

  const prevTgClientId = process.env.TELEGRAM_CLIENT_ID;
  const prevTgClientSecret = process.env.TELEGRAM_CLIENT_SECRET;
  process.env.TELEGRAM_CLIENT_ID = '9988776655';
  process.env.TELEGRAM_CLIENT_SECRET = 'test_secret_value_not_real';

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubJwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'tg-key-1', alg: 'RS256', use: 'sig' };
  setTelegramJwksForTest([pubJwk]);

  const signTestIdToken = (claims: Record<string, unknown>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'tg-key-1' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const input = `${header}.${payload}`;
    const sig = cryptoSign('RSA-SHA256', Buffer.from(input, 'utf8'), privateKey).toString('base64url');
    return `${input}.${sig}`;
  };

  try {
    // 1. Check providers discovery (Telegram enabled, no SMS provider exposed)
    const provRes = await fetch(`${srv.baseUrl}/auth/providers`);
    assert.equal(provRes.status, 200);
    const prov = (await provRes.json()) as { telegram: { enabled: boolean; clientId: string }; sms?: unknown };
    assert.equal(prov.telegram.enabled, true);
    assert.equal(prov.telegram.clientId, '9988776655');
    assert.equal(prov.sms, undefined);

    // 1b. Trusted *.ai.studio origin is preserved as redirect_uri; untrusted origins are ignored
    const startCustom = await fetch(`${srv.baseUrl}/auth/telegram/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://mehrli-qo-llar.ai.studio',
      },
      body: JSON.stringify({}),
    });
    assert.equal(startCustom.status, 200);
    const startCustomBody = (await startCustom.json()) as { redirectUri: string };
    assert.equal(startCustomBody.redirectUri, 'https://mehrli-qo-llar.ai.studio/api/auth/telegram/callback');

    const startEvil = await fetch(`${srv.baseUrl}/auth/telegram/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://evil.attacker.example',
      },
      body: JSON.stringify({}),
    });
    assert.equal(startEvil.status, 200);
    const startEvilBody = (await startEvil.json()) as { redirectUri: string };
    assert.equal(startEvilBody.redirectUri.includes('evil.attacker.example'), false);

    // 2. Fetch single-use nonce from server
    const nonceRes = await fetch(`${srv.baseUrl}/auth/nonce`);
    assert.equal(nonceRes.status, 200);
    const { nonce } = (await nonceRes.json()) as { nonce: string };
    assert.ok(nonce && nonce.length >= 32);

    // 3. Sign valid Telegram OIDC id_token with phone_number +998901234567
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signTestIdToken({
      iss: 'https://oauth.telegram.org',
      aud: '9988776655',
      sub: 'tg_user_777001',
      name: 'Madina Saidova',
      preferred_username: 'madina_uz',
      phone_number: '+998901234567',
      nonce,
      iat: nowSec,
      exp: nowSec + 300,
    });

    // Register passwordlessly via Telegram with Ism, Familiya, and specialty
    const tgAuthRes = await fetch(`${srv.baseUrl}/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        id_token: idToken,
        nonce,
        firstName: 'Madina',
        lastName: 'Saidova',
        role: 'worker',
        profession: 'childcare',
      }),
    });
    assert.equal(tgAuthRes.status, 200);
    const tgBody = (await tgAuthRes.json()) as {
      ok: boolean;
      isNew: boolean;
      accessToken: string;
      user: { id: string; fullName: string; phoneNumber: string; role: string; profession: string };
    };
    assert.equal(tgBody.ok, true);
    assert.equal(tgBody.isNew, true);
    assert.equal(tgBody.user.fullName, 'Madina Saidova');
    assert.equal(tgBody.user.phoneNumber, '+998901234567');
    assert.equal(tgBody.user.role, 'worker');
    assert.equal(tgBody.user.profession, 'childcare');

    // 4. Replay attack with the same id_token + nonce MUST be rejected (401)
    const replayRes = await fetch(`${srv.baseUrl}/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id_token: idToken, nonce }),
    });
    assert.equal(replayRes.status, 401, 'Reused Telegram nonce must be rejected');

    // 5. Subsequent Telegram login with a fresh nonce returns the EXACT SAME account
    const nonceRes2 = await fetch(`${srv.baseUrl}/auth/nonce`);
    const { nonce: nonce2 } = (await nonceRes2.json()) as { nonce: string };
    const idToken2 = signTestIdToken({
      iss: 'https://oauth.telegram.org',
      aud: '9988776655',
      sub: 'tg_user_777001',
      name: 'Madina Saidova',
      phone_number: '+998901234567',
      nonce: nonce2,
      iat: nowSec,
      exp: nowSec + 300,
    });
    const tgLoginRes = await fetch(`${srv.baseUrl}/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id_token: idToken2, nonce: nonce2 }),
    });
    assert.equal(tgLoginRes.status, 200);
    const tgLoginBody = (await tgLoginRes.json()) as { isNew: boolean; user: { id: string } };
    assert.equal(tgLoginBody.isNew, false);
    assert.equal(tgLoginBody.user.id, tgBody.user.id);
  } finally {
    setTelegramJwksForTest(null);
    if (prevTgClientId === undefined) delete process.env.TELEGRAM_CLIENT_ID;
    else process.env.TELEGRAM_CLIENT_ID = prevTgClientId;
    if (prevTgClientSecret === undefined) delete process.env.TELEGRAM_CLIENT_SECRET;
    else process.env.TELEGRAM_CLIENT_SECRET = prevTgClientSecret;
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
