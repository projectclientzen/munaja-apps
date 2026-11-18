-- Bedtime message bank (owner approved 18 Nov 2026, source content/notif-bedtime.v1.json). 30 messages, styles A and B.
-- Published and active, so the scheduler (loadBedtimeBank) rotates them and the bedtime reminder can be offered.
-- Fixed ids make this safe to run again; later edits go through the admin notification screen.
insert into public.notification_templates (id, category, title, body, is_active, version, review_status, approved_at)
select v.id, v.category, v.title, v.body, true, 1, 'published', now()
from (values
  ('ea6151c2-6287-5b2f-b81f-8c15a97fce35'::uuid, 'bedtime', $t$Taruh HP-nya dulu, {nama}$t$, $t$Layar boleh menunggu sampai besok. Badanmu butuh istirahat supaya ringan bangun nanti malam.$t$),
  ('d3a01496-51f6-5580-9f74-69f0ee441923'::uuid, 'bedtime', $t$Malam ini ada janji$t$, $t$Sepertiga malam nanti ada waktu khusus untuk bermunajat. Tidur sekarang supaya datang tepat waktu.$t$),
  ('fd8a5464-42c4-5104-a5a0-7e439226baae'::uuid, 'bedtime', $t$Sudah pasang alarm?$t$, $t$Cek alarm untuk tahajud, lalu letakkan HP agak jauh dari kasur. Sisanya biar tidur yang urus.$t$),
  ('37c27ec4-294a-5401-ac5f-7a4698e4583a'::uuid, 'bedtime', $t$Tutup hari dengan syukur$t$, $t$Apa pun yang terjadi hari ini, sudah lewat. Ucapkan alhamdulillah, lalu istirahatlah dengan tenang.$t$),
  ('3e9ed927-b3b6-52ed-b25e-cd9c345c4dd8'::uuid, 'bedtime', $t$Wudhu dulu sebelum tidur$t$, $t$Tidur dalam keadaan suci bikin hati lebih tenang. Setelah itu matikan lampu dan pejamkan mata.$t$),
  ('7ba04448-3855-5b7c-8dd2-ee4b51f01d0a'::uuid, 'bedtime', $t$Simpan doamu untuk nanti malam$t$, $t$Ada hajat yang ingin kamu sampaikan? Tidur lebih awal supaya bisa menyampaikannya dengan khusyuk.$t$),
  ('9ea10287-8fd5-5f2f-acbe-7ca59bcc7d78'::uuid, 'bedtime', $t$Kerjaan bisa dilanjut besok$t$, $t$Email dan chat kantor tidak akan ke mana-mana. Malam ini giliran kamu yang istirahat, {nama}.$t$),
  ('b48c5211-8156-580e-9663-929976f07fd3'::uuid, 'bedtime', $t$Tenangnya malam menunggumu$t$, $t$Saat kota sudah sepi, sajadah terasa lebih dekat. Tidur dulu, nanti bangun dengan hati yang lapang.$t$),
  ('5daaf6a4-a28b-569b-aefe-9dd00195ff23'::uuid, 'bedtime', $t$Lampu redup, pikiran pelan$t$, $t$Kurangi cahaya kamar dan tarik napas panjang beberapa kali. Tubuhmu akan ikut melambat.$t$),
  ('f52269f6-0344-55d1-8378-92f306203d75'::uuid, 'bedtime', $t$Niatkan bangun tahajud$t$, $t$Sebelum terlelap, pasang niat untuk bangun malam. Niat yang tulus sering jadi alarm terbaik.$t$),
  ('08280a5a-0f22-544b-8841-e1055e18d661'::uuid, 'bedtime', $t$Satu episode lagi? Besok saja$t$, $t$Tontonan bisa disimpan. Jam tidur yang terlewat lebih sulit dikejar. Yuk istirahat sekarang.$t$),
  ('2504c73f-50f2-5533-b311-441555bd72b9'::uuid, 'bedtime', $t$Hari ini sudah cukup$t$, $t$Kamu sudah berusaha sebaik mungkin hari ini. Serahkan sisanya pada Allah dan beristirahatlah.$t$),
  ('925b0eb3-1a2c-550e-a22e-bcba87e10f5b'::uuid, 'bedtime', $t$Minum air, lalu tidur$t$, $t$Segelas air putih sebelum tidur, lalu matikan layar. Bangun nanti terasa lebih segar.$t$),
  ('d58b34cd-3cec-5ece-ab87-f8c9fd5e1ad2'::uuid, 'bedtime', $t$Kembali ke sajadah nanti malam$t$, $t$Tempat paling tenang bukan di layar, tapi di atas sajadah. Tidurlah, lalu temui ia nanti malam.$t$),
  ('349a40d3-fd47-51ac-8f6f-dbf129e17b05'::uuid, 'bedtime', $t$Istirahat dulu, {nama}$t$, $t$Kamu sudah bekerja keras hari ini. Tidur cukup juga bagian dari menjaga amanah tubuh.$t$),
  ('aaff3baf-be20-5656-aba8-96af5f5ff608'::uuid, 'bedtime', $t$Malam milik orang yang rindu$t$, $t$Rindu bermunajat? Malam ini kesempatannya. Tidur lebih awal supaya rindu itu sempat tersampaikan.$t$),
  ('b0075222-ad15-525e-be04-6f6f18ec515a'::uuid, 'bedtime', $t$Tinggalkan grup chat dulu$t$, $t$Notifikasi grup bisa dibaca besok pagi. Aktifkan mode jangan ganggu dan biarkan pikiran tenang.$t$),
  ('1568c35d-b562-5000-af62-0c69eed1b9f0'::uuid, 'bedtime', $t$Lepaskan beban pikiran$t$, $t$Yang belum selesai hari ini, titipkan dalam doa. Tidur dengan hati yang ringan, {nama}.$t$),
  ('b19492bc-2646-5db3-9638-b11b0102309e'::uuid, 'bedtime', $t$Level {level} sedang berjalan$t$, $t$Langkahmu sejauh ini sudah bagus. Tidur tepat waktu malam ini membantu langkah berikutnya.$t$),
  ('d5f3cfb6-d299-5118-bfbe-7fc484e3c930'::uuid, 'bedtime', $t$Sepertiga malam terasa dekat$t$, $t$Beberapa jam lagi waktu yang istimewa itu tiba. Siapkan tubuhmu dengan tidur sekarang.$t$),
  ('6f8b320d-a284-58cf-86f7-295c7324ed1d'::uuid, 'bedtime', $t$Berbaring miring ke kanan$t$, $t$Rapikan bantal, berbaring miring ke kanan, dan baca doa tidur. Kebiasaan kecil yang menenangkan.$t$),
  ('9abf0c26-cf5a-510f-b3e7-1bd460a49334'::uuid, 'bedtime', $t$Untuk keluarga yang kamu doakan$t$, $t$Nanti malam, sebut nama mereka satu per satu dalam doa. Tidur dulu supaya kuat bangun.$t$),
  ('1c0d9cc8-b42f-5b0e-a43d-00adb14925c3'::uuid, 'bedtime', $t$Tidak harus sempurna, {nama}$t$, $t$Kemarin terlewat? Tidak apa-apa. Malam ini mulai lagi dari tidur yang lebih awal.$t$),
  ('6ab39d3d-6be8-5b2f-80c6-98ab7ae20b36'::uuid, 'bedtime', $t$Istiqomah dimulai dari malam ini$t$, $t$Bukan soal seberapa banyak, tapi seberapa terjaga. Tidur sekarang, lanjutkan kebiasaan baikmu.$t$),
  ('2cc52dd6-2a7f-5f67-90c7-3d390e2ed347'::uuid, 'bedtime', $t$Siapkan pakaian untuk bangun$t$, $t$Taruh sajadah dan baju salat di dekat kasur. Saat alarm bunyi, semua sudah siap.$t$),
  ('1c9fd452-540e-5606-9c28-9f8a0863f2b1'::uuid, 'bedtime', $t$Malam yang tenang, hati yang lapang$t$, $t$Biarkan hari ini selesai di sini. Istirahatlah, nanti malam ada waktu untuk bicara dengan-Nya.$t$),
  ('836a9c2d-bab5-51bd-87ab-95d1782078a3'::uuid, 'bedtime', $t$Jam segini, waktunya rebahan$t$, $t$Bukan rebahan sambil scroll, ya. Simpan HP, pejamkan mata, dan biarkan tubuh pulih.$t$),
  ('96a6034a-9b33-5345-9345-a75aecee0935'::uuid, 'bedtime', $t$Besok pagi yang lebih segar$t$, $t$Tidur cukup malam ini, tahajud di sepertiga malam, lalu Subuh dengan hati yang tenang.$t$),
  ('3d28a37a-fb9e-570b-99d3-6afdd351e853'::uuid, 'bedtime', $t$Level {level}, satu malam lagi$t$, $t$Setiap malam yang kamu jaga itu berarti. Tidur sekarang supaya besok tetap konsisten, {nama}.$t$),
  ('60bc348b-e3e8-5ed5-a109-3fb55fdd1ee6'::uuid, 'bedtime', $t$Sampai jumpa di sepertiga malam$t$, $t$Selamat beristirahat, {nama}. Semoga dibangunkan dengan mudah untuk bermunajat nanti malam.$t$)
) as v(id, category, title, body)
on conflict (id) do nothing;
