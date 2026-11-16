# Runbook deploy Munaja di VPS

Untuk Hermes atau owner. Langkah bernomor, bisa disalin. Semua nilai rahasia dibuat di server dan tidak pernah ditempel di chat, tiket, atau repo.

Target: Ubuntu 22.04 atau 24.04, Node 20 LTS, pnpm, PostgreSQL 16 lokal, Caddy (HTTPS otomatis), systemd. Ganti `munaja.example.com` dengan domain asli. Perintah ditulis untuk user dengan `sudo`.

Status uji: runner migrasi dan role SQL sudah dicoba di PostgreSQL 16 nyata, `pnpm build` dan endpoint health juga. Caddy, systemd, backup timer, dan webhook Scalev belum dicoba di VPS asli (lihat `docs/sessions/X1.md`).

## 0. Prasyarat

- Domain dengan record A/AAAA ke IP server. Port 80 dan 443 terbuka.
- Akses SSH interaktif (terminal sungguhan, bukan skrip): langkah 9 mencetak tautan sekali pakai dan menolak dicetak ke pipe.
- Email admin pertama (super_admin) yang kamu kendalikan.
- Untuk Scalev: akses dashboard Scalev dan paket yang memuat webhook (belum dikonfirmasi owner, B4).

## 1. Install paket

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates gnupg openssl postgresql postgresql-contrib debian-keyring debian-archive-keyring apt-transport-https
# Caddy
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
# Node 20 LTS + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable && sudo corepack prepare pnpm@10.28.0 --activate
node -v && pnpm -v && psql --version   # Node 20.x, pnpm 10.x, PostgreSQL 16 (Ubuntu 22.04 membawa 14: pasang 16 dari apt.postgresql.org)
```

## 2. User dan direktori

```bash
sudo useradd --system --create-home --home-dir /opt/munaja --shell /usr/sbin/nologin munaja
sudo install -d -o munaja -g munaja /opt/munaja/app
sudo install -d -o root -g munaja -m 0750 /etc/munaja
```

## 3. Clone

Repo privat: pakai deploy key read-only milik owner, atau clone dari akun yang punya akses. Jangan simpan token di URL remote.

```bash
sudo -u munaja git clone https://github.com/projectclientzen/munaja-apps.git /opt/munaja/app
cd /opt/munaja/app && sudo -u munaja git checkout main
```

## 4. PostgreSQL: role dan database

Password dibuat di server, disimpan di file `0600`, tidak masuk riwayat shell.

```bash
sudo bash -c 'umask 077; openssl rand -hex 24 > /etc/munaja/db-owner.pw; openssl rand -hex 24 > /etc/munaja/db-app.pw'
sudo -u postgres psql \
  -v owner_pw="$(sudo cat /etc/munaja/db-owner.pw)" -v app_pw="$(sudo cat /etc/munaja/db-app.pw)" \
  -f - < /opt/munaja/app/deploy/sql/roles.sql
```

Hasil: role `munaja_owner` (menjalankan migrasi), `munaja_app` (dipakai app, bukan superuser), role `anon`/`authenticated`/`service_role`, database `munaja`. Postgres hanya mendengar di `127.0.0.1` (bawaan Ubuntu); jangan buka port 5432 di firewall.

## 5. File env

```bash
cd /opt/munaja/app
sudo install -m 0640 -o root -g munaja deploy/env.example /etc/munaja/munaja.env
sudo bash -c '
set -e
f=/etc/munaja/munaja.env
rnd() { openssl rand -base64 32 | tr -d "\n"; }
sed -i "s#CHANGE_ME_APP_PW#$(cat /etc/munaja/db-app.pw)#; s#CHANGE_ME_OWNER_PW#$(cat /etc/munaja/db-owner.pw)#" $f
sed -i "s#CHANGE_ME_DOMAIN#munaja.example.com#; s#CHANGE_ME_SUPPORT_EMAIL#support@example.com#" $f
# Tiap CHANGE_ME_RANDOM diganti nilai acak yang BERBEDA
while grep -q CHANGE_ME_RANDOM $f; do
  v=$(rnd); sed -i "0,/CHANGE_ME_RANDOM/s#CHANGE_ME_RANDOM#$v#" $f
done
'
sudo grep -c CHANGE_ME /etc/munaja/munaja.env   # harus 0
```

Base64 memuat `/` dan `+`: aman karena pemisah sed di atas `#`. Bila kamu mengedit tangan, jangan beri tanda kutip.

VAPID (push notifikasi), dibuat di server:

