# Sinkron antar perangkat (Mac, Android, iPhone, iPad)

Data aplikasi tetap tersimpan di tiap perangkat (jadi tetap bisa dipakai offline). **Supabase** dipakai sebagai penghubung: perubahan di satu perangkat dikirim ke cloud lalu turun ke perangkat lain.

## Koneksi tersimpan di aplikasi (versi 1.8.0)
URL dan kunci publik proyek Supabase sudah ada di `config.js`, jadi perangkat baru **tidak perlu menempel apa pun**: cukup masuk dengan email dan kata sandi. Aplikasi mengingat email di perangkat itu (bukan kata sandi) dan menjaga sesi lewat token penyegaran.

Ingat dua hal karena repo ini **publik**:
- Kunci di `config.js` adalah kunci *publik* (`sb_publishable_…`). Data Anda dilindungi aturan RLS per akun, bukan oleh kerahasiaan kunci itu. **Jangan pernah** menaruh kunci `service_role` atau `secret` di sana.
- Siapa pun yang tahu alamat aplikasi bisa mencoba mendaftar akun di proyek Supabase Anda. Setelah semua akun Anda dibuat, matikan pendaftaran: Supabase › **Authentication › Sign In / Providers** › matikan **Allow new users to sign up**. Tombol *Buat akun* di layar login lalu menampilkan pesan bahwa pendaftaran ditutup.

Kode koneksi manual (di bawah) tetap diutamakan bila ada, dan *Ubah koneksi* kembali ke bawaan.

## A. Penyiapan sekali saja (± 10 menit)
1. Buka **supabase.com**, daftar gratis, lalu **New project**. Pilih region terdekat (mis. Singapore) dan buat password database (simpan).
2. Menu **SQL Editor › New query**. Tempel seluruh isi file **`sync-setup.sql`**, klik **Run**. Harus muncul "Success".
3. (Disarankan) **Authentication › Sign In / Providers › Email**: matikan **Confirm email** agar akun langsung bisa dipakai. Jika dibiarkan aktif, Anda harus klik tautan di email sebelum Masuk.
4. **Project Settings › API** (atau *API Keys*): salin **Project URL** dan kunci **anon / publishable**.
   **Jangan pernah memakai kunci `service_role` / secret.** Itu kunci rahasia.

## B. Perangkat pertama
1. Buka aplikasi. Layar login tampil di awal.
2. Tekan **Buat akun**, isi email dan kata sandi (min. 6 karakter). Data perangkat ini langsung diunggah.

## C. Perangkat lain (iPhone, Android, Mac, iPad)
1. Pasang dan buka aplikasi di perangkat itu.
2. Di layar login, isi email dan kata sandi yang **sama**, tekan **Masuk**. Seluruh data turun otomatis. Bila fotonya banyak, tekan *Lanjut, sinkron di latar*.

> **iPhone/iPad:** aplikasi di layar utama dan Safari punya penyimpanan terpisah. Lakukan langkah C di **aplikasi layar utama** (bukan di tab Safari).

## Cara kerja layar login (versi 1.12.0)
- Setelah masuk, aplikasi tidak bertanya lagi dan tetap bisa dibuka saat offline.
- *Pakai tanpa login* membuat data hanya tersimpan di perangkat itu. Masuk kapan saja dari **Pengaturan › Lanjutan › Sinkron antar perangkat**.
- Bila sesi benar-benar berakhir, layar login muncul lagi. Gangguan internet atau server tidak mengeluarkan Anda, dan data di perangkat tidak dihapus.
- Bila perangkat terakhir dipakai akun lain, aplikasi bertanya dulu sebelum menggabungkan data perangkat ke akun yang baru masuk.
- Belum ada fitur lupa kata sandi di aplikasi. Atur ulang lewat Supabase › **Authentication › Users**.

## Cara kerjanya
- Sinkron otomatis: beberapa detik setelah data berubah, saat aplikasi dibuka kembali, saat kembali online, dan tiap 45 detik. Ada tombol *Sinkronkan sekarang*.
- Yang disinkronkan: proyek (termasuk penawaran, foto & dokumen), survei, tanaman, material, RAB katalog, dan **kunci Gemini** (diisi sekali, perangkat lain ikut; kunci tidak masuk file cadangan dan menghapusnya di satu perangkat menghapusnya di semua). Kunci tersimpan di akun Supabase Anda dalam bentuk teks biasa dan hanya terbaca setelah login (RLS); pemilik proyek Supabase secara teknis bisa melihatnya. **Tidak** disinkronkan: nama pengguna per perangkat dan data keuangan lama. Baris keuangan lama tetap tersimpan di Supabase, tidak ditarik ke perangkat baru, dan tidak dihapus aplikasi.
- Offline: tetap bisa bekerja; perubahan terkirim saat online lagi.
- Foto/dokumen besar dikirim sebagai potongan terpisah dan hanya sekali (tidak diulang tiap perubahan kecil).
- **Gabung otomatis (Proyek dan Survei):** bila dua perangkat mengubah proyek yang sama, perubahannya digabung per bagian. Misalnya mandor mengubah tugas dan pemilik mengubah harga RAB: keduanya tersimpan.
- **Konflik:** hanya muncul bila dua perangkat mengubah isian yang persis sama dengan nilai berbeda, atau satu menghapus item yang diubah perangkat lain. Nilai di perangkat yang sedang sinkron dipakai (item yang diubah tetap dipertahankan), dan nilai lainnya ada di *Pengaturan › Konflik*. *Pakai versi ini* hanya mengganti bagian yang bentrok. Tanaman, material, dan RAB katalog masih memakai konflik per data.
- **Tidak saling menimpa:** perangkat hanya menulis ke server bila server masih berisi versi yang sudah digabungnya. Bila tidak, aplikasi menarik lagi dan menggabungkan ulang. Tidak perlu menjalankan ulang `sync-setup.sql`.
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
