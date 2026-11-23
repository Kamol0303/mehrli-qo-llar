# Mehrli Qo‘llar — Yandex Go Arxitektura Rejasi (PLAN.md)

**Branch:** `feature/yandex-style` (asosiy `main` + `pre-yandex-style` tagi tegilmaydi).  
**Zaxira nusxa:** `data/backups/pre-yandex-style/database.sqlite` va `data/backups/pre-yandex-style/mehrli_qollar.db`.

---

## Fazalar Tartibi va Amalga Oshirish Rejasi

### Faza 1: Baza Migratsiyasi va Qat’iy Holat Mashinasi
- Orqaga qaytariladigan `up` / `down` SQL migratsiya tizimi (`schema_migrations` + versiya 1 → 2).
- Mavjud `users`, `verification_requests`, `contracts`, `reviews`, `payments` ma’lumotlarini saqlab qolgan holda yangi jadvallar yaratish:
  - `ishchi_holati` (online/offline, oxirgi lat/lng + `lat_bucket`/`lng_bucket` geoindeksi, oxirgi faollik, xizmatlar JSON, radius, aktiv buyurtma ID)
  - `ish_buyurtmasi` (egasi/ish beruvchi, xizmat turi, davomiylik `hourly`/`half_day`/`full_day`, to‘lov `cash`/`card_soon`, stavka, koordinatalar, manzil, holat, qabul qilgan ishchi, shartnoma ID, vaqtlar, bekor qilish sababi/kim, tarix JSON)
  - `buyurtma_takliflari` (buyurtma ID, ishchi ID, holat `kutilmoqda`/`qabul_qilindi`/`rad_etildi`/`muddati_otdi`/`bekor_qilindi`, ball, masofa km, ETA, radius qadami, tugash vaqti `expires_at`)
  - `sos_hodisalari` (foydalanuvchi, buyurtma, lat/lng, izoh, holat `yangi`/`korilmoqda`/`yopildi`, ishonchli shaxsga xabar holati, admin izohi)
  - `ishonchli_shaxslar` (egasi, ism, telefon, Telegram username/aloqa)
  - `tarif_stavkalari` (xizmat × davomiylik stavkalari + `tarif_stavkalari_tarixi`)
  - `matching_sozlamalari` (masofa/reyting/qabul/xizmat vaznlari, boshlang‘ich va maksimal radius, kengayish qadami, taymer soniyasi, jonli joylashuv TTL)
  - `tashkilot_obunalari` (tashkilot egasi, reja nomi, yillik summa, holat `active`/`pending`/`expired`, tugash sanasi)
  - `admin_audit_jurnali` (admin ID, harakat, nishon ID, tafsilot, aniq koordinata ko‘rilganligi)
  - `push_tokens` (foydalanuvchi ID, platforma `web`/`android`/`ios`, token)
- **Qat’iy Holat Mashinasi (`server/orderStateMachine.ts`):**
  - Buyurtma holatlari: `qidirilmoqda` → `taklif_yuborildi` → `qabul_qilindi` → `yolda` → `yetib_keldi` → (`shartnoma imzolangan bo‘lishi shart`) → `jarayonda` → `yakunlandi`.
  - `bekor_qilindi` faqat faol holatlardan (`kim` va `sabab` yoziladi).
  - `muddati_otdi` faqat `qidirilmoqda` yoki `taklif_yuborildi` dan.
  - Boshqa barcha noqonuniy o‘tishlar serverda `400` bilan rad etiladi.

