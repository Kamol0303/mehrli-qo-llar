# Mehrli Qo‘llar — Yandex Go–Style Map-First Refactor (`feature/yandex-style`)

## 1. Umumlashma va Git Zaxira Holati
- **Ishchi tarmoq (branch):** `feature/yandex-style`
- **Asl versiya tegi (`main`):** `pre-yandex-style` (SQLite ma’lumotlar bazasi nusxalari `data/backups/pre-yandex-style/` papkasida saqlangan)
- **Brend & Ranglar saqlangan:** Mehrli Qo‘llar nomi, logotipi (`/assets/brand/logo.png`), `#102833`, `#1a7c78`, `#c6a15b`, iliq oq fon (`#f8f5f0`), Telegram OIDC login, KYC (ID + live selfie), raqamli shartnomalar, o‘zaro reytinglar, UZ/RU/EN i18n, tashkilot yillik obuna modeli va mahalliy AI yordamchisi saqlab qolindi.

---

## 2. Backend va Real-Vaqt Arxitekturasi
- **`server/migrations.ts`**: 12 ta jadval (`ishchi_holati`, `ish_buyurtmasi`, `buyurtma_takliflari`, `sos_hodisalari`, `ishonchli_shaxslar`, `tarif_stavkalari`, `tarif_stavkalari_tarixi`, `matching_sozlamalari`, `tashkilot_obunalari`, `admin_audit_jurnali`, `push_tokens`, `live_order_locations`) va koordinata kvantizatsiyasi indekslari (`idx_ishchi_holati_geo`).
- **`server/orderStateMachine.ts`**: `qidirilmoqda` → `taklif_yuborildi` → `qabul_qilindi` → `yolda` → `yetib_keldi` → `jarayonda` → `yakunlandi` (`bekor_qilindi`, `muddati_otdi`) o‘tishlari va ishni boshlashdan oldin ikki tomonlama imzolangan shartnoma majburiyligi (`CONTRACT_REQUIRED`).
- **`server/privacyAndCoords.ts`**: Qabul qilinishidan oldin ishchi koordinatalarini ~250m deterministik buzib ko‘rsatish (`obfuscatePreAcceptCoords`) va loglardan aniq `lat`/`lng` maydonlarini olib tashlash (`redactCoordinatesFromLogPayload`).
- **`server/matching.ts`**: 5–10–15 km radius kengayishi, 15s taklif taymeri, jarimasiz rad etish (`penalty-free reject`), atomik SQLite qabul qilishi (`acceptOfferAtomic`, bir vaqtning o‘zida 2 ta so‘rovdan faqat bittasi `200`, ikkinchisi `409`), va ish tugashi bilan `live_order_locations` yozuvini o‘chirish.
- **`server/realtime.ts` va `server/yandexRoutes.ts`**: SSE oqimi (`/api/realtime/stream`), xavfsiz yaqin ishchilar xaritasi (`/api/map/nearby-workers`), buyurtma yaratish tezligi cheklovchisi (`429`), SOS signali va ishonchli shaxs xabarnomasi (`/api/sos`), hamda faqat `super_admin` uchun Web boshqaruv APIlari (`/api/admin/*`) — har bir jonli xarita ko‘rishi `admin_audit_jurnali` ga yoziladi (`viewedExactCoords: true`).

---

## 3. Frontend: Xarita-Birinchi UX, Drawer va Web-Only Super Admin
- **Asosiy ekran (`/` — `src/pages/YandexHomePage.tsx` + `src/components/map/YandexGoMap.tsx`):**
  - 100% ekran bo‘ylab **OpenStreetMap + Leaflet** xaritasi (GPS bo‘lmasa tuman tanlash / pin sudrash).
  - **Ish beruvchi oqimi (3–4 bosish):** Xizmat tanlash (6 ta) → Davomiylik va tavsiya etilgan stavka (`soatlik`, `yarim_kun`, `toliq_kun`) → Naqd / Karta (tez orada) → `Ishchi topish` tugmasi mobil va desktopda doim ko‘rinib turadigan yopishqoq panelda.
  - **Ishchi rejimi:** KYC tekshirilmagan ishchilar `Onlayn` bo‘la olmaydi (`403 KYC_REQUIRED`), tasdiqlangan ishchilar esa bir tugma bilan `Onlayn/Oflayn`, radius (`5/10/15 km`), xizmatlar, 15 soniyali taklif qabul/rad kartasi va ish bosqichlarini boshqaradi.
  - **Tezkor xavfsizlik:** Faol buyurtma vaqtida yuqorida `SOS` va `Ulashish` tugmalari chiqadi.
