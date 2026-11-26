# Mehrli Qo‘llar

Live demo: https://mehrli-qo-llar.ai.studio

**Mehrli Qo‘llar** is a safe, map-first digital labor marketplace connecting KYC-verified women with households and organizations across Uzbekistan. It replaces informal street hiring with instant fullscreen-map dispatch, privacy-protected pre-accept matching, signed digital contracts, and live safety controls.

---

## Problem & Solution

- **Problem:** Every dawn, women from low-income families wait on the street hoping for a single day of work—with no guaranteed job, no fair pay, and no safety. Existing Telegram groups and classifieds have no identity verification or contracts, while agencies are slow and expensive.
- **Solution:** Mehrli Qo‘llar turns hiring into a 3–4 tap **Yandex Go–style map experience** across six home- and hospitality-service specialties: one-tap passwordless Telegram OpenID Connect sign-in, admin-reviewed KYC verification before workers can go online, spatial geo-matching close to home, dual-party digital contracts, and one-tap SOS safety alerts.

---

## How It Works

1. **Onboard in seconds (`uz` / `ru` / `en`):** Choose your language, sign in via passwordless Telegram OIDC, pick your role (`worker`, `employer`, or `organization`), confirm your `+998` phone number, and grant GPS/notification permissions.
2. **Verify identity (KYC):** Workers upload their ID document photo and a live selfie (`src/pages/VerificationPage.tsx`). Unverified workers are blocked from going online (`403 KYC_REQUIRED`) until approved in the Super Admin Verification Center.
3. **3–4 tap map dispatch & instant matching:** Households/organizations tap or pick a district on the fullscreen OpenStreetMap, select from 6 services and 3 duration tariffs, and request a worker. The server expands the search radius (`5 → 10 → 15 km`) and sends 15-second penalty-free offers to top-ranked verified online workers.
4. **Live tracking, digital contract & mutual rating:** Upon atomic acceptance, both parties see exact coordinates, live en-route location, call/chat, and a mandatory dual-party digital contract before starting work (`jarayonda`). Completing the job wipes temporary live GPS coordinates and opens mutual 5-star ratings.

---

## Key Features

- **Map-First Home & Bottom Sheet (`src/pages/YandexHomePage.tsx`):** Fullscreen OpenStreetMap + Leaflet canvas (`react-leaflet`) with adaptive floating/bottom sheet on mobile and desktop, district selector fallback when GPS is unavailable, and pinned primary CTA.
- **6 Core Service Specialties (`src/constants/yandexServices.ts`):** Childcare (`childcare`), House Cleaning (`house_cleaning`), Hotel Cleaning (`hotel_cleaning`), Postpartum Care (`postpartum_care`), Elder Care (`elder_care`), and Other Home Services (`other`).
- **Pre-Accept Privacy & Spatial Indexing (`server/privacyAndCoords.ts`, `server/matching.ts`):** Workers shown on pre-accept employer maps have coordinates shifted ~250m with zero PII (`fullName`/`phoneNumber` stripped). Spatial coordinate quantization handles 5,200+ online workers in milliseconds, and `live_order_locations` are deleted immediately upon order completion.
- **Live Matching, State Machine & Atomic Concurrency (`server/orderStateMachine.ts`, `server/realtime.ts`):** Real-time Server-Sent Events (`/api/realtime/stream`), atomic single-winner offer acceptance (`200` vs `409`), penalty-free offer rejection, and strict lifecycle transitions (`qidirilmoqda` → `taklif_yuborildi` → `qabul_qilindi` → `yolda` → `yetib_keldi` → `jarayonda` → `yakunlandi`).
- **Safety, SOS & Trusted Contacts (`src/pages/drawer/`):** One-tap `SOS` button during active orders notifies the Super Admin Command Center and registered trusted contacts (`/trusted-contacts`), alongside order history (`/orders-history`), cash/card-soon payment info (`/payment-methods`), worker earnings (`/worker/earnings`), and B2B subscription management (`/organization/subscription`).
- **Passwordless Telegram OIDC & Photo-Only KYC:** Official Telegram OIDC (`RS256` JWKS + `PKCE S256` + single-use `state`/`nonce`), unified `+998` linking, and private ID + live selfie uploads (`10 MB` cap, magic-byte validated).
- **Trilingual Localization (`i18next`):** Full Uzbek (`uz`, default), Russian (`ru`), and English (`en`) translations across mobile, web, and native Android/iOS permission strings.
- **Web-Only 13-Section Super Admin Sidebar Dashboard:** Blocked on native Capacitor (`Capacitor.isNativePlatform()`), accessible in browser via `/super-admin-login` for live OpenStreetMap operations, order/worker/employer management, KYC approvals, SOS dispatch, tariff matrix & matching weights, contracts/disputes, B2B organizations, analytics (`recharts`), and audited coordinate logs (`admin_audit_jurnali`).
- **Android & iOS Capacitor 8 Wrapper:** Native project configuration (`uz.mexrliqollar.app`) with background-location consent for active orders, localized permission prompts, haptics, and status bar integration.
- **In-App AI Assistant:** Built-in role-aware local helper (`src/components/ChatAssistant.tsx`, `src/services/aiAssistantService.ts`) operating without exposing external API keys.

