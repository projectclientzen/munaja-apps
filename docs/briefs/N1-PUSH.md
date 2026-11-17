# Brief N1 (Sonnet): aktifkan pengingat (Web Push) end-to-end

Basis: main terbaru. Branch `claude/n1-push`. Aturan: `CLAUDE.md`. Owner hemat kuota: kerja langsung dan fokus.

## Konteks
Server sudah punya: scheduler + dispatcher notifikasi (`src/server/notifications/**`), sender Web Push VAPID (`src/server/push/**`), endpoint `/api/v1/me/push-subscriptions`, `/api/v1/me/notification-preferences`, `/api/v1/me/notifications`. Yang BELUM: service worker tidak punya handler `push` dan `notificationclick`; tidak ada UI yang meminta izin + `pushManager.subscribe`; kartu dashboard "Aktifkan pengingat" masih "Segera tersedia di Pengaturan" (`src/components/dashboard/setup-cards.tsx`).

## Keputusan owner (17 Nov 2026)
- Pesan tahajud, Subuh, Al-Kahfi: DUA varian per jenis, dipakai BERGANTIAN (deterministik per tanggal sesi, mis. hari genap A, ganjil B). Teks persis (judul. isi):
  - tahajud A: "Waktunya bangun" / "Jadwal ibadah malammu dimulai. Pelan-pelan saja, mulai dari yang bisa."
  - tahajud B: "Saatnya bermunajat" / "Sepertiga malam sudah tiba. Ambil wudhu, mulai dari dua rakaat."
  - fajr A: "Waktu Subuh masuk" / "Lanjutkan rangkaian Subuhmu kapan siap."
  - fajr B: "Subuh sudah tiba" / "Yuk salat Subuh, lalu lanjutkan amalan pagimu."
  - alkahfi A: "Malam Jumat" / "Waktunya membaca Al-Kahfi. Bisa dibaca kapan saja sampai Jumat sore."
  - alkahfi B: "Jumat berkah" / "Jangan lupa Al-Kahfi hari ini, bacanya bisa dicicil."
  Status: disetujui owner (bukan PROVISIONAL lagi). Simpan di `src/server/notifications/copy.ts` (ganti `DEFAULT_COPY` jadi varian), unit test pemilihan varian.
- Pengingat TIDUR (bedtime): belum ada bank pesan owner. Di production jangan dijadwalkan sama sekali dan sembunyikan toggle-nya di UI dengan catatan "Segera hadir", sampai bank tersedia. Bank DEMO tetap hanya di luar production.

## Tugas
1. `public/sw.js`: handler `push` (payload JSON {title, body, url, tag}; `showNotification` dengan ikon `/icons/icon-192.png`, badge, tag untuk dedupe) dan `notificationclick` (fokus tab yang ada atau buka `url`; hanya path relatif same-origin). Naikkan VERSION cache. Unit test SW yang ada diperluas.
2. Kunci publik VAPID ke klien: endpoint `GET /api/v1/push/public-key` (auth user, hanya public key, `no-store`) ATAU `NEXT_PUBLIC_VAPID_PUBLIC_KEY` saat build. Pilih endpoint (tidak perlu rebuild saat rotasi kunci). Bila VAPID belum dikonfigurasi: jawab NOT_AVAILABLE, UI menampilkan "Pengingat belum tersedia".
3. Komponen klien `EnableReminders`: cek dukungan (`serviceWorker`, `PushManager`, `Notification`), deteksi iOS non-standalone -> tampilkan "Pasang Munajaa di layar utama dulu, lalu aktifkan pengingat" + tautan panduan pasang; minta izin HANYA setelah tombol diketuk; `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})`; POST ke `/me/push-subscriptions`; status: aktif / ditolak (cara membuka izin di pengaturan HP) / tidak didukung. Pakai di kartu dashboard (ganti "Segera tersedia") dan di `/settings` bagian notifikasi. Tombol "Matikan pengingat" = unsubscribe + DELETE subscription.
4. Pastikan pengaturan notifikasi di `/settings` tersambung ke API di mode live (toggle per jenis: tahajud, Subuh, Al-Kahfi; bedtime disembunyikan di production). Mode mock tetap jalan (subscribe disimulasikan, badge Data demo).
5. Test: unit (pemilihan varian, SW push/click, komponen state), e2e mock (alur aktifkan dengan izin di-grant lewat Playwright `context.grantPermissions(['notifications'])` bila memungkinkan; minimal state "tidak didukung" dan "ditolak"), test DB/API bila menyentuh server. Copy tanpa em-dash.

## Kepemilikan
`public/sw.js`, `src/components/pwa/**`, `src/components/dashboard/setup-cards.tsx`, `src/components/settings/**` (bagian notifikasi), `src/components/notifications/**`, `src/server/notifications/**`, `src/server/push/**`, `src/server/api/routes.ts` (endpoint public key), `src/app/api/v1/push/**`, `src/data/**` (bagian push/notifikasi), `src/offline/sw-client.ts` bila perlu, test terkait, `docs/sessions/N1.md`, baris STATUS + entri SESSION_LOG milikmu. Jangan ubah migration lama (tambah baru bila perlu, mulai 20261119010000).

## Selesai
`pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm test:e2e --trace off && pnpm test:e2e:live --trace off && pnpm audit --prod` hijau. Laporan `docs/sessions/N1.md` + cara uji manual di HP (Android Chrome, iPhone PWA). Push ke `claude/n1-push`, kirim ringkasan ke orchestrator `session_01HkFB32yhrjHP63xkJdKYto`.