### Faza 2: Ketma-ket Atomik Matching va Geoindeks
- `server/matching.ts` yangilanishi:
  - Kvantlangan geoindeks (`lat_bucket` ≈ 1km, `lng_bucket` ≈ 1km) orqali 5,000+ onlayn ishchi ichidan millisekundlarda nomzodlarni toraytirish.
  - Filtr: `is_online = 1`, `kyc_verified = 1`, `is_blocked = 0`, xizmat turi mos, faol band buyurtmasi yo‘q, `radius_km` ichida.
  - Vaznli saralash (Super Admin `matching_sozlamalari` dan): masofa/ETA, reyting, qabul ko‘rsatkichi (`acceptance_rate`), xizmat mosligi.
  - Ketma-ket taklif (`dispatchNextOffer`), taymer muddati tugashi (`expireTimedOutOffers`), avtomatik radius kengayishi (masalan 5 → 10 → 20 → 35 km) va tugashda `muddati_otdi`.
  - **Atomik Qabul Qilish:** SQLite `BEGIN IMMEDIATE` tranzaksiyasi + shartli `UPDATE` (`WHERE status IN ('qidirilmoqda','taklif_yuborildi') AND assigned_worker_id IS NULL`) hamda `ishchi_holati` (`WHERE active_order_id IS NULL`), bitta ishchiga bir vaqtda ikki buyurtma birikishini mutlaqo istisno qilish.

### Faza 3: Real-Vaqt Kanali (SSE + Polling Zaxira) va Push Infratuzilmasi
- `GET /api/realtime/stream`: JWT/cookie bilan autentifikatsiyalangan foydalanuvchi xonasi uchun SSE hodisa oqimi (`order_updated`, `offer_received`, `offer_expired`, `worker_location`, `sos_alert`, `chat_message`, `notification`).
- Polling zaxirasi (`4s`) agar SSE uzilsa avtomatik ishga tushadi.
- Push xizmati: `/api/push/register` + `dispatchPushEvent` (`new_offer`, `accepted`, `arrived`, `completed`).

### Faza 4: Xarita (Leaflet + OpenStreetMap, Privatlik va Jonli Kuzatuv)
- To‘liq ekranli interaktiv xarita (`YandexGoMap.tsx`):
  - Ish beruvchi xaritasida yaqin onlayn ishchilar (~200–300 m deterministik yumaloqlangan/siljitilgan koordinata bilan — buyurtma qabul qilinmaguncha aniq nuqta yashiriladi!).
  - GPS ruxsati berilmasa: xarita markazidagi pinni surish yoki manzil kiritish ishlaydi.
  - Buyurtma qabul qilingach: ishchining jonli joylashuvi, masofasi va ETA ko‘rinadi; ish tugashi/bekor qilinishi bilan jonli joylashuv o‘chiriladi (`DELETE`/null) va TTL bo‘yicha tozalanadi.

### Faza 5: Ilova Ekranlari (Kirishdan Chiqishgacha — Yandex Go Oqimi)
1. **Splash:** Brend logotipi, 1.2s; faol sessiya bo‘lsa rolga qarab to‘g‘ridan-to‘g‘ri Home (yoki KYC tekshiruv).
2. **Til tanlash:** UZ (standart) / RU / EN; keyinchalik Profildan o‘zgartiriladi.
3. **Login:** Bitta ekran, bitta katta **"Telegram orqali kirish"** tugmasi + `+998` telefon tasdiqlash (parolsiz, ortiqcha maydonlarsiz).
4. **Rol tanlash (birinchi marta):** "Ish beraman" / "Ish qidiraman".
5. **Birinchi sozlash:**
   - Ish beruvchi: Ism + Telegram/telefon tasdiqlash (+ tashkilot bo‘lsa hujjat).
   - Ishchi: KYC (ID + jonli selfie) → "Tekshirilmoqda" → tasdiqlangach Home (rad etilsa sababi va qayta topshirish).
