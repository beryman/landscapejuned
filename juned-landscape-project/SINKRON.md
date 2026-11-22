# Sinkron antar perangkat (Mac, Android, iPhone, iPad)

Data aplikasi tetap tersimpan di tiap perangkat (jadi tetap bisa dipakai offline). **Supabase** dipakai sebagai penghubung: perubahan di satu perangkat dikirim ke cloud lalu turun ke perangkat lain.

## A. Penyiapan sekali saja (± 10 menit)
1. Buka **supabase.com**, daftar gratis, lalu **New project**. Pilih region terdekat (mis. Singapore) dan buat password database (simpan).
2. Menu **SQL Editor › New query**. Tempel seluruh isi file **`sync-setup.sql`**, klik **Run**. Harus muncul "Success".
3. (Disarankan) **Authentication › Sign In / Providers › Email**: matikan **Confirm email** agar akun langsung bisa dipakai. Jika dibiarkan aktif, Anda harus klik tautan di email sebelum Masuk.
4. **Project Settings › API** (atau *API Keys*): salin **Project URL** dan kunci **anon / publishable**.
   **Jangan pernah memakai kunci `service_role` / secret.** Itu kunci rahasia.

## B. Perangkat pertama
1. Buka aplikasi › **Pengaturan › Sinkron antar perangkat**.
2. Tempel **Project URL** dan **kunci anon**, klik **Simpan koneksi**.
3. Isi email dan kata sandi (min. 6 karakter), klik **Daftar akun baru**. Data perangkat ini langsung diunggah.
4. Klik **Salin kode koneksi** (atau **Salin tautan penyiapan**) dan kirim ke diri sendiri (WhatsApp/Catatan).

## C. Perangkat lain (iPhone, Android, Mac, iPad)
1. Pasang dan buka aplikasi di perangkat itu › Pengaturan › Sinkron.
2. Tempel **kode koneksi** › **Terapkan kode** (atau buka tautan penyiapan).
3. Masukkan email dan kata sandi yang **sama**, klik **Masuk**. Seluruh data turun otomatis.

> **iPhone/iPad:** aplikasi di layar utama dan Safari punya penyimpanan terpisah. Lakukan langkah C di **aplikasi layar utama** (bukan di tab Safari).

## Cara kerjanya
- Sinkron otomatis: beberapa detik setelah data berubah, saat aplikasi dibuka kembali, saat kembali online, dan tiap 45 detik. Ada tombol *Sinkronkan sekarang*.
- Yang disinkronkan: proyek (termasuk foto & dokumen), tanaman, material, RAB katalog, transaksi, wallet, utang/piutang, budget, kategori, jadwal berulang, dan nota. **Tidak** disinkronkan: PIN Keuangan dan kunci API Gemini (tetap per perangkat).
- Offline: tetap bisa bekerja; perubahan terkirim saat online lagi.
- Foto/dokumen besar dikirim sebagai potongan terpisah dan hanya sekali (tidak diulang tiap perubahan kecil).
- **Konflik:** bila dua perangkat mengubah data yang sama sebelum sempat sinkron, versi perangkat yang sinkron belakangan dipakai, dan versi lainnya disimpan di *Pengaturan › Konflik* (bisa dipakai kembali).
- Saat Anda sedang membuka suatu modul dan ada pembaruan dari perangkat lain untuk modul itu, pembaruan **ditunda** dan muncul tombol *Terapkan*, agar pekerjaan yang sedang berjalan tidak tertimpa.
- **Pengaman hapus massal:** bila terdeteksi banyak data hilang sekaligus (mis. habis reset/pulihkan cadangan), aplikasi bertanya dulu dan menjeda sinkron.

## Ruang cloud penuh?
Paket gratis Supabase memberi 500 MB database. Lihat meter di Pengaturan › Sinkron (aktifkan dengan menjalankan ulang `sync-setup.sql` terbaru). Foto adalah pemakai ruang terbesar. Sambungkan **OneDrive** agar aplikasi otomatis mencadangkan foto asli lalu mengecilkan foto saat ruang hampir penuh: lihat **ONEDRIVE.md**.

## Keamanan & batasan
- Akses dibatasi per akun (Row Level Security). Namun data **tidak dienkripsi ujung-ke-ujung**: pemilik proyek Supabase (Anda) secara teknis dapat melihatnya. Pakai kata sandi yang kuat.
- Paket gratis Supabase: database 500 MB; proyek yang tidak dipakai ±7 hari bisa dijeda (aktifkan kembali dari dashboard, data tidak hilang).
- "Reset semua data" di aplikasi hanya menghapus data perangkat itu dan mematikan sinkron di perangkat tersebut; data cloud tetap ada.
- Tetap buat **cadangan file** berkala (Pengaturan › Unduh cadangan) sebagai pengaman tambahan.
- Fitur cloud bawaan PlantBase (di pengaturan modul Tanaman) tidak perlu dipakai lagi; gunakan sinkron ini saja.
