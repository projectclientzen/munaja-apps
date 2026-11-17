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