6. **Ruxsatlar tushuntirishi:** Joylashuv va bildirishnoma ruxsatlari nega kerakligi; rad etilsa ham xaritadan pin / manzil kiritish ishlaydi.
7. **Home = To‘liq ekranli xarita:** Chap yuqorida menyu tugmasi (`☰`), o‘ngda "Mening joyim", pastda **Bottom Sheet**:
   - *Ish beruvchi*: 3–4 teginish (Xizmat katta ikonkalar → Davomiylik + Tavsiya stavka → To‘lov: Naqd / Karta "tez orada" → "Ishchi topish") → Qidiruv jarayoni (kengayayotgan radius xabari) → Faol buyurtma (Ishchi kartasi, ETA, qo‘ng‘iroq/chat, raqamli shartnoma imzolash, jonli kuzatuv, doimiy **SOS** va **Ulashish**) → Yakun (1–5 yulduz + ixtiyoriy izoh).
   - *Ishchi*: Katta **"Onlayn bo‘lish"** tugmasi (KYC tasdiqlanmagan bo‘lsa bloklangan holat ko‘rinadi) → Keluvchi **So‘rov kartasi** (xizmat, davomiylik, taxminiy masofa, stavka, ortga sanoq taymer; aniq manzil qabuldan keyin!) → Qabul/Rad et (jarimasiz) → Faol ish oqimi (`yolda` → `yetib_keldi` → raqamli shartnoma → `jarayonda` → `yakunlandi`), tashqi xaritada yo‘nalish tugmasi, doimiy **SOS** va **Ulashish**, istalgan payt xavfsizlik uchun bekor qilish → Yakun (ish beruvchini baholash).
8. **Yon Menyu (Drawer):**
   - Ish beruvchi: Profil, Ishlarim, To‘lov usullari, Ishonchli shaxslar, Xavfsizlik, Til, Yordam (AI yordamchi), Tashkilot obunasi, Chiqish (faol ish bo‘lsa ogohlantirish).
   - Ishchi: Profil, Daromad, Ishlar tarixi, Tasdiqlash holati, Xavfsizlik, Til, Yordam (AI yordamchi), Chiqish (faol ish bo‘lsa ogohlantirish).
   - **Mobil ilovada admin havolasi mutlaqo bo‘lmaydi.**

### Faza 6: Super Admin Web Sidebar-Dashboard (Faqat Web, 13 Bo‘lim)
- Mavjud `#102833` / `#1a7c78` / `#c6a15b` dizayni va `DashboardLayout`/`Sidebar` tuzilmasi saqlanadi.
- Capacitor mobil build’da (`Capacitor.isNativePlatform()` yoki mobil shell) admin marshrutlari yopiladi va menyuga chiqarilmaydi; asosiy himoya esa **serverda RBAC** bilan ta’minlanadi.
- 13 bo‘lim hammasi UZ / RU / EN tilida:
  1. Boshqaruv paneli (KPI + Jonli xarita)
  2. Buyurtmalar (filtr + takliflar tarixi + holat timeline + shartnoma + baholar)
  3. Ishchilar
  4. Ish beruvchilar
  5. KYC navbati
  6. Shartnomalar
  7. Nizolar
  8. SOS hodisalari
  9. Stavkalar (xizmat × davomiylik + tarix)
  10. Matching sozlamalari
  11. Tashkilotlar va obunalar
  12. Tahlil
  13. Audit jurnali (aniq koordinata ko‘rish ham qayd etiladi)

### Faza 7: Xavfsizlik, Maxfiylik va Mobil Native Konfiguratsiya
- `AndroidManifest.xml` va `Info.plist` + Android `strings.xml` (UZ/RU/EN) ruxsat matnlari.
- Aniq koordinatalarni loglarga yozmaslik, IDOR tekshiruvlari, begona buyurtma/joylashuvni bloklash, rate limitlar, telefon/Telegram tasdiqlash.

### Faza 8: Real Testlar va Benchmark
- Unit testlar (`server/orderStateMachine`, `server/matching`), E2E buyurtma hayotiy sikli (API + Headless Chromium), chekka holatlar (GPS rad etilgan, atrofda ishchi yo‘q, rad etish, taymer tugashi, bekor qilish, race condition, uzilish), xavfsizlik (IDOR, RBAC, koordinata maxfiyligi, rate limit), **5,000+ onlayn ishchi bilan geo-qidiruv tezligi benchmarki**, UZ/RU/EN ekran tekshiruvi.

### Faza 9: Tozalash, `docs/CHANGES.md` va `README.md`
- O‘lik/eski kod va marshrutlarni o‘chirib sababi bilan `docs/CHANGES.md` ga yozish.
- `README.md` ni yangilash (jonli havola eng tepada).
