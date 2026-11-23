# Mehrli Qo‘llar — To‘liq Repozitoriy Auditi (pre-yandex-style)

**Sana:** 2026-11-23  
**Tag / Baza holati:** Git tag `pre-yandex-style` (`main` branchi o‘zgartirilmadi; barcha ishlar `feature/yandex-style` branchida).  
**Ma’lumotlar bazasi zaxira nusxalari:**
- `data/backups/pre-yandex-style/database.sqlite` (512 KB — 18 foydalanuvchi, 5 ish, 3 ariza, 1 shartnoma, 2 sharh, 4 chat xabari, 7 bildirishnoma, 1 yuklama)
- `data/backups/pre-yandex-style/mehrli_qollar.db` (276 KB — 14 foydalanuvchi, 3 ish, 10 xizmat e’loni)

---

## 1. Platformalar va Ishga Tushirish Muhiti

| Platforma | Joylashuvi | Holati |
|---|---|---|
| **Web Frontend** | `src/` (`React 19.2.7`, `Vite 6.2.0`, `Tailwind CSS 4.3.0`, `React Router 7.14.0`) | Faol asosiy interfeys (`npm run build` → `dist/`) |
| **Asosiy Backend Runtime** | `server.ts` + `server/` (`Express 4.21.2`, `tsx 4.21.0`, `Node 22` o‘rnatilgan `node:sqlite`) | Port `3000` da API (`/api/*`) + Vite middleware / `dist/` xizmat qiladi |
| **Android (Capacitor 8)** | `capacitor.config.ts` (`uz.mexrliqollar.app`) + `android/` (`Gradle`, Java shell, `AndroidManifest.xml`) | Faol mobil o‘ram (`npm run build:apk`, `./run.sh apk`) |
| **iOS (Capacitor 8)** | `ios/` (`App/Info.plist`, `Podfile`) | Mavjud, Mac/Xcode talab qiladi (`./run.sh ios` sync) |
| **Yordamchi Scaffold (`api/`)** | `api/` (`NestJS 11` + `Prisma 6` + PostgreSQL sxemasi) | Asosiy `server.ts` runtime tomonidan ishlatilmaydi (ixtiyoriy tashqi API scaffold) |
| **Boshqa papkalar** | `functions/`, `dataconnect/`, `firebase.json`, `firestore.rules` | Eski Firebase konfiguratsiya qoldiqlari (hozirgi asosiy runtime SQLite + Express ishlatadi) |

**Paket menejeri va buyruqlar:** `npm` (`package.json`):
- Dev: `npm run dev` (`tsx server.ts`, port `3000`)
- Type-check / Lint: `npm run lint` (`tsc --noEmit`)
- Web Build: `npm run build` (`vite build`)
- Production Start: `npm start` (`NODE_ENV=production tsx server.ts`)
- Android Sync / APK: `npm run build:apk`, `npm run apk:debug`
- iOS Sync: `npm run build:ios` (Mac/Xcode kerak)

---

## 2. Mavjud Marshrutlar (Routes), Ekranlar va API Endpointlar

### Frontend Marshrutlar (`src/App.tsx`)
- **Ommaviy / Kirish:** `/` (`LandingPage` webda / `HomeMobile` mobilda), `/auth` (`AuthPage` / `AuthMobile`), `/login`, `/super-admin-login`, `/403`
- **Ishchi / Buyurtmachi umumiy:** `/jobs`, `/workers`, `/worker/:userId`, `/profile/:userId`, `/directory`, `/courses`, `/qulay-ish`, `/qulay-ish/job/:jobId`, `/saved-jobs`, `/my-profile`, `/chat`, `/notifications`, `/verification`, `/contracts/:contractId`, `/rate/:applicationId`
- **Ishchi sahifalari:** `/worker/dashboard`, `/my-work`, `/worker/nearby-jobs`, `/worker/contracts`, `/worker/service-posts`, `/worker/create-service`, `/worker/edit-service/:postId`
- **Ish beruvchi sahifalari:** `/employer/dashboard`, `/employer/jobs`, `/employer/contracts`, `/employer/create-contract`, `/employer/jobs/:jobId`, `/employer/create-job`, `/employer/worker-services`, `/employer/nearby-workers`
- **Admin / Super Admin sahifalari:** `/admin/*` (`Dashboard`, `UsersManagement`, `JobsManagement`, `Contracts`, `Disputes`, `SystemLogs`, `SystemSettings`) va `/super-admin/*` (`Dashboard` + Live Map, `UsersManagement`, `JobsManagement`, `VerificationManagement`, `Applications`, `Disputes`, `ContractsPage`, `LogsPage`, `SettingsPage`, `AdminUsers`, `Analytics`, `System`)

