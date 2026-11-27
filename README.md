# Mehrli Qo‘llar

Live demo: https://mehrli-qo-llar.ai.studio

**Mehrli Qo‘llar** is a safe, map-first digital labor marketplace connecting KYC-verified women with households and organizations across Uzbekistan. It replaces informal street hiring with instant fullscreen-map dispatch, privacy-protected pre-accept matching, direct order fulfillment, and live safety controls.

---

## Problem & Solution

- **Problem:** Every dawn, women from low-income families wait on the street hoping for a single day of work—with no guaranteed job, no fair pay, and no safety. Existing Telegram groups and classifieds have no identity verification or accountability, while agencies are slow and expensive.
- **Solution:** Mehrli Qo‘llar turns hiring into a 3–4 tap **Yandex Go–style map experience** across six home- and hospitality-service specialties: simple `+998` phone number & password sign-in with persistent device sessions, admin-reviewed KYC verification before workers can go online, spatial geo-matching close to home (plus optional Super Admin manual dispatch), non-expiring job offers until accepted, and one-tap SOS safety alerts.

---

## How It Works

1. **Onboard in seconds (`uz` / `ru` / `en`):** Choose your language, register or sign in with your `+998` phone number and password (your device remembers the session automatically, and you can log into any other device with the same phone number and password), pick your role (`worker`, `employer`, or `organization`), and grant GPS/notification permissions.
2. **Verify identity (KYC):** Workers upload their ID document photo and a live selfie (`src/pages/VerificationPage.tsx`). Unverified workers are blocked from going online (`403 KYC_REQUIRED`) until approved in the Super Admin Verification Center.
3. **3–4 tap map dispatch, self-service matching & manual routing:** Households/organizations tap or pick a district on the fullscreen OpenStreetMap, select from 6 services and 3 duration tariffs, and place an order. The server automatically expands the search radius (`5 → 10 → 15 km`) and sends **non-expiring**, penalty-free offers (`offerTimeoutSec = 0` by default) to top-ranked verified online workers—offers stay open until accepted, rejected, or cancelled. Orders without an immediate online match stay open (`qidirilmoqda`), and Super Admins can also manually route an offer or directly assign any open order to a specific worker.
4. **Live tracking & mutual rating:** Upon atomic acceptance, both parties see exact coordinates, live en-route location, and call/chat, moving directly from acceptance to work completion (`qabul_qilindi` → `yolda` → `yetib_keldi` → `jarayonda` → `yakunlandi`) without a digital contract signing step. Completing the job wipes temporary live GPS coordinates and opens mutual 5-star ratings.

---

## Key Features

