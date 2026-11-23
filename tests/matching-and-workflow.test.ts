import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiApp } from '../server';
import { calculateMatchScore, getCoordsForUser, haversineKm } from '../server/matching';
import { getOrderStatusLabel, getOrderStatusMeta } from '../src/lib/orderStatus';

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

test('Pure matching engine scores profession, distance, availability, verification, and clamps [65, 98]', () => {
  const topWorker = {
    profession: 'Tikuvchilik',
    skills: ['Tikuvchilik', 'Moda'],
    availability: 'available',
    isVerified: true,
    rating: 4.9,
    completedJobs: 15,
    latitude: 39.6542,
    longitude: 66.9597,
    district: 'samarkand_city',
  };

  const exactJob = { category: 'Tikuvchilik' };
  const closeScore = calculateMatchScore(topWorker, exactJob, [39.6545, 66.9600]);
  assert.equal(closeScore, 98, 'Perfect close verified worker should reach max clamp 98');

  const farUnrelatedWorker = {
    profession: 'Oshpaz',
    skills: ['Oshpazlik'],
    availability: 'offline',
    isVerified: false,
    rating: 3.5,
    completedJobs: 0,
    latitude: 40.3547,
    longitude: 66.6433,
    district: 'qoshrabot',
  };
  const lowScore = calculateMatchScore(farUnrelatedWorker, exactJob, [39.4022, 67.2431]);
  assert.ok(lowScore >= 65 && lowScore < closeScore, 'Mismatched distant worker must score significantly lower');

  const emptyProfWorker = {
    profession: '',
    skills: [''],
    availability: 'available',
    isVerified: false,
    rating: 0,
    completedJobs: 0,
    latitude: null,
    longitude: null,
    district: 'urgut',
  };
  const emptyProfScore = calculateMatchScore(emptyProfWorker, exactJob, [39.4022, 67.2431]);
  assert.ok(emptyProfScore < closeScore, 'Empty profession/skills must not falsely match job category');

  const coords = getCoordsForUser({ latitude: null, longitude: null, district: 'urgut' });
  assert.ok(Math.abs(coords[0] - 39.4022) < 0.01);
  assert.ok(haversineKm(39.6542, 66.9597, 39.6542, 66.9597) === 0);
});

test('Order status labels and badges map Uzbek, Russian, and English states cleanly', () => {
  assert.equal(getOrderStatusLabel('offer_sent', 'uz'), 'Taklif yuborildi');
  assert.equal(getOrderStatusLabel('on_the_way', 'uz'), 'Yo‘lda');
  assert.equal(getOrderStatusLabel('started', 'uz'), 'Ish boshlandi');
  assert.equal(getOrderStatusLabel('completed', 'uz'), 'Tugallandi');
  assert.equal(getOrderStatusLabel('accepted', 'ru'), 'Принято');
  assert.equal(getOrderStatusLabel('disputed', 'en'), 'Disputed');
  assert.ok(getOrderStatusMeta('on_the_way').colorClass.includes('text-'));
});