- **Yon Menyu (`src/components/YandexDrawer.tsx`) va 6 ta sahifa:**
  - `/orders-history` (`OrdersHistoryPage.tsx`)
  - `/trusted-contacts` (`TrustedContactsPage.tsx`)
  - `/safety` (`SafetyPage.tsx`)
  - `/payment-methods` (`PaymentMethodsPage.tsx`)
  - `/worker/earnings` (`WorkerEarningsPage.tsx`)
  - `/organization/subscription` (`OrgSubscriptionPage.tsx`)
- **Onboarding (`src/pages/OnboardingFlow.tsx`):** Til tanlash (`uz` standart bo‘lib o‘rnatildi, `ru`, `en` ixtiyoriy) → Telegram OIDC kirish → Rol tanlash (`Ishchi` / `Ish beruvchi` / `Tashkilot`) → Ism va `+998` telefon → GPS/Bildirishnoma ruxsatlari → Rolga qarab Xarita yoki KYC ekraniga yo‘naltirish.
- **Web-Only Super Admin (`src/pages/super-admin/*`, `src/components/Sidebar.tsx`, `src/components/RoleProtectedRoute.tsx`):**
  - Mahalliy mobil ilovada (`Capacitor.isNativePlatform()`) `/super-admin*` marshrutlari va UI qat’iyan bloklangan.
  - Web brauzerda `super_admin` roli uchun tarjima qilingan 13 ta bo‘lim: Dashboard & Jonli Xarita, Buyurtmalar, Ishchilar, Ish beruvchilar & Tashkilotlar, KYC Verifikatsiya markazi, SOS hodisalari, Tarif stavkalari, Moslashtirish sozlamalari, Shartnomalar va Nizolar, Tashkilot obunalari, Analitika, Audit jurnallari, Tizim sozlamalari.

---

## 4. O‘chirilgan Eskirgan Fayllar (17 ta) va Sabablari
Xarita-birinchi Yandex Go–uslubidagi oqim bilan almashtirilgan va endi hech qayerdan import qilinmaydigan quyidagi eskirgan fayllar olib tashlandi:
1. `src/pages/LandingPage.tsx` — alohida marketing bosh sahifasi `/` o‘rniga xarita-birinchi `YandexHomePage` ishlatiladi.
2. `src/pages/AuthPage.tsx` — bosqichma-bosqich `OnboardingFlow.tsx` bilan almashtirildi.
3. `src/pages/JobsPage.tsx` — e’lonlar ro‘yxati o‘rniga avtomatik matching va xarita buyurtmalari.
4. `src/pages/WorkersPage.tsx` — katalog o‘rniga xaritada anonim yaqin ishchilar (`privacyObfuscated`).
5. `src/pages/QualayIshPage.tsx` — eski “Qulay Ish” katalog ko‘rinishi.
6. `src/pages/QualayIshJobDetailsPage.tsx` — eski katalog tafsilotlari sahifasi.
7. `src/pages/SavedJobsPage.tsx` — tez buyurtma modelida saqlangan e’lonlar kerak emas.
8. `src/pages/CoursesPage.tsx` — asosiy xizmat oqimidan tashqari ortiqcha ekran sifatida olib tashlandi.
9. `src/pages/PeopleDirectoryPage.tsx` — umumiy ro‘yxat o‘rniga faqat buyurtma orqali tanishuv.
10. `src/pages/employer/CreateJob.tsx` — xarita ostidagi 3–4 bosishlik panel bilan almashtirildi.
11. `src/pages/worker/CreateServicePost.tsx` — ishchi holati paneli (`ishchi_holati`) bilan almashtirildi.
12. `src/pages/worker/MyServicePosts.tsx` — ishchi xarita kaliti bilan almashtirildi.
13. `src/components/PinSecurityCard.tsx` — bank-style PIN o‘rniga parolsiz Telegram OIDC asosiy kirish sifatida qoldirildi.
14. `src/components/auth/PinPadScreen.tsx` — kirishda bloklovchi PIN ekran olib tashlandi (`App.tsx`).
15. `src/mobile/screens/HomeMobile.tsx` — mobil `/` ham `YandexHomePage` ga o‘tkazildi.
16. `src/mobile/screens/AuthMobile.tsx` — mobil `/auth` ham `OnboardingFlow` ga o‘tkazildi.
17. `src/mobile/screens/SavedJobsMobile.tsx` — eski mobil saqlangan e’lonlar ekrani.

