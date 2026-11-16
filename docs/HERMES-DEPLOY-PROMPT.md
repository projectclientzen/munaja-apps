# Prompt deploy untuk Hermes (16 Nov 2026)

```
Tugas: deploy app Munaja ke VPS owner mengikuti runbook docs/DEPLOYMENT-VPS.md di repo github.com/projectclientzen/munaja-apps (branch main). Ikuti langkah 0 sampai 11 apa adanya, lalu langkah 12 (webhook Scalev).

Isian:
- Domain: <ISI DOMAIN> (ganti setiap munaja.example.com)
- Email super_admin pertama (langkah 10): info.ngajigaes@gmail.com

ATURAN:
- Semua secret (password DB, SESSION_PEPPER, PHONE_HASH_KEY, MFA_ENC_KEY, CRON_SECRET, SCALEV_PAYLOAD_KEY, SCALEV_API_KEY, signing secret webhook, VAPID) dibuat/ditempel HANYA di server (/etc/munaja/munaja.env, mode 0640). Jangan kirim ke chat, jangan commit.
- Repo privat: pakai deploy key read-only, jangan simpan token di URL remote.
- Ubuntu 22.04: pasang PostgreSQL 16 dari apt.postgresql.org (bawaan 14).
- Langkah 10 dijalankan di SSH interaktif. Tautan atur password super_admin dikirim ke owner lewat kanal pribadi, bukan grup. Owner mengetik password sendiri.
- Langkah 12: simpan webhook di dashboard Scalev HANYA setelah secret terisi dan service di-restart. Buat API key Scalev baru khusus app (order:read, order:list).
- Jangan ubah kode. Bila satu langkah gagal: berhenti, laporkan perintah + 30 baris log terakhir (tanpa secret).

LAPORAN (per langkah 0-12): berhasil/gagal, versi Node/pnpm/PostgreSQL/Caddy, hasil `curl https://<domain>/api/v1/health`, hasil `pnpm db:migrate --status`, status 3 service (web, worker, backup timer), apakah business.test_event 2xx. Sertakan juga: product id, variant id angka, dan SKU produk Munaja di Scalev (untuk SCALEV_ALLOWED_VARIANT_IDS), dan format nomor HP + nama field waktu bayar pada 1 order nyata (disamarkan).
```