---

## Business Model

- **Workers & Households:** Free to join and use (`cash` settlement; digital card placeholder marked `coming soon`).
- **Organizations (B2B):** Hotels, restaurants, clinics, and offices pay an annual subscription (**15–20M UZS/year**, managed via `/organization/subscription` and `/super-admin/organizations`).
- **Market & Year 1 Projections *(projections — not measured historical revenue)*:**
  - Initial market (Samarkand region): ~80,000 unemployed people (~60,000 women); Year 1 adoption projection of 5–10% = **3,000–6,000 women**.
  - Year 1 B2B projection: **~270 organizations**, **~4.7B UZS** projected annual run rate, and **~$50,000** projected Year 1 profit.

---

## Tech Stack & Programming Languages

| Layer | Technologies Used |
| --- | --- |
| **Languages** | TypeScript (`121 .tsx`, `73 .ts` + `server.ts`), CSS (`1 .css`), Java (`3 .java` Android Capacitor shell) |
| **Frontend** | React 19, Vite 6, React Router 7, Tailwind CSS v4, `leaflet` / `react-leaflet`, `i18next` / `react-i18next`, Lucide React, Motion, Recharts, jsPDF (`jspdf`, `jspdf-autotable`), `date-fns` |
| **Backend (Primary Runtime)** | Node.js 22, Express 4 (`server.ts`, `server/yandexRoutes.ts`), built-in `node:sqlite` (`DatabaseSync` in `server/db.ts` + `server/migrations.ts`), SSE (`server/realtime.ts`), `node:crypto`, `bcryptjs` |
| **Mobile** | Capacitor 8 (`@capacitor/android`, `@capacitor/ios`, geolocation, haptics, network, preferences, splash-screen, status-bar) |
| **Optional Companion API (`api/`)** | Separate NestJS 11 + Prisma 6 + PostgreSQL scaffold (not required to run the primary `server.ts` runtime) |

---

## Key Technical Details

### Architecture
- **Unified Runtime (`server.ts`):** Express serves `/api/*` REST & SSE endpoints and mounts Vite middleware in development (or serves built `dist/` assets in production) on port `3000`.
- **Persistence (`server/db.ts` + `server/migrations.ts`):** Node.js 22 built-in SQLite (`node:sqlite` `DatabaseSync`, WAL mode) with spatial geo-bucket indexes (`ishchi_holati`), order lifecycle (`ish_buyurtmasi`), offers (`buyurtma_takliflari`), temporary live GPS (`live_order_locations`), tariffs, matching settings, SOS incidents, trusted contacts, org subscriptions, and admin audit logs.
- **Fullscreen Map Shell & Drawer (`src/pages/YandexHomePage.tsx`, `src/components/YandexDrawer.tsx`, `src/mobile/shell/`):** Full-viewport map on `/` and streamlined 5-step `/auth` onboarding across both mobile and web, with dedicated Navigation Drawer routes and a Web-only Super Admin sidebar portal.