### Backend API Endpointlar (`server.ts`, ~95 ta route)
- **Tizim & Statistika:** `GET /api/health`, `GET /api/gate`, `GET /api/stats/counts`
- **Auth & PIN:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/auth/session`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/change-password`, `POST /api/auth/pin/*`, `GET /api/auth/super-admin/status`, `POST /api/auth/super-admin/setup`, `POST /api/auth/super-admin/login`, `GET /api/auth/providers`, `GET /api/auth/nonce`, `POST /api/auth/telegram/start`, `GET /api/auth/telegram/callback`, `POST /api/auth/telegram`, `POST /api/auth/delete-account`
- **Foydalanuvchilar & Geo:** `GET/PATCH /api/users/*`, `PUT/DELETE /api/users/:id/location`, `GET /api/employer/workers`, `GET /api/employer/workers/nearby`, `POST /api/employer/invite-worker`, `GET /api/worker/recommended-jobs`, `GET /api/employer/recommended-workers`
- **E’lonlar, Arizalar, Shartnomalar:** `/api/jobs/*`, `/api/service-posts/*`, `/api/applications/*`, `/api/contracts/*`, `/api/reviews`, `/api/saved-jobs/*`, `/api/disputes/*`
- **KYC & Yuklamalar:** `/api/verification-requests/*`, `POST /api/uploads`, `GET /api/uploads/private/:userId/:filename` (magic-byte tekshiruvi + owner/admin RBAC bilan)
- **Xabarlar, Bildirishnomalar & Admin:** `/api/notifications/*`, `/api/chat-messages/*`, `/api/activity-logs`, `/api/system-logs`, `/api/settings/global`, `/api/admin/users/*`, `/api/admin/export/users`, `/api/admin/subscription/*`, `GET /api/super-admin/live-map-data`, `/api/ai/*`

---

## 3. Baza Modellari (`server/db.ts` — SQLite `node:sqlite`)

Hozirgi jadvallar (17 ta):
`users`, `jobs`, `service_posts`, `applications`, `contracts`, `reviews`, `saved_jobs`, `notifications`, `chat_messages`, `disputes`, `verification_requests`, `payments`, `activity_logs`, `system_logs`, `uploads`, `kv_settings`, `auth_nonces`.

**Kamchiliklar (Yandex Go oqimiga nisbatan):**
1. Qat’iy buyurtma holat mashinasi (`ish_buyurtmasi`), ketma-ket takliflar navbati va atomik qabul qilish (`buyurtma_takliflari`) yo‘q.
2. Ishchi onlayn holati va faollik geozonasi (`ishchi_holati`) alohida indekslanmagan.
3. `sos_hodisalari` va `ishonchli_shaxslar` modellari mavjud emas.
4. Super Admin tomonidan boshqariladigan `tarif_stavkalari` (xizmat × davomiylik + tarix), `matching_sozlamalari` (vaznlar, radius, taymer, kengayish qadami), `tashkilot_obunalari` (reja, holat, tugash sanasi) va aniq koordinata ko‘rishni ham qayd etuvchi `admin_audit_jurnali` yetishmaydi.

---

## 4. Mavjud Asosiy Tizimlar Auditi