- **Map-First Home & Bottom Sheet (`src/pages/YandexHomePage.tsx`):** Fullscreen OpenStreetMap + Leaflet canvas (`react-leaflet`) with adaptive floating/bottom sheet on mobile and desktop, district selector fallback when GPS is unavailable, and pinned primary CTA.
- **6 Core Service Specialties (`src/constants/yandexServices.ts`):** Childcare (`childcare`), House Cleaning (`house_cleaning`), Hotel Cleaning (`hotel_cleaning`), Postpartum Care (`postpartum_care`), Elder Care (`elder_care`), and Other Home Services (`other`).
- **Pre-Accept Privacy & Spatial Indexing (`server/privacyAndCoords.ts`, `server/matching.ts`):** Workers shown on pre-accept employer maps have coordinates shifted ~250m with zero PII (`fullName`/`phoneNumber` stripped). Spatial coordinate quantization handles 5,200+ online workers in milliseconds, and `live_order_locations` are deleted immediately upon order completion.
- **Live Matching, Non-Expiring Offers & Atomic Concurrency (`server/orderStateMachine.ts`, `server/realtime.ts`):** Real-time Server-Sent Events (`/api/realtime/stream`), atomic single-winner offer acceptance (`200` vs `409`), penalty-free offer rejection, non-expiring offers by default (configurable in Super Admin Matching Settings), and direct lifecycle transitions (`qidirilmoqda` → `taklif_yuborildi` → `qabul_qilindi` → `yolda` → `yetib_keldi` → `jarayonda` → `yakunlandi`) with no mandatory digital contract gate.
- **Safety, SOS & Trusted Contacts (`src/pages/drawer/`):** One-tap `SOS` button during active orders notifies the Super Admin Command Center and registered trusted contacts (`/trusted-contacts`), alongside order history (`/orders-history`), cash/card-soon payment info (`/payment-methods`), worker earnings (`/worker/earnings`), and B2B subscription management (`/organization/subscription`).
- **Phone + Password Auth & Photo-Only KYC:** Unified `+998` phone number + bcrypt-hashed password authentication (`src/pages/Login.tsx`, `src/pages/OnboardingFlow.tsx`) with persistent device sessions across reloads and multi-device login, plus private ID + live selfie uploads (`10 MB` cap, magic-byte validated).
- **Trilingual Localization (`i18next`):** Full Uzbek (`uz`, default), Russian (`ru`), and English (`en`) translations across mobile, web, and native Android/iOS permission strings.
- **Web-Only 13-Section Super Admin Sidebar Dashboard:** Blocked on native Capacitor (`Capacitor.isNativePlatform()`), accessible in browser via `/super-admin-login` for live OpenStreetMap operations, **manual order dispatch** (send non-expiring offers or directly assign waiting orders to specific workers from the Dashboard and Orders drawer), **full user editing & permanent deletion** (edit profiles, worker service specializations, KYC/block status, and passwords, or permanently remove accounts from the site), KYC approvals, SOS dispatch, tariff matrix & matching weights, disputes, B2B organizations, analytics (`recharts`), and audited coordinate logs (`admin_audit_jurnali`).
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
| **Languages** | TypeScript (`122 .tsx`, `75 .ts` + `server.ts`), CSS (`1 .css`), Java (`3 .java` Android Capacitor shell) |
| **Frontend** | React 19, Vite 6, React Router 7, Tailwind CSS v4, `leaflet` / `react-leaflet`, `i18next` / `react-i18next`, Lucide React, Motion, Recharts, jsPDF (`jspdf`, `jspdf-autotable`), `date-fns` |
| **Backend (Primary Runtime)** | Node.js 22, Express 4 (`server.ts`, `server/yandexRoutes.ts`), built-in `node:sqlite` (`DatabaseSync` in `server/db.ts` + `server/migrations.ts`), SSE (`server/realtime.ts`), `node:crypto`, `bcryptjs` |
| **Mobile** | Capacitor 8 (`@capacitor/android`, `@capacitor/ios`, geolocation, haptics, network, preferences, splash-screen, status-bar) |
| **Optional Companion API (`api/`)** | Separate NestJS 11 + Prisma 6 + PostgreSQL scaffold (not required to run the primary `server.ts` runtime) |

---

## Key Technical Details

### Architecture
- **Unified Runtime (`server.ts`):** Express serves `/api/*` REST & SSE endpoints and mounts Vite middleware in development (or serves built `dist/` assets in production) on port `3000`.
- **Persistence (`server/db.ts` + `server/migrations.ts`):** Node.js 22 built-in SQLite (`node:sqlite` `DatabaseSync`, WAL mode) with schema migrations, spatial geo-bucket indexes (`ishchi_holati`), order lifecycle (`ish_buyurtmasi`), non-expiring & admin-dispatched offers (`buyurtma_takliflari`), temporary live GPS (`live_order_locations`), tariffs, matching settings (`offer_timeout_sec = 0` default), SOS incidents, trusted contacts, org subscriptions, and admin audit logs.
- **Fullscreen Map Shell & Drawer (`src/pages/YandexHomePage.tsx`, `src/components/YandexDrawer.tsx`, `src/mobile/shell/`):** Full-viewport map on `/` and streamlined `/auth` onboarding across both mobile and web, with dedicated Navigation Drawer routes and a Web-only Super Admin sidebar portal.

### Security Controls
- **Authentication:** Unified `+998` phone number and `bcryptjs`-hashed password authentication (minimum 8 characters) with HS256 JWT sessions stored in `HttpOnly` cookies (`mq_session`) and persistent client device auth tokens. Blocking a user or resetting a password immediately invalidates prior sessions (`sessionValidAfter`). Legacy SMS/OTP endpoints return `410 Gone`. Auth and order-creation endpoints are rate-limited (`429`).
- **KYC & Private Upload Protection:** Uploads are capped at 10 MB, validated by binary magic bytes (JPEG, PNG, WebP, GIF, PDF), sanitized with `SAFE_FILENAME_REGEX`, bound to owner paths (`isOwnedPrivateUploadUrl`), and served only to the owning user or `super_admin`.
- **Authorization & Input Safety:** Explicit field allow-lists (`pickFields`) prevent mass assignment; strict server-side `super_admin` guards protect manual order dispatch (`POST /api/admin/orders/:id/dispatch`), user editing (`PATCH /api/admin/users/:id`), and permanent cascade deletion (`DELETE /api/admin/users/:id`), with safeguards preventing self-deletion or demotion/deletion of Super Admin accounts. All admin mutations and coordinate inspections are recorded in `admin_audit_jurnali`; pre-accept endpoints obfuscate worker coordinates (~250m) and strip coordinates from operational logs (`redactCoordinatesFromLogPayload`).
- **Secret Isolation:** `vite.config.ts` sets `envPrefix: 'PUBLIC_'` so server credentials in `.env` are never bundled into client JavaScript.

