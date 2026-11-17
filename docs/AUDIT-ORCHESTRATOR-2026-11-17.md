# Audit keamanan pra-publish (orchestrator, 17 Nov 2026)

Pengganti audit Fable ke-2 (Fable tidak tersedia). Metode: baca kode di main, dipandu checklist skill `security-audit` (Cloudflare, mode panduan: CSRF, sesi, MFA, pemulihan akun, penautan akun, deploy). Read-only kecuali perbaikan di bawah. Tidak ada uji ke server live.

## Diperiksa dan aman
- Secret: tidak ada secret di repo; `.env.example` hanya kerangka; password DB di roles.sql lewat variabel psql.
- API: satu pipeline (Origin wajib untuk mutasi, cookie sesi, `no-store`); endpoint publik hanya login/activate/reset/set-password/complete-pending-login/me/logout; body divalidasi Zod + batas ukuran; akses DB user lewat role `authenticated` + `auth.uid()` (contoh `set_checklist` memfilter `user_id`), `asService` hanya dengan userId dari cookie.
- Cookie sesi: HttpOnly, SameSite=Lax, Secure dipaksa di production.
- Alur uang -> akses: webhook HMAC atas body mentah + `timingSafeEqual`, idempoten `unique_id`, tanpa tulisan DB bila tanda tangan salah; akses hanya dari GET order Scalev (paid/settled + varian 648177/MUNAJA-01 + email + HP); pengaman kedua di SQL `scalev_apply_order`; satu entitlement per order (unique); penautan ke akun lama hanya bila HP cocok (F4); approve manual admin sudah tidak ada.
- Admin: Origin, login, peran, MFA wajib, sesi 8 jam, izin per endpoint; tautan reset untuk akun admin hanya oleh super_admin; reset mandiri ditolak untuk akun admin (F6).
- Pemulihan akun: token sekali pakai 60 menit, set-password mencabut semua perangkat; ganti password lewat `password_change`.
- Cron internal: `CRON_SECRET` >= 32 karakter, banding `timingSafeEqual`.
- XSS/redirect: satu `dangerouslySetInnerHTML` (skrip tema statis), tidak ada redirect dari parameter URL.
- Dependensi: `pnpm audit --prod` bersih.

## Diperbaiki di audit ini
| # | Tingkat | Temuan | Perbaikan |
|---|---------|--------|-----------|
| A1 | Sedang | Header keamanan hanya bergantung pada konfigurasi proxy (konfigurasi Nginx server belum terverifikasi). | `next.config.ts`: nosniff, X-Frame-Options DENY, CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, Referrer-Policy, Permissions-Policy, HSTS untuk semua path. |
| A2 | Rendah | Contoh Nginx tidak memblokir `/api/internal/` (Caddy memblokir). Tetap dijaga CRON_SECRET. | `deploy/nginx-munaja.conf.example`: `location ^~ /api/internal/ { return 404; }`, timpa `X-Forwarded-Host`. |
| A3 | Bug | Contoh Caddy `geolocation=()` memblokir lokasi otomatis onboarding. | `geolocation=(self)`. |

## Rekomendasi konfigurasi (keputusan owner/Hermes)
- R1: `SCALEV_MIN_AMOUNT_IDR` belum diisi. Bila kode diskon 100% bocor, order Rp0 berstatus paid membuka akses. Isi batas bawah (mis. harga terendah promo) bila tidak ada promo gratis.
- R2: Verifikasi di server: header keamanan muncul, `/api/internal/cron` dari luar 404, IP palsu di `X-Forwarded-For` diabaikan (lihat prompt Hermes di laporan chat).

## Tidak diperiksa mendalam (sisa risiko)
- Isi tiap fungsi admin_content/admin_support/admin_aggregates dan notifications/push dibaca sekilas, belum baris per baris.
- Konfigurasi aktual server (Nginx, .env, role DB) di luar repo.

## Checklist 18 poin owner (17 Nov 2026)
| # | Poin | Status | Bukti |
|---|------|--------|-------|
| 1 | API key aman | Kode OK | SCALEV_API_KEY hanya dibaca server (`src/server/scalev/config.ts`), tidak pernah `NEXT_PUBLIC_`, tidak pernah di-log (client tidak mengirim header ke log) |
| 2 | env jangan public | Kode OK, server perlu cek | Hanya `.env.example` (placeholder) pernah di-commit; NEXT_PUBLIC hanya CS_WHATSAPP, DATA_MODE, ENABLE_DEV_ROUTES, ENABLE_SW, SCALEV_URL (bukan rahasia) |
| 3 | No hardcode secret | OK | Scan pola key/token di tree: kosong |
| 4 | Secret di riwayat Git | OK | `git log --all -p` hanya berisi `CHANGE_ME_*` |
| 5 | Debug mode off | Kode OK, server perlu cek | Dev routes mati di production; `API_DEBUG_ERRORS` hanya log server; butuh NODE_ENV=production |
| 6 | Error tidak bocor | OK | `toApiError`: pesan umum ke browser, SQLSTATE saja di log |
| 7 | Validasi input | OK | Zod di semua body + batas 64 KB; UUID param dicek |
| 8 | Sanitasi input | OK | React escape; `admin_text` membatasi panjang dan menolak teks Arab di field admin |
| 9 | SQL injection | OK | Semua nilai lewat parameter `$n`; nama fungsi/tipe dari konstanta kode |
| 10 | XSS | OK | Satu `dangerouslySetInnerHTML` statis; header CSP frame-ancestors, nosniff |
| 11 | Auth di server | OK | Pipeline `route()` + cookie HttpOnly; entitlement dicek di SQL |
| 12 | Akses per user | OK | Role `authenticated` + `auth.uid()`, fungsi memfilter `user_id` |
| 13 | Role admin | OK | Login + peran + MFA + izin per endpoint; reset akun admin hanya super_admin |
| 14 | DB tidak public | Server perlu cek | Postgres harus listen 127.0.0.1 |
| 15 | Permission DB ketat | Kode OK, server perlu cek | `deploy/sql/roles.sql`: munaja_app bukan superuser/owner |
| 16 | Hash password | OK | scrypt ln=15 r=8 p=3, salt acak, PHC |
| 17 | Session aman | OK | Token acak, disimpan sebagai HMAC, HttpOnly + SameSite=Lax + Secure, batas 3 perangkat |
| 18 | Reset password aman | OK | Token sekali pakai 60 menit (HMAC), mencabut semua perangkat, rate limit + respons generik |

## Verifikasi server (Hermes, 17 Nov 2026)
Header keamanan lengkap; `/api/internal/cron` 404; webhook tanpa tanda tangan 401; health ok; Postgres dan app hanya 127.0.0.1/::1; `.env` 600 milik munaja; NODE_ENV=production, DATA_MODE=live; role munaja/munaja_owner/munaja_app tanpa superuser/createrole/createdb; listen_addresses default (localhost); UFW tidak membuka 5432/3005. Poin 1-18: TERBUKTI di kode dan server.

Catatan server (di luar app Munajaa):
- Port 3000 (WAHA, gateway WhatsApp) terbuka publik v4+v6. Bila WAHA tanpa API key, pihak luar bisa memakai nomor WA bisnis. Rekomendasi: batasi ke localhost/jaringan docker atau aktifkan API key WAHA.
- EACCES saat install/build menandakan perintah pernah dijalankan sebagai root. Jalankan pnpm sebagai user `munaja` (`sudo -u munaja ...`).
