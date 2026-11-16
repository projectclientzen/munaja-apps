# Prompt redeploy untuk Hermes (16 Nov 2026)

Server saat ini menjalankan branch lama `claude/u2-munaja` (belum berisi webhook Scalev, worker, admin, perbaikan audit). Webhook Scalev (X3 + X6) SUDAH ada di `main`, termasuk path `/api/webhooks/scalev` yang dipakai dashboard Scalev. Brief X3/X6 buatan Hermes TIDAK perlu dijalankan.

```
Tugas: redeploy Munajaa di VPS dari repo github.com/projectclientzen/munaja-apps branch MAIN (bukan claude/u2-munaja). Ikuti docs/DEPLOYMENT-VPS.md, dengan penyesuaian untuk server ini di bawah. JANGAN menjalankan brief "implement webhook Scalev (X3 + X6)": fitur itu sudah ada di main. Jangan ubah kode.

Server: Ubuntu 24.04, PostgreSQL 17 (127.0.0.1), Nginx (bukan Caddy), domain app https://apps.munajaapp.com -> 127.0.0.1:3005.

1. Backup dulu: pg_dump database `munaja` ke /var/backups/munaja-pre-redeploy.sql (mode 600). Laporkan apakah ada data pembeli NYATA di DB lama (jumlah baris purchase_orders dan auth.users). Bila ADA data nyata: BERHENTI dan lapor. Bila tidak ada: lanjut.
2. Database baru dari nol (DB lama dibuat dari branch lama dan tidak cocok dengan runner migrasi): drop + create database `munaja`, lalu jalankan deploy/sql/roles.sql (langkah 4 runbook; role munaja_owner untuk migrasi, munaja_app untuk app), lalu `pnpm db:migrate` (langkah 7) dan `pnpm db:migrate --status`.
3. Kode: checkout penuh repo di /opt/munaja-app/app (bukan hanya .next/standalone, karena worker butuh repo + node_modules). `pnpm install --frozen-lockfile && pnpm build` dengan env production terisi (NEXT_PUBLIC_DATA_MODE=live dibaca saat BUILD). Web: `pnpm start -p 3005`.
4. Jalankan app sebagai user sistem `munaja` (bukan root), Node 22 terpasang di path sistem (mis. /usr/bin/node), bukan /root/.hermes/node. Laporkan bila build gagal di Node 22.
5. Env /opt/munaja-app/.env (mode 600, pemilik munaja): pertahankan secret yang sudah ada, TAMBAHKAN yang belum ada dari deploy/env.example, minimal:
   NEXT_PUBLIC_DATA_MODE=live, NODE_ENV=production, DATABASE_URL (munaja_app), MIGRATE_DATABASE_URL (munaja_owner),
   APP_BASE_URL=https://apps.munajaapp.com, APP_ORIGINS=https://apps.munajaapp.com, TRUSTED_PROXY_HOPS=1,
   SESSION_PEPPER, PHONE_HASH_KEY, MFA_ENC_KEY, CRON_SECRET, SCALEV_PAYLOAD_KEY (masing-masing `openssl rand -base64 32`, BERBEDA),
   VAPID_* (lihat runbook), PRAYER_PROVIDER=equran,
   SCALEV_API_BASE=https://api.scalev.com, SCALEV_STORE_ID=2785, SCALEV_ALLOWED_VARIANT_IDS=648177,MUNAJA-01,
   SCALEV_API_KEY dan SCALEV_WEBHOOK_SIGNING_SECRET (yang sudah ada).
   Secret dibuat di server, tidak dikirim ke chat.
6. Service systemd: munaja-app (web) DAN munaja-worker (`pnpm worker`, env sama). Contoh di deploy/munaja-web.service dan deploy/munaja-worker.service (sesuaikan path /opt/munaja-app/app dan port 3005). Backup harian: deploy/backup.sh + timer.
7. Nginx: samakan dengan deploy/nginx-munaja.conf.example (header X-Forwarded-For dan X-Forwarded-Proto WAJIB, client_max_body_size 1m). `nginx -t` lalu reload.
8. Cek: `curl -s https://apps.munajaapp.com/api/v1/health` (ok); `curl -s -o /dev/null -w "%{http_code}" -X POST https://apps.munajaapp.com/api/webhooks/scalev` harus 401 (tanpa tanda tangan). Lalu di dashboard Scalev tekan simpan/tes webhook: business.test_event harus 2xx.
9. Super_admin (langkah 10 runbook, SSH interaktif): email info.ngajigaes@gmail.com, kirim tautan sekali pakai ke owner lewat chat pribadi. Owner mengetik password sendiri lalu pasang MFA.

LAPORAN per nomor 1-9: berhasil/gagal, output singkat (tanpa secret), versi Node/pnpm/PostgreSQL. Tambahan dari 1 order nyata (disamarkan): nama field waktu bayar di GET /v3/orders/{id} (paid_time / payment_time / paid_at / lainnya).
```