### Core Modules
| Path | Responsibility |
| --- | --- |
| `server.ts` | Express API routes, phone/password auth & cookies, RBAC, uploads, KYC, chats, permanent user deletion & admin APIs |
| `server/yandexRoutes.ts` | Map nearby workers, order creation & lifecycle, worker online toggle, offers, SOS, Super Admin manual dispatch & user editing |
| `server/matching.ts` | Spatial geo-bucket ranking, 5–10–15km expansion, non-expiring offers (`NO_EXPIRY_ISO`), manual admin dispatch, atomic SQLite acceptance |
| `server/orderStateMachine.ts` | Strict order lifecycle state transitions (`qabul_qilindi` → `yolda` → `yetib_keldi` → `jarayonda` → `yakunlandi`) |
| `server/privacyAndCoords.ts` | Pre-accept ~250m coordinate obfuscation & log coordinate redaction |
| `src/pages/YandexHomePage.tsx` | Fullscreen OpenStreetMap marketplace home with adaptive bottom sheet, non-expiring offer cards & live tracking |
| `src/pages/OnboardingFlow.tsx` | Streamlined onboarding (`uz`/`ru`/`en`, phone + password sign-in/registration, role, permissions) |
| `src/pages/super-admin/Dashboard.tsx` | Super Admin KPIs, live map & waiting-order manual dispatch queue (`Taklif yuborish` / `Biriktirish`) |
| `src/components/admin/AdminUserEditModal.tsx` | Super Admin user profile editor (service specializations, KYC, block, password) & permanent account deletion |
| `src/pages/SuperAdminLogin.tsx` | Web-only Super Admin login (`/super-admin-login`) leading to the 13-section Sidebar Dashboard |

See [`docs/CHANGES.md`](./docs/CHANGES.md) for the earlier refactor summary, deleted legacy files list, and spatial benchmark report.

---

## Testing

### Automated Tests (Executed & Verified)
| Command | Result | Scope Covered |
| --- | --- | --- |
| `npx --yes tsx --test tests/*.test.ts` | **15 passed, 0 failed** | Phone + password registration & multi-device login, auth/security PoCs, non-expiring offers (`offerTimeoutSec = 0`), Super Admin manual dispatch (`offer` & `direct`), Super Admin user editing & permanent cascade deletion, order state machine without contract gate, ~250m coordinate privacy, atomic concurrent offer accept (`200` + `409`), KYC `403`, IDOR/RBAC `403`, live GPS cleanup on finish, SOS + audit log, rate limit `429`, and **5,200-worker geo-search benchmark (`p50 ~4–5ms`)** |
| `npm run lint` (`tsc --noEmit`) | **Passed (0 errors)** | Full TypeScript type check |
| `npm run build` (`vite build`) | **Passed** | Production frontend bundle compilation |

### Browser Verification
- **Headless Chromium (`1440×900` & `390×844`):** Verified fullscreen map, Uzbek default locale, phone + password login & registration, Super Admin Dashboard manual order dispatch queue, Workers/Employers edit modal (with service specialization toggles) & permanent deletion flow, Matching Settings (`0 = unlimited`), and worker incoming non-expiring offer UI (`Qabul qilinguncha faol` + `Admin yo‘naltirdi`) with `0` console errors and `0` horizontal overflow.

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
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_PHONE` — Web-only Super Admin credentials (`/super-admin-login`)
- `SQLITE_DB_PATH` — optional path to SQLite file (defaults to `data/mehrli_qollar.db`)
- `CORS_ORIGIN` / `PUBLIC_API_URL` — optional origin and public API URL configuration
- *(Optional)* `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`, `TELEGRAM_BOT_USERNAME` — optional Telegram OIDC configuration if enabled

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