- **Telegram OIDC (`server/telegramAuth.ts`):** `RS256` JWKS imzo tekshiruvi, `PKCE S256`, bir martalik `state`/`nonce`, `client_secret_post` va `Basic` fallback ishlaydi. Biroq `AuthPage.tsx` hozir parol + PIN + registratsiya shakllari bilan murakkablashtirilgan.
- **KYC (`VerificationPage.tsx` + `VerificationManagement.tsx`):** ID rasm + jonli selfie xususiy yuklamaga (`/api/uploads/private/...`) tushadi va Super Admin tekshiradi. To‘liq saqlanishi va birinchi sozlash oqimiga ulanishi kerak.
- **Shartnomalar (`ContractPage.tsx`) & Reyting (`/api/reviews`):** Ikki tomonlama imzo va 1–5 yulduzli baho bazada bor; buyurtma jarayonidan oldingi qat’iy darvoza sifatida Yandex Go faol ish bottom sheet’iga ulanadi.
- **Xarita (`Leaflet 1.9.4` + OpenStreetMap):** `InteractiveLeafletMap.tsx` va `SuperAdminLiveMap.tsx` ishlaydi. **Xarita provayderi qarori:** Mavjud kod `Leaflet 1.9.4 + OSM` ga qurilgan, API kaliti va pullik kvota talab qilmaydi, O‘zbekiston (jumladan Samarqand va barcha viloyatlar) bo‘yicha ko‘cha/manzil qamrovi yaxshi, yengil keshlanadigan `256px` tile yuklaydi va arzon Android telefonlarda ham tez ishlaydi (Yandex Maps esa pullik kalit va tashqi SDK yukini talab qiladi). Shu sabab **Leaflet + OSM** saqlanadi va Yandex Go UX (to‘liq ekran xarita, 200–300m privatlik jitteri, jonli harakat, pin tanlash) bilan moslashtiriladi.
- **Geo-qidiruv & Baza qarori:** Asosiy runtime `node:sqlite` (`data/database.sqlite`). Geo-qidiruv uchun `ishchi_holati` jadvaliga **kvantlangan koordinata/grid indekslari (`lat_bucket`, `lng_bucket`, `is_online`, `kyc_verified`, `active_order_id`)** qo‘shiladi: SQLite da bounding-box + bucket indeksi 5,000+ ishchini millisekundlarda filtrlab, keyin aniq Haversine + vaznli scoring qo‘llaydi. Shu tufayli tashqi PostGIS/Redis serveriga ko‘chish shart emas va mavjud real SQLite ma’lumotlari yo‘qotilmasdan ishlaydi.
- **Real vaqt & Push:** Hozir `DashboardLayout` da `8000ms` polling bor; haqiqiy **Server-Sent Events (SSE)** kanali (`/api/realtime/stream`) + polling zaxira qo‘shiladi. Mobil/web push uchun token ro‘yxatga olish (`/api/push/register`) va voqea dispatcher (`yangi_sorov`, `qabul_qilindi`, `yetib_keldi`, `yakunlandi`) quriladi (FCM/APNs kalitlari berilmagan muhitda ichki real-vaqt + Notification API/queue orqali ishlaydi va FCM server kaliti berilganda to‘g‘ridan-to‘g‘ri uzatishga tayyor).
- **i18n (`src/locales/uz.json`, `ru.json`, `en.json`):** `i18next` ulangan (`uz` standart). Barcha yangi ekran va admin bo‘limlari 100% kalit orqali beriladi.
- **AI yordamchi (`ChatAssistant.tsx`, `aiAssistantService.ts`):** Mahalliy xavfsiz yordamchi mavjud — yon menyudagi "Yordam" bo‘limiga ulanadi.

---

## 5. Qaror Jadvali (SAQLA / MOSLASHTIR / QAYTA YOZ / O‘CHIR)