---

## 5. Xarita Provayderi Qarori (OpenStreetMap + Leaflet vs Yandex Maps)
- **Tanlangan yechim:** OpenStreetMap + Leaflet (`leaflet` + `react-leaflet`).
- **Sababi:** Tashqi Yandex Maps API kalitisiz barqaror ishlaydi, Samarqand va O‘zbekiston tumanlari ko‘chalarini aniq ko‘rsatadi, pin sudrash va maxsus SVG markerlar (ishchi/buyurtma/SOS) bilan to‘liq nazorat beradi hamda litsenziya/tarif cheklovlarisiz Web + Capacitor WebView da ishlaydi. Keyinchalik tijoriy Yandex Maps JavaScript API kaliti qo‘shilganda map adapter komponenti (`src/components/map/InteractiveLeafletMap.tsx`) almashtirilishi mumkin.

---

## 6. Mobil Ruxsatnomalar (Android & iOS)
- `android/app/src/main/AndroidManifest.xml`: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` (faqat faol buyurtma vaqti va ishchi roziligi izohi bilan), `POST_NOTIFICATIONS`.
- `android/app/src/main/res/{values,values-uz,values-ru,values-en}/strings.xml`: UZ/RU/EN lokalizatsiya qilingan ilova nomi va ruxsat matnlari.
- `ios/App/App/Info.plist` va `ios/App/App/{uz.lproj,ru.lproj,en.lproj}/InfoPlist.strings`: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes` (`location`).

---

## 7. Tekshirilgan Natijalar va “Tekshirilmadi” Chegaralari

| Tekshiruv | Holati | Natija / Izoh |
| --- | --- | --- |
| `npx --yes tsx --test tests/*.test.ts` | **O‘tdi** | **13 ta testdan 13 tasi o‘tdi (0 xato)**: auth/xavfsizlik, Telegram OIDC, state machine, 250m maxfiylik/log tozalash, atomik concurrent accept (`200` + `409`), KYC `403`, IDOR `403`, RBAC `403`, jonli GPS o‘chirish, SOS + audit log, rate limit `429`, radius tugashi (`muddati_otdi`). |
| 5,200+ onlayn ishchi spatial benchmark | **O‘tdi** | `5,200` onlayn ishchi bazada: `matched=322`, **`p50 = 5.01 ms`**, **`p95 = 57.24 ms`** (`150 ms` chegaradan ancha tez). |
| `npm run lint` (`tsc --noEmit`) | **O‘tdi** | 0 ta TypeScript xatosi. |
| `npm run build` (`vite build`) | **O‘tdi** | Production bundle muvaffaqiyatli yig‘ildi. |
| Headless Chromium UI audit (`playwright-cli`) | **O‘tdi** | Desktop (`1440×900`) va Mobile (`390×844`) da `/`, `/auth`, `/super-admin-login` va chap menyu tekshirildi: `0` konsol xatosi, `0` gorizontal overflow, asosiy CTA tugmasi mobil ekranda ko‘rinadi, boshlang‘ich til `uz`. |
| Android APK yig‘ish va real qurilmada GPS/push | **tekshirilmadi** | Android SDK / jismoniy qurilma ushbu konteynerda mavjud emas. |
| iOS Xcode kompilyatsiya va simulyator | **tekshirilmadi** | macOS va Xcode talab qilinadi. |
