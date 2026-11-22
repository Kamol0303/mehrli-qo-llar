# Mehrli Qo‘llar

Live demo: https://mehrli-qo-llar.ai.studio

**Mehrli Qo‘llar** is a safe digital employment platform connecting identity-verified women with households and organizations across Uzbekistan. It replaces informal street hiring with verified profiles, hyperlocal search, and signed digital contracts.

---

## Problem & Solution

- **Problem:** Every dawn, women from low-income families wait on the street hoping for a single day of work—with no guaranteed job, no fair pay, and no safety. Children miss school, and poverty passes across generations. Existing Telegram groups and classifieds have no identity verification or contracts, while agencies are slow and expensive.
- **Solution:** Mehrli Qo‘llar builds a full chain of trust around five home- and hospitality-service specialties: one-tap passwordless Telegram sign-in (no password, no SMS), admin-reviewed KYC verification, proximity-based search close to home, and two-party digital contracts with ratings.

---

## How It Works

1. **Sign up with Telegram:** Workers and employers sign in with one tap via Telegram OpenID Connect (no password, no SMS).
2. **Verify identity (KYC):** Workers upload their ID document photo and a live selfie; a Super Admin reviews and approves the request in the Verification Center.
3. **Search by service & distance:** Households and organizations filter verified workers across 5 specialties, district, price, and proximity.
4. **Hire, contract & rate:** Employers contact workers via call or in-app chat, sign a digital service contract, and leave a verified star rating.

---

## Key Features

- **Passwordless Telegram OIDC Login:** Official Telegram OpenID Connect flow (`RS256` JWKS verification + `PKCE S256` + single-use `state`/`nonce`); unified `+998` phone linking; no passwords or SMS/OTP required.
- **Photo-Only KYC Verification & Super Admin Review:** Private upload of ID document + live selfie (`src/pages/VerificationPage.tsx`), reviewed in a dedicated Super Admin Verification Center (`src/pages/admin/VerificationManagement.tsx`) with Approve, Reject, and Request Re-upload actions.
- **5 Core Service Specialties:** Childcare (`childcare`), House Cleaning (`house_cleaning`), Hotel Cleaning (`hotel_cleaning`), Elder Care (`elder_care`), and Postpartum Care (`postpartum_care`).
- **Hyperlocal Search & Proximity Ranking:** All 18 cities and districts of Samarkand region mapped with coordinates (`src/constants/districts.ts`), Haversine distance calculation, GPS support, and nearest/farthest/price sorting.
- **Digital Service Contracts & Disputes:** Contract creation and dual-party signing workflow (`src/pages/ContractPage.tsx`, `src/pages/employer/CreateContract.tsx`), plus dispute filing and admin moderation (`src/pages/admin/Disputes.tsx`).
- **Profiles, Ratings, Chat, Courses & PDF Resume:** Verified badges, star ratings & reviews, in-app chat, free training courses (`src/pages/CoursesPage.tsx`), and PDF resume export (`jspdf`).
- **Trilingual Interface:** Full localization in Uzbek (`uz`), Russian (`ru`), and English (`en`) via `i18next`.
- **Android & iOS Mobile Wrapper:** Capacitor 8 mobile shell (`uz.mexrliqollar.app`) with dedicated mobile UI screens (`src/mobile/`), geolocation, haptics, network status, and status-bar plugins.
- **Super Admin Panel:** Role-protected management for KYC queue, users, jobs, applications, contracts, disputes, analytics (`recharts`), logs, and system settings.
- **In-App AI Assistant:** Built-in role-aware local helper (`src/components/ChatAssistant.tsx`, `src/services/aiAssistantService.ts`) operating client-side without hardcoded LLM keys.

---

## Business Model

- **Workers & Households:** Free to join and use.
- **Organizations (B2B):** Hotels, restaurants, clinics, and offices pay an annual subscription of **15–20M UZS/year** per organization.
- **Market & Year 1 Projections *(projections — not measured historical revenue)*:**
  - Initial market (Samarkand region): ~80,000 unemployed people (~60,000 women); Year 1 adoption projection of 5–10% = **3,000–6,000 women**.
  - Year 1 B2B projection: **~270 organizations**, **~4.7B UZS** projected annual run rate, and **~$50,000** projected Year 1 profit.