| QISM | HOZIRGI HOLAT | QAROR | SABAB |
|---|---|---|---|
| `server/telegramAuth.ts`, `VerificationPage.tsx`, `VerificationManagement.tsx` | Telegram OIDC + ID/Selfie KYC ishlaydi | **SAQLA / MOSLASHTIR** | Asosiy xavfsizlik va KYC mexanizmi buzilmasligi shart; birinchi sozlash oqimiga ulanadi |
| `ContractPage.tsx` va `/api/contracts`, `/api/reviews` | Shartnoma imzolash va reyting ishlaydi | **MOSLASHTIR** | Faol buyurtmada `yetib_keldi → (shartnoma imzo) → jarayonda` bosqichiga ulanadi |
| `server/db.ts` va SQLite jadvallar | 17 jadval (`users`, `contracts`, `verification_requests` va b.) | **MOSLASHTIR (Migration)** | Mavjud ma’lumot saqlanadi; orqaga qaytariladigan migration bilan yangi jadvallar qo‘shiladi |
| `server/matching.ts` | Oddiy bir martalik ball hisoblash | **QAYTA YOZ** | Ketma-ket taklif, taymer, radius kengayishi, vaznli scoring va atomik qabul kerak |
| Real-vaqt & bildirishnomalar | Faqat `8s` polling (`DashboardLayout`) | **QAYTA YOZ (Qo‘sh)** | SSE jonli oqimi + polling zaxira + push token va voqea navbati |
| `InteractiveLeafletMap.tsx` | Oddiy markerli karta va tuman pill’lari | **MOSLASHTIR** | Yandex Go to‘liq ekran xarita, 200–300m privatlik, jonli kuzatuv, pin tanlash |
| `LandingPage.tsx`, `HomeMobile.tsx` | HH/marketplace reklama va kartochkalar | **O‘CHIR / ALMASHTIR** | Splash → Til → Login → To‘liq ekran Xarita Home oqimiga mos emas |
| `AuthPage.tsx`, `AuthMobile.tsx`, `PinSecurityCard.tsx` | Parol + PIN + ko‘p maydonli registratsiya | **QAYTA YOZ** | Faqat Telegram orqali kirish + telefon tasdiqlash; parol va PIN ekrani olib tashlanadi |
| `JobsPage.tsx`, `WorkersPage.tsx`, `QualayIshPage.tsx`, `SavedJobsPage.tsx`, `CoursesPage.tsx`, `PeopleDirectoryPage.tsx`, `CreateServicePost.tsx`, `MyServicePosts.tsx`, `CreateJob.tsx` | Eski e’lonlar/kurslar/katalog sahifalari | **O‘CHIR (marshrutlarni tozalash)** | Yandex Go’da e’lon taxtasi yo‘q: 3–4 teginishli xizmat/davomiylik buyurtmasi bor |
| `admin/*` va `super-admin/*` | Takrorlangan `/admin/*` va `/super-admin/*` sahifalari, ba’zilari statistik/qisman | **MOSLASHTIR + KENGAYTIR** | Mavjud ko‘rinish va brend ranglari (`#102833`, `#1a7c78`, `#c6a15b`) saqlanib, 13 bo‘limli web Super Admin sidebar-dashboardga birlashtiriladi; mobil build’da olib tashlanadi |
| `monetizationService.ts` | Komissiya (`recordCommission`) va job promote stublari | **O‘CHIR** | Prompt (2 va 14-bo‘lim): komissiya OLMA va qo‘shma; faqat tashkilot obunasi |
| `android/AndroidManifest.xml`, `ios/Info.plist` | Faqat asosiy joylashuv / kamera matnlari | **MOSLASHTIR** | 3 tilda ruxsat matnlari, foreground/background joylashuv va push sozlamalari |
| `ChatAssistant.tsx`, `i18n.ts` | Ishlaydigan yordamchi va UZ/RU/EN lug‘atlar | **SAQLA / MOSLASHTIR** | Drawer "Yordam" va barcha yangi kalitlarga ulanadi |