```bash
cd /opt/munaja/app && sudo -u munaja node_modules/.bin/web-push generate-vapid-keys   # jalankan SETELAH langkah 6
# isi VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY di /etc/munaja/munaja.env dengan sudoedit
```

Yang diisi nanti: `PRAYER_PROVIDER` (kosong sampai izin EQuran.id dikonfirmasi; lalu `equran`), `SCALEV_*` (langkah 12). Kosong aman: fiturnya menolak dengan pesan jelas, tidak memalsukan data.

## 6. Install dan build

`NEXT_PUBLIC_*` ikut tertanam saat build, jadi env dimuat dulu.

```bash
cd /opt/munaja/app
sudo -u munaja pnpm install --frozen-lockfile
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm build'
```

## 7. Migrasi database

```bash
cd /opt/munaja/app
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm db:migrate --seed'
sudo -u postgres psql -f - < deploy/sql/roles.sql    # kedua kalinya: beri munaja_app hak SET ROLE
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm db:migrate --status'   # pending: 0
```

- `--seed` memuat konten (level, aktivitas, setelan) dari `supabase/seed.sql`, tanpa wilayah DEMO.
- Daftar kab/kota sudah ada di migrasi `20261118020000_regions_equran.sql`. `pnpm db:regions` hanya perlu bila `content/regions/*.json` berubah; hasilnya file migrasi baru (jangan edit migrasi lama, runner menolaknya).
- Runner menolak file yang sudah diterapkan lalu diubah, dan file baru yang namanya lebih awal dari yang terakhir diterapkan. Satu transaksi per file; gagal berarti rollback.

## 8. Service, Caddy, backup

```bash
cd /opt/munaja/app
sudo cp deploy/munaja-web.service deploy/munaja-worker.service deploy/munaja-backup.service deploy/munaja-backup.timer /etc/systemd/system/
sudo chmod +x deploy/backup.sh
sudo install -d -o munaja -g munaja /opt/munaja/app/.next/cache
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
echo 'MUNAJA_DOMAIN=munaja.example.com' | sudo tee -a /etc/default/caddy   # lalu pastikan caddy.service memuat EnvironmentFile=-/etc/default/caddy
sudo systemctl edit caddy   # tambah: [Service] / EnvironmentFile=-/etc/default/caddy
sudo systemctl daemon-reload
sudo systemctl enable --now munaja-web munaja-worker munaja-backup.timer
sudo systemctl restart caddy
```

Jalankan backup sekali untuk memastikan jalan: `sudo systemctl start munaja-backup && ls -l /var/backups/munaja`. Salin file backup ke luar server secara berkala (script tidak mengunggah apa pun).

## 9. Cek kesehatan

```bash
systemctl is-active munaja-web munaja-worker caddy
curl -si https://munaja.example.com/api/v1/health    # 200 {"ok":true}; 503 {"ok":false} = app tidak bisa membuka database
journalctl -u munaja-web -n 50 --no-pager
journalctl -u munaja-worker -n 50 --no-pager          # cari worker_started
curl -s -o /dev/null -w '%{http_code}\n' https://munaja.example.com/api/internal/cron   # 404 (diblok Caddy)
```

Endpoint health hanya menjawab ok atau tidak: tanpa versi, tanpa isi error.

## 10. Super_admin pertama

Jalankan di terminal SSH interaktif. Email dari argumen; password tidak pernah diketik di perintah atau log.

```bash
cd /opt/munaja/app
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm exec tsx scripts/admin-grant-role.ts admin@example.com --print-link'
```

Output: tautan atur password sekali pakai (60 menit), hanya ke terminal. Kirim tautan ke pemilik akun lewat kanal aman, bukan chat grup. Bila perintah bilang "bukan terminal", kamu menjalankannya lewat pipe atau skrip; buka sesi SSH biasa.

## 11. Enrol MFA

1. Pemilik akun membuka tautan, membuat password.
2. Masuk di `https://munaja.example.com/admin` dengan email dan password.
3. Layar "Pasang autentikator": scan dengan Google Authenticator, Authy, atau 1Password, masukkan kode 6 angka.
4. Enrol pertama hanya dalam 24 jam setelah peran diberikan (PROVISIONAL). Lewat itu, super_admin lain mereset MFA akun itu dari halaman Peran. Karena itu buat DUA super_admin sebelum rotasi `MFA_ENC_KEY` (`docs/DEPLOYMENT-NOTES.md`).

## 12. Webhook Scalev

Urutan penting: endpoint dan secret harus hidup SEBELUM webhook disimpan, karena Scalev mengirim `business.test_event` saat simpan dan simpanan gagal bila bukan 2xx. Endpoint menjawab 503 sampai secret dan `SCALEV_PAYLOAD_KEY` ada.