---

## Tech Stack & Programming Languages

| Layer | Technologies Used |
| --- | --- |
| **Languages** | TypeScript (`115 .tsx`, `61 .ts`), CSS (`1 .css`), Java (`3 .java` Android Capacitor shell) |
| **Frontend** | React 19, Vite 6, React Router 7, Tailwind CSS v4, `i18next` / `react-i18next`, Lucide React, Motion, Recharts, jsPDF (`jspdf`, `jspdf-autotable`), `date-fns` |
| **Backend (Primary Runtime)** | Node.js 22, Express 4 (`server.ts`), built-in `node:sqlite` (`DatabaseSync` in `server/db.ts`), `node:crypto`, `bcryptjs` |
| **Mobile** | Capacitor 8 (`@capacitor/android`, `@capacitor/ios`, geolocation, haptics, network, preferences, splash-screen, status-bar) |
| **Optional Companion API (`api/`)** | Separate NestJS 11 + Prisma 6 + PostgreSQL scaffold (not required to run the primary `server.ts` runtime) |

---

## Key Technical Details

### Architecture
- **Unified Runtime (`server.ts`):** Express serves `/api/*` REST endpoints and mounts Vite middleware in development (or serves built `dist/` assets in production) on port `3000`.
- **Persistence (`server/db.ts`):** Uses Node.js 22's built-in SQLite (`node:sqlite` `DatabaseSync`) with WAL mode for users, jobs, applications, service posts, verification requests, contracts, chats, reviews, disputes, notifications, private uploads, and single-use OIDC nonces.
- **Responsive + Native Mobile Shell (`src/mobile/`, `src/native/`):** Adapts between desktop dashboard and bottom-tab mobile UX with Capacitor lifecycle handling.

### Security Controls
- **Authentication:** Telegram OIDC (`server/telegramAuth.ts`) verifies ID tokens against Telegram's JWKS (`RS256`) with `PKCE S256`, single-use `state`/`nonce`, and trusted-origin callback validation (`isTrustedOriginUrl`). Sessions use HS256 JWTs stored in `HttpOnly` cookies (`mq_session`). Legacy SMS/OTP endpoints return `410 Gone`. Auth endpoints are rate-limited (25 requests / 15 min).
- **KYC & Private Upload Protection:** Uploads are capped at 10 MB, validated by binary magic bytes (JPEG, PNG, WebP, GIF, PDF), sanitized with `SAFE_FILENAME_REGEX`, bound to owner paths (`isOwnedPrivateUploadUrl`), and served only to the owning user or `super_admin`.
- **Authorization & Input Safety:** Explicit field allow-lists (`pickFields`) prevent mass assignment; role guards enforce RBAC (`worker`, `employer`, `admin`, `super_admin`); security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) are set on API responses.
- **Secret Isolation:** `vite.config.ts` sets `envPrefix: 'PUBLIC_'` so server credentials in `.env` are never bundled into client JavaScript.

### Core Modules
| Path | Responsibility |
| --- | --- |
| `server.ts` | Express API routes, auth cookies, RBAC, uploads, KYC, contracts, chats, admin APIs |
| `server/db.ts` | SQLite schema (`node:sqlite`), persistence helpers, phone/email normalization |
| `server/telegramAuth.ts` | Telegram OIDC URL builder, PKCE generator, token exchange, RS256 JWKS verification |
| `src/pages/VerificationPage.tsx` | Worker/employer photo-only KYC upload & status view |
| `src/pages/admin/VerificationManagement.tsx` | Super Admin Verification Center (inspect images, approve/reject/re-upload) |
| `src/constants/categories.ts` | 5 core service specialties and matching logic |
| `src/constants/districts.ts` | 18 Samarkand cities/districts centroids & Haversine proximity sorting |

---

## What Has Been Done

