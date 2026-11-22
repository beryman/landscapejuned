# Saran pengembangan Juned Landscape Project

Arah aplikasi: memantau setiap proyek dari **Survei, Penawaran, RAB, Opname, sampai Selesai**.

## Sudah dikerjakan di versi 1.4.0

| Area | Perubahan |
|---|---|
| Cara kerja | Setiap proyek punya 5 tahap yang terhitung otomatis dari datanya, plus satu tindakan berikutnya. |
| Cara kerja | Tab **Penawaran** baru: nomor, nilai, masa berlaku, status, catatan negosiasi, kirim ke WhatsApp. |
| Cara kerja | Survei tertaut ke proyek. Saat penawaran disetujui, item survei otomatis menjadi RAB dengan total sama persis. |
| Tampilan | Beranda menjadi papan pantau: jumlah proyek per tahap, daftar "Perlu tindakan", kartu proyek. |
| Tampilan | Menu utama tinggal 5: Beranda, Proyek, Survei, Katalog, Pengaturan. Warna Proyek disamakan dengan aplikasi. Sidebar ganda Katalog dihilangkan. |
| Sinkronisasi | Data keuangan tidak lagi turun ke perangkat. Tiap perangkat punya nama sendiri di riwayat aktivitas. |
| Praktis | Membuka proyek langsung ke tab yang perlu dikerjakan. |

## Saran berikutnya, urut dari dampak terbesar

### 1. Sinkronisasi (paling penting)
1. ~~Gabung perubahan per bagian proyek.~~ **Selesai di versi 1.4.1** untuk Proyek dan Survei.
2. **Akun per orang (pemilik, mandor).** Satu akun berarti siapa pun yang tahu kata sandinya bisa membaca semua data di Supabase, termasuk harga dan margin. Akun terpisah dengan aturan akses di server adalah satu-satunya pembatasan yang benar-benar aman.
3. **Tampilan mandor.** Setelah ada peran: mandor hanya melihat tugas, laporan, absen, dan volume opname, tanpa harga dan margin.
4. **Penyiapan satu ketukan.** Pemilik membuat tautan atau QR, mandor tinggal memindai.

### 2. Cara kerja
5. ~~Revisi penawaran.~~ **Selesai di versi 1.7.0.**
6. **Termin pembayaran.** Atur termin di awal (misalnya DP 30%, 40%, 30%) dan picu pengingat tagih saat progres tercapai.
7. ~~Pekerjaan tambah kurang (CCO).~~ **Selesai di versi 1.7.0**, termasuk peringatan saat survei berubah setelah RAB dibuat dan nilai nego ke PDF dan Excel.
8. ~~Harga Survei dari Katalog.~~ **Selesai di versi 1.7.0** (pencocokan per nama, yang ragu dilewati).
9. **Berita acara opname.** PDF per termin yang siap ditandatangani owner.

### 3. Lapangan dan kepraktisan
10. ~~Laporan harian 30 detik.~~ **Selesai di versi 1.7.0** (Laporan cepat, volume langsung masuk opname). Paket pekerjaan satu ketukan di Papan juga selesai.
11. **Foto sebelum dan sesudah** per area, langsung dari data Survei.
11b. **Pembaruan langsung antar perangkat (belum dikerjakan).** Orang yang sedang membuka Proyek masih harus menekan *Terapkan*. Menyegarkan modul tanpa memuat ulang berisiko menghapus isian yang sedang diketik, jadi perlu dikerjakan hati-hati.
11c. **Survei batu alam dan tekstur: kebutuhan bahan dan keterangan per bidang.** Angka per m² dan paketnya sudah ada, tetapi pilihan jenis batu, pola pasang, dan kondisi dinding per bidang belum.
12. **Pengingat otomatis:** penawaran belum dijawab 3 hari, tugas terlambat, sesi OneDrive habis.
13. **Tautan pantau untuk klien.** Halaman baca-saja berisi progres dan foto, tanpa harga internal.

### 4. Efektivitas dan laporan
14. **Laba per proyek:** nilai kontrak dikurangi material terkirim dan upah.
15. **Rasio menang penawaran** dan rata-rata lama tiap tahap, untuk melihat di mana proyek sering tertahan.
16. **Perbandingan RAB dan realisasi** per jenis pekerjaan, untuk memperbaiki harga penawaran berikutnya.

### 5. Teknis
17. ~~Satukan Survei ke Proyek.~~ **Selesai di versi 1.6.0.** Sisa istilah Inggris kecil: Undo, Redo, Reset, dan nama sheet Excel "Data Survey".
18. **Satu nomor versi**, dan uji otomatis alur utama sebelum rilis.

## Keputusan yang menunggu pemilik
- **Data keuangan lama di Supabase:** dibiarkan (sekarang) atau dihapus permanen. Selama masih ada, data itu bisa dibaca siapa pun yang memegang akun bersama.
- **Akun per orang:** kapan mulai dipakai.