1. URL webhook: `https://munaja.example.com/api/v1/webhooks/scalev`
2. Di dashboard Scalev, buka halaman pengaturan webhook, salin signing secret yang ditampilkan. Tempel hanya ke file di server:
   ```bash
   sudo -e /etc/munaja/munaja.env   # isi SCALEV_WEBHOOK_SIGNING_SECRET=<secret dari dashboard>
   ```
   `SCALEV_PAYLOAD_KEY` sudah dibuat di langkah 5 (jangan diganti: menggantinya membuat payload tersimpan tak terbaca).
3. Buat API key Scalev KHUSUS app ini, scope `order:read` dan `order:list` saja (bukan key yang dipakai Hermes). Isi `SCALEV_API_KEY`, `SCALEV_STORE_ID`, dan `SCALEV_ALLOWED_VARIANT_IDS` (ID varian angka atau SKU, dipisah koma; kosong = semua order lunas dikarantina) di file env yang sama.
4. Restart: `sudo systemctl restart munaja-web munaja-worker`
5. BARU sekarang simpan webhook di dashboard Scalev, toggle aktif. `business.test_event` harus 2xx. Bila gagal: baca log (di bawah), perbaiki, simpan lagi.
6. Event yang dipilih: `payment.received`, `payment.failed`, `order.status_changed`, `order.deleted`. Event lain disimpan lalu diabaikan.
7. Cek: `journalctl -u munaja-web -f` saat menekan simpan; lalu order uji di Scalev dan lihat halaman admin Pembelian. Akses pembeli aktif hanya setelah worker memverifikasi order ke API Scalev, bukan dari isi webhook.

Log: `journalctl -u munaja-web -n 100 --no-pager` (webhook), `journalctl -u munaja-worker -n 100 --no-pager` (verifikasi order, sweep). Log tidak memuat email, HP, atau secret.

## 13. Update versi

```bash
cd /opt/munaja/app
git rev-parse --short HEAD   # CATAT commit lama untuk rollback
sudo -u munaja git fetch origin
sudo -u munaja git pull --ff-only origin main
sudo -u munaja pnpm install --frozen-lockfile
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm build && pnpm db:migrate'
sudo systemctl restart munaja-web munaja-worker
curl -si https://munaja.example.com/api/v1/health | head -1
```

Jalankan backup manual sebelum migrasi yang mengubah skema: `sudo systemctl start munaja-backup`.

## 14. Rollback

Migrasi bersifat maju saja. Kode lama biasanya tetap jalan dengan skema yang lebih baru, jadi rollback kode dulu:

```bash
cd /opt/munaja/app
sudo -u munaja git checkout <commit-lama>        # dari catatan langkah 13
sudo -u munaja pnpm install --frozen-lockfile
sudo -u munaja bash -c 'set -a; . /etc/munaja/munaja.env; set +a; pnpm build'
sudo systemctl restart munaja-web munaja-worker
```

Runner `db:migrate` akan menolak kode lama yang tidak punya file migrasi yang sudah tercatat: jangan jalankan `db:migrate` di commit lama. Bila skema ikut rusak, pulihkan dari backup (data setelah backup hilang; hentikan service dulu):

```bash
sudo systemctl stop munaja-web munaja-worker
sudo -u postgres dropdb munaja && sudo -u postgres psql -f - < /opt/munaja/app/deploy/sql/roles.sql   # buat ulang DB kosong; tanpa -v password lama tetap
sudo -u postgres pg_restore --no-owner --role=munaja_owner -d munaja /var/backups/munaja/<berkas>.dump
sudo systemctl start munaja-web munaja-worker
```

(`roles.sql` kedua kali memberi hak `munaja_app` lagi. Setelah restore, owner objek = `munaja_owner`.)

## Troubleshooting singkat

| Gejala | Penyebab umum |
|---|---|
| health 503 | `DATABASE_URL` salah, atau `roles.sql` kedua belum dijalankan (munaja_app belum boleh SET ROLE) |
| app tidak mau start, soal proxy | `TRUSTED_PROXY_HOPS` harus 1 di production |
| `permission denied to create role` saat migrasi | `roles.sql` pertama belum jalan; migrasi memakai `munaja_owner`, bukan superuser |
| webhook Scalev gagal disimpan | `SCALEV_WEBHOOK_SIGNING_SECRET` atau `SCALEV_PAYLOAD_KEY` kosong, atau service belum di-restart |
| login admin tidak minta MFA / tidak bisa enrol | jendela 24 jam lewat; super_admin lain reset MFA |