- Built and deployed the full-stack web platform (`https://mehrli-qo-llar.ai.studio`) with Express + SQLite backend and React + TypeScript frontend.
- Implemented passwordless Telegram OIDC login (`RS256` + `PKCE S256`) with custom-domain `redirect_uri` handling and removed legacy SMS/OTP flows.
- Built photo-only KYC verification (ID document + selfie upload) and the Super Admin Verification Center.
- Mapped all 18 Samarkand cities and districts with proximity sorting across 5 core specialties.
- Implemented digital contracts, chat, ratings/reviews, disputes, free courses, PDF resume generation, and Super Admin analytics.
- Localized the interface into 3 languages (`uz`, `ru`, `en`) with Uzbekistan national branding.
- Configured Capacitor 8 Android & iOS native project wrappers and mobile screens.
- Verified core auth, security, and KYC flows via automated tests and browser inspection.

---

## Testing

### Automated Tests (Executed & Verified)
| Command | Result | Scope Covered |
| --- | --- | --- |
| `npx tsx --test tests/api-security-and-auth.test.ts src/lib/statsCounts.spec.ts` | **6 passed, 0 failed** | Auth registration/login, duplicate `409`, cookie persistence & DB restart survival; security PoCs (mass assignment, chat IDOR, private upload authorization, path traversal, RBAC, deprecated OTP `410`, JSON `404`); photo-only KYC submission & Super Admin approval; Super Admin env login; Telegram OIDC `RS256` + single-use nonce + `+998` linking + trusted-origin validation; dashboard stats counts |
| `npm run lint` (`tsc --noEmit`) | **Passed (0 errors)** | Full TypeScript type check |
| `npm run build` (`vite build`) | **Passed** | Production frontend bundle compilation |

### Manual Verification
- **Manual (Headless Chromium, `1440×900`):** Verified `/verification` renders without manual passport text inputs, accepts ID + selfie uploads, enables submit, and transitions to pending review with 0 console errors.
- **Manual (Live HTTP check):** Verified `POST /api/auth/telegram/start` returns a valid `https://mehrli-qo-llar.ai.studio/api/auth/telegram/callback` redirect URI for trusted origins and ignores untrusted origins.

### Not Executed in This Environment
- **Optional `api/` NestJS/Prisma specs (`api/src/**/*.spec.ts`):** Requires separate dependency install (`npm run api:install`); not part of the primary `server.ts` runtime.
- **Native Android APK Gradle compilation (`npm run apk:debug`):** Requires local Android SDK and JDK; not executed in the web container.

---

## Team

| Name | Role |
| --- | --- |
| **Kamolbek Omonov** | CEO & Cybersecurity Lead |
| **Abdulboriy Sharobidinov** | CTO |
| **Asilbek Panjiyev** | UI/UX Designer |
| **Durdona Ostanova** | Sales |

*Three of the four founders are National AI Hackathon prize winners.*

---

## Roadmap

- Expand the Samarkand regional pilot with local government partners.
- Onboard B2B partners (hotels, restaurants, clinics, offices).
- Integrate local payment providers (**Click** and **Payme**).
- Publish the Android application on **Google Play**.
- Scale across all regions of Uzbekistan and into Central Asia.

---

## Getting Started

### Prerequisites
- **Node.js 22+** (required for built-in `node:sqlite`) and **npm 10+**
- *(Optional, for Android builds)* Android Studio, Android SDK, and JDK 17+

### 1. Clone & Install
```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

### 2. Configure Environment Variables
Copy the template and fill in your own values (`.env` is gitignored):
```bash
cp .env.example .env
```
Key variables used by `server.ts`:
- `JWT_SECRET` — secret key for signing session JWTs
- `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`, `TELEGRAM_BOT_USERNAME` — Telegram OIDC credentials from `@BotFather`
- `APP_URL` — public origin URL (e.g., `http://localhost:3000` or production domain)
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_PHONE` — initial Super Admin credentials
- `SQLITE_DB_PATH` — optional path to SQLite file (defaults to `./database.sqlite`)

### 3. Run in Development Mode
Starts Express API + Vite frontend together on `http://localhost:3000`:
```bash
npm run dev
```

### 4. Type Check, Build & Run Production Server
```bash
npm run lint
npm run build
npm start
```

### 5. Run Automated Tests
```bash
npx tsx --test tests/api-security-and-auth.test.ts src/lib/statsCounts.spec.ts
```

### 6. Android Build (Capacitor)
Sync the production web bundle into `android/` and build a debug APK:
```bash
npm run build:apk
npm run apk:debug
```
*(Or open the project in Android Studio with `npm run cap:open`.)*