### Security Controls
- **Authentication:** Telegram OIDC (`server/telegramAuth.ts`) verifies ID tokens against Telegram's JWKS (`RS256`) with `PKCE S256`, single-use `state`/`nonce`, and trusted-origin callback validation (`isTrustedOriginUrl`). Sessions use HS256 JWTs stored in `HttpOnly` cookies (`mq_session`). Legacy SMS/OTP endpoints return `410 Gone`. Auth and order-creation endpoints are rate-limited (`429`).
- **KYC & Private Upload Protection:** Uploads are capped at 10 MB, validated by binary magic bytes (JPEG, PNG, WebP, GIF, PDF), sanitized with `SAFE_FILENAME_REGEX`, bound to owner paths (`isOwnedPrivateUploadUrl`), and served only to the owning user or `super_admin`.
- **Authorization & Input Safety:** Explicit field allow-lists (`pickFields`) prevent mass assignment; role guards enforce RBAC (`worker`, `employer`, `admin`, `super_admin`); Super Admin coordinate inspections log `viewedExactCoords: true`; pre-accept endpoints obfuscate worker coordinates (~250m) and strip coordinates from operational logs (`redactCoordinatesFromLogPayload`).
- **Secret Isolation:** `vite.config.ts` sets `envPrefix: 'PUBLIC_'` so server credentials in `.env` are never bundled into client JavaScript.

### Core Modules
| Path | Responsibility |
| --- | --- |
| `server.ts` | Express API routes, auth cookies, RBAC, uploads, KYC, contracts, chats, admin APIs |
| `server/yandexRoutes.ts` | Map nearby workers, order creation & lifecycle, worker online toggle, offers, SOS, Web-only `/api/admin/*` |
| `server/matching.ts` | Spatial geo-bucket ranking, 5–10–15km expansion, 15s offer timer, atomic SQLite acceptance |
| `server/orderStateMachine.ts` | Strict lifecycle state transitions & signed-contract gate |
| `server/privacyAndCoords.ts` | Pre-accept ~250m coordinate obfuscation & log coordinate redaction |
| `src/pages/YandexHomePage.tsx` | Fullscreen OpenStreetMap marketplace home with adaptive bottom sheet & live tracking |
| `src/pages/OnboardingFlow.tsx` | 5-step onboarding (`uz`/`ru`/`en`, Telegram OIDC, role, phone, permissions) |
| `src/pages/SuperAdminLogin.tsx` | Web-only Super Admin login (`/super-admin-login`) leading to 13-section Sidebar Dashboard |

See [`docs/CHANGES.md`](./docs/CHANGES.md) for the full refactor summary, deleted legacy files list, and spatial benchmark report.

---

## Testing

### Automated Tests (Executed & Verified)
| Command | Result | Scope Covered |
| --- | --- | --- |
| `npx --yes tsx --test tests/*.test.ts` | **13 passed, 0 failed** | Auth/security PoCs, Telegram OIDC, matching engine, state machine, ~250m coordinate privacy, atomic concurrent offer accept (`200` + `409`), KYC `403`, IDOR/RBAC `403`, live GPS cleanup on finish, SOS + audit log, rate limit `429`, and **5,200-worker geo-search benchmark (`p50=5.01ms`, `p95=57.24ms`)** |
| `npm run lint` (`tsc --noEmit`) | **Passed (0 errors)** | Full TypeScript type check |
| `npm run build` (`vite build`) | **Passed** | Production frontend bundle compilation |

### Browser Verification
- **Headless Chromium (`1440×900` & `390×844`):** Verified fullscreen map (`/?autostart=1`), pinned primary CTA above the fold on mobile, Uzbek default locale, Navigation Drawer (`☰`), Onboarding (`/auth`), and Web-only Super Admin login (`/super-admin-login`) with `0` console errors and `0` horizontal overflow.

### Not Executed in This Environment (`tekshirilmadi`)
- **Native Android APK Gradle build (`npm run apk:debug`) & device GPS/push:** **tekshirilmadi** (requires local Android SDK / JDK and physical device).
- **iOS Xcode build (`ios/`):** **tekshirilmadi** (requires macOS + Xcode).

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
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_PHONE` — Web-only Super Admin credentials (`/super-admin-login`)
- `SQLITE_DB_PATH` — optional path to SQLite file (defaults to `data/mehrli_qollar.db`)

### 3. Run in Development Mode
Starts Express API + Vite frontend together on `http://localhost:3000` (Super Admin Web portal at `http://localhost:3000/super-admin-login`):
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
npx --yes tsx --test tests/*.test.ts
```

### 6. Android Build (Capacitor)
Sync the production web bundle into `android/` and build a debug APK:
```bash
npm run build:apk
npm run apk:debug
```
*(Or open the project in Android Studio with `npm run cap:open`.)*
