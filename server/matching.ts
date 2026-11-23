import type { StoredUser } from './db';

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DISTRICT_COORDS: Record<string, [number, number]> = {
  samarkand_city: [39.6542, 66.9597],
  samarkand: [39.6542, 66.9597],
  urgut: [39.4022, 67.2431],
  jomboy: [39.7003, 67.0933],
  kattakurgan: [39.8989, 66.2561],
  pastdargom: [39.7133, 66.7439],
  bulungur: [39.7647, 67.2714],
  payariq: [39.9881, 66.8489],
  ishtixon: [39.9658, 66.4883],
  narpay: [39.8972, 65.9875],
  toyloq: [39.5878, 67.0856],
  qoshrabot: [40.3547, 66.6433],
  oqdaryo: [39.7892, 66.8208],
  nurobod: [39.6083, 65.8111],
  paxtachi: [40.0431, 65.6986],
};

export function getCoordsForUser(
  u: Pick<StoredUser, 'latitude' | 'longitude' | 'district'>,
): [number, number] {
  if (
    u.latitude != null &&
    u.longitude != null &&
    !Number.isNaN(u.latitude) &&
    !Number.isNaN(u.longitude)
  ) {
    return [u.latitude, u.longitude];
  }
  const distKey = (u.district || '').toLowerCase().replace(/[^a-z]/g, '');
  if (distKey) {
    for (const [k, v] of Object.entries(DISTRICT_COORDS)) {
      if (distKey.includes(k) || k.includes(distKey)) return v;
    }
  }
  return [39.6542, 66.9597];
}

export function calculateMatchScore(
  worker: Pick<
    StoredUser,
    'profession' | 'skills' | 'availability' | 'isVerified' | 'rating' | 'completedJobs' | 'latitude' | 'longitude' | 'district'
  >,
  job?: {
    category?: string | null;
    requirements?: string[];
    salary?: number | null;
    price?: number | null;
    employerId?: string;
  } | null,
  empCoords?: [number, number] | null,
): number {
  let score = 34;

  // 1. Profession / Skills match (up to 26 pts)
  const jobCat = (job?.category || '').trim().toLowerCase();
  if (jobCat) {
    const prof = (worker.profession || '').trim().toLowerCase();
    const hasProfMatch = Boolean(prof) && (prof.includes(jobCat) || jobCat.includes(prof));
    const hasSkillMatch = worker.skills.some((raw) => {
      const s = raw.trim().toLowerCase();
      return Boolean(s) && (s.includes(jobCat) || jobCat.includes(s));
    });
    if (hasProfMatch) {
      score += 26;
    } else if (hasSkillMatch) {
      score += 18;
    } else {
      score += 4;
    }
  } else {
    score += 12;
  }

  // 2. Smooth Distance match (up to 20 pts)
  const workerCoords = getCoordsForUser(worker);
  if (empCoords) {
    const dist = haversineKm(workerCoords[0], workerCoords[1], empCoords[0], empCoords[1]);
    score += Math.max(0, Math.min(20, Math.round(20 - dist * 0.6)));
  } else {
    score += 10;
  }

  // 3. Availability (up to 8 pts)
  if (worker.availability === 'available') score += 8;
  else if (worker.availability === 'busy') score += 3;

  // 4. Verification & Rating (up to 8 pts)
  if (worker.isVerified) score += 3;
  const ratingVal = Number(worker.rating || 0);
  if (ratingVal > 3.0) {
    score += Math.min(5, Math.max(1, Math.round((ratingVal - 3.0) * 2.5)));
  }

  // 5. Completed jobs experience (up to 4 pts)
  score += Math.min(4, Math.floor((worker.completedJobs || 0) / 3));

  return Math.min(98, Math.max(65, score));
}