test('End-to-end Matching -> Invite -> Work Lifecycle -> Mutual Rating -> Superadmin Live Map flow', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mq-workflow-test-'));
  const dbPath = join(tempDir, 'workflow.db');
  const srv = await startTestServer(dbPath);

  const prevPass = process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_PASSWORD;

  try {
    const reg = async (identifier: string, fullName: string, role: 'worker' | 'employer') => {
      const r = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ identifier, password: 'Password123!', fullName, role }),
      });
      assert.equal(r.status, 201);
      return (await r.json()) as { accessToken: string; user: { id: string; fullName: string } };
    };

    const worker = await reg('worker.flow@test.uz', 'Dilfuza Tikuvchi', 'worker');
    const employer = await reg('employer.flow@test.uz', 'Samarkand Atelier', 'employer');

    // Update worker profession & coordinates
    const patchW = await fetch(`${srv.baseUrl}/users/${worker.user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        profession: 'Tikuvchilik',
        skills: ['Tikuvchilik'],
        availability: 'available',
        district: 'samarkand_city',
        latitude: 39.6545,
        longitude: 66.96,
      }),
    });
    assert.equal(patchW.status, 200);

    // 1. Employer creates fast job
    const jobRes = await fetch(`${srv.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employer.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        title: 'Tezkor tikuvchilik buyurtmasi',
        category: 'Tikuvchilik',
        district: 'samarkand_city',
        price: 250000,
        status: 'open',
      }),
    });
    assert.equal(jobRes.status, 201);
    const createdJob = (await jobRes.json()) as { id: string };

    // 2. Worker discovers nearby jobs & smart recommendations
    const nearbyJobsRes = await fetch(
      `${srv.baseUrl}/jobs/nearby?lat=39.6542&lng=66.9597&radius_km=30`,
      { headers: { Authorization: `Bearer ${worker.accessToken}` } },
    );
    assert.equal(nearbyJobsRes.status, 200);
    const nearbyJobsBody = (await nearbyJobsRes.json()) as {
      data: Array<{ id: string; matchScore: number; distanceLabel: string }>;
    };
    const foundJob = nearbyJobsBody.data.find((j) => j.id === createdJob.id);
    assert.ok(foundJob, 'Newly created job should appear in nearby jobs');
    assert.ok(foundJob.matchScore >= 65 && foundJob.matchScore <= 98);

    const recJobsRes = await fetch(`${srv.baseUrl}/worker/recommended-jobs`, {
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });
    assert.equal(recJobsRes.status, 200);

    // 3. Employer discovers nearby workers & invites Dilfuza
    const nearbyWorkersRes = await fetch(
      `${srv.baseUrl}/employer/workers/nearby?lat=39.6542&lng=66.9597&radius_km=30`,
      { headers: { Authorization: `Bearer ${employer.accessToken}` } },
    );
    assert.equal(nearbyWorkersRes.status, 200);
    const nearbyWorkersBody = (await nearbyWorkersRes.json()) as {
      data: Array<{ uid: string; matchScore: number }>;
    };
    assert.ok(nearbyWorkersBody.data.some((w) => w.uid === worker.user.id));

    const inviteRes = await fetch(`${srv.baseUrl}/employer/invite-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employer.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        jobId: createdJob.id,
        message: 'Bugun soat 14:00 ga kela olasizmi?',
      }),
    });
    assert.equal(inviteRes.status, 201);
    const inviteBody = (await inviteRes.json()) as {
      application: { id: string; status: string };
    };
    assert.equal(inviteBody.application.status, 'offer_sent');
    const appId = inviteBody.application.id;

    // 4. Worker accepts direct invitation -> on_the_way -> started -> complete
    for (const nextStatus of ['accepted', 'on_the_way', 'started'] as const) {
      const stepRes = await fetch(`${srv.baseUrl}/applications/${appId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker.accessToken}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      assert.equal(stepRes.status, 200, `Worker should transition order to ${nextStatus}`);
      const updated = (await stepRes.json()) as { status: string };
      assert.equal(updated.status, nextStatus);
    }

    const completeRes = await fetch(`${srv.baseUrl}/applications/${appId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    assert.equal(completeRes.status, 200, 'Worker must be able to mark work completed');
    const completedApp = (await completeRes.json()) as { status: string };
    assert.equal(completedApp.status, 'completed');

    // Verify automated system messages exist in chat between employer and worker
    const chatRes = await fetch(
      `${srv.baseUrl}/chat-messages?userA=${employer.user.id}&userB=${worker.user.id}`,
      { headers: { Authorization: `Bearer ${worker.accessToken}` } },
    );
    assert.equal(chatRes.status, 200);
    const messages = (await chatRes.json()) as Array<{ content: string }>;
    assert.ok(messages.length >= 4, 'Invite + lifecycle transitions should create automatic chat messages');

    // 5. Mutual Rating: Employer rates Worker WITHOUT passing revieweeId; Worker rates Employer WITHOUT revieweeId
    const empReviewRes = await fetch(`${srv.baseUrl}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employer.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ applicationId: appId, rating: 5, comment: 'Zo‘r usta!' }),
    });
    assert.equal(empReviewRes.status, 201);
    const empReview = (await empReviewRes.json()) as { revieweeId: string };
    assert.equal(empReview.revieweeId, worker.user.id);

    // Duplicate review by same user for same application must be rejected (409)
    const dupReviewRes = await fetch(`${srv.baseUrl}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employer.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ applicationId: appId, rating: 4 }),
    });
    assert.equal(dupReviewRes.status, 409);

    const workerReviewRes = await fetch(`${srv.baseUrl}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ applicationId: appId, rating: 4, comment: 'Yaxshi ish beruvchi' }),
    });
    assert.equal(workerReviewRes.status, 201);
    const workerReview = (await workerReviewRes.json()) as { revieweeId: string };
    assert.equal(workerReview.revieweeId, employer.user.id);

    const updatedAppRes = await fetch(`${srv.baseUrl}/applications/${appId}`, {
      headers: { Authorization: `Bearer ${employer.accessToken}` },
    });
    const updatedApp = (await updatedAppRes.json()) as {
      reviewed: boolean;
      employerReviewed: boolean;
      workerReviewed: boolean;
    };
    assert.equal(updatedApp.reviewed, true);
    assert.equal(updatedApp.employerReviewed, true);
    assert.equal(updatedApp.workerReviewed, true);

    // 6. Super Admin live map data
    const setupRes = await fetch(`${srv.baseUrl}/auth/super-admin/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ login: 'admin@samarkand.uz', password: 'SuperAdminPassword1!' }),
    });
    assert.equal(setupRes.status, 201);
    const sa = (await setupRes.json()) as { accessToken: string };

    const liveMapRes = await fetch(`${srv.baseUrl}/super-admin/live-map-data`, {
      headers: { Authorization: `Bearer ${sa.accessToken}` },
    });
    assert.equal(liveMapRes.status, 200);
    const liveMapData = (await liveMapRes.json()) as {
      workers: unknown[];
      employers: unknown[];
      activeJobs: unknown[];
      disputes: unknown[];
    };
    assert.ok(liveMapData.workers.length >= 1);
    assert.ok(liveMapData.employers.length >= 1);
    assert.ok(liveMapData.activeJobs.length >= 1);
  } finally {
    if (prevPass !== undefined) process.env.SUPER_ADMIN_PASSWORD = prevPass;
    await srv.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
