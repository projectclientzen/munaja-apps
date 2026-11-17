# Prompt audit Fable ke-2, sebelum publish (17 Nov 2026)

```
Kamu auditor akhir untuk app Munajaa (PWA Next.js + PostgreSQL 17 di VPS, live di https://apps.munajaapp.com) di repo ini, branch main. Ini audit KEDUA sebelum dijual. Mode HEMAT kuota: read-only, jangan ubah kode, jangan buat PR, jangan jalankan e2e. Boleh menjalankan vitest satu file hanya untuk membuktikan temuan. Kamu tidak punya akses ke server; audit hanya isi repo.

Baca dulu: CLAUDE.md, docs/AUDIT-FABLE-2026-11-14.md (audit pertama, F1-F11 sudah diperbaiki di T9), docs/DECISIONS.md bagian 13-17 Nov.

FOKUS (urut prioritas; berhenti lebih awal bila konteks berat dan sebutkan di laporan):
1. Verifikasi perbaikan F1-F11 benar dan tidak membuka celah baru: src/server/auth/service.ts (auth_gate, rate_refund, ipReserve), migration 20261118010000, src/server/auth/crypto.ts, src/domain/auth/phone.ts, cookie Secure.
2. Alur uang -> akses (Scalev): src/server/scalev/{client,seal,intake,verify,provision,sweep,handlers}.ts, route /api/v1/webhooks/scalev dan alias /api/webhooks/scalev, migration 20261117020000 dan 030000. Bentuk respons Scalev NYATA sudah dicek 17 Nov (lihat DECISIONS): detail order polos tanpa wrapper, paid_time, list berisi ringkasan tanpa payment_status. Cari: jalan apa pun yang membuka akses tanpa GET order lunas + varian 648177/MUNAJA-01; order yang lunas tapi tidak pernah diproses; duplikasi entitlement.
3. Perubahan terbaru yang belum pernah diaudit: staff starting level (migration 20261118120000, 130000, 150000, src/server/admin/routes.ts staff/:id/level, src/components/admin/ops-views.tsx); src/components/worship/quran-ref.tsx (ayat dari Tanzil saja); src/lib/sha256.ts dan src/lib/uuid.ts (fallback non-secure context); scripts/scalev-probe.ts (tidak boleh membocorkan data pribadi atau API key).
4. Area yang audit pertama TIDAK sempat periksa: validasi body di src/server/api/routes.ts; migration admin_content, admin_support, admin_aggregates, jobs_runner; fungsi export_user_data dan user_active_key + hitungan tanggal sesi; src/server/notifications/** dan src/server/push/**.
5. Deploy: deploy/** dan docs/DEPLOYMENT-VPS.md (role DB minimal, tidak ada secret di repo, header proxy, backup).

ATURAN PRODUK YANG TIDAK BOLEH DILANGGAR (laporkan bila ada pelanggaran): teks Arab hanya dari Tanzil / content/*.json owner; tanpa approve manual order oleh admin (hanya cek ulang ke Scalev); level tidak pernah di-reset atau dikunci ulang; data excused per user tidak terlihat admin; password hanya hash; tanpa leaderboard.

SUDAH DIKETAHUI, JANGAN DILAPORKAN: nomor WA CS belum ada; jadwal salat masih EQuran.id (SIHAT menunggu); alat rotasi PHONE_HASH_KEY untuk order lama belum ada; nilai PROVISIONAL memang sementara; logo/ikon dari owner.

ABAIKAN: gaya UI, copy, performa, "test kurang lengkap" tanpa bug nyata.

FORMAT LAPORAN (di chat, maksimal 15 temuan, urut paling parah):
| # | Tingkat (Kritis/Tinggi/Sedang/Rendah) | file:baris | Masalah (1 kalimat) | Skenario gagal konkret | Usulan perbaikan (1-2 kalimat) | Keyakinan |
Lalu: status F1-F11 (tuntas / belum + alasan), keputusan GO / NO-GO untuk mulai jualan beserta syaratnya, dan daftar area yang tidak sempat diperiksa. Jangan mengarang temuan.
```
