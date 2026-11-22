# Cadangan OneDrive & hemat ruang cloud

## Apa yang dilakukan
- **Cadangan OneDrive:** aplikasi menyimpan file cadangan lengkap (proyek, tanaman, keuangan, dan **foto asli**) ke folder khusus aplikasi di OneDrive Anda (`OneDrive/Apps/<nama aplikasi>`). Aplikasi hanya bisa melihat folder itu, tidak seluruh OneDrive.
- **Hemat ruang cloud:** saat database Supabase hampir penuh (bawaan ≥ 85%), aplikasi otomatis: (1) mencadangkan foto asli ke OneDrive dan memverifikasi ukurannya, (2) mengecilkan foto di aplikasi (maks. 1000 px), (3) mengirim versi kecil ke cloud, (4) menghapus foto lama di Supabase. Perangkat lain ikut menerima foto versi kecil lewat sinkron.
- Foto asli tetap ada di file cadangan OneDrive (`jlp-backup-tanggal-jam.json.gz`) dan bisa dipulihkan lewat **Pengaturan › Pulihkan dari OneDrive**.

## Penyiapan sekali saja (± 10 menit)
1. Buka **entra.microsoft.com** (Microsoft Entra), masuk dengan akun Microsoft Anda. Bila diminta, buat akun/direktori gratis.
2. **Identity › Applications › App registrations › New registration**.
   - Name: `Juned Landscape Project`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: pilih **Single-page application (SPA)** lalu isi alamat aplikasi Anda **persis sama** (contoh `https://username.github.io/juned/`, pakai garis miring di akhir bila alamatnya begitu). Alamat yang benar ditampilkan di Pengaturan › Cadangan OneDrive.
3. Klik **Register**, lalu salin **Application (client) ID**.
4. **API permissions › Add a permission › Microsoft Graph › Delegated**: tambahkan `Files.ReadWrite.AppFolder` (dan `User.Read`, biasanya sudah ada). Tidak perlu persetujuan admin; Anda menyetujuinya saat login pertama.
5. Di aplikasi: **Pengaturan › Cadangan OneDrive**, tempel Client ID, **Simpan**, lalu **Masuk dengan Microsoft**.

## Cara memakai
- **Otomatis:** cadangan dibuat maksimal sekali per hari saat aplikasi dibuka; disimpan sejumlah cadangan terakhir (bawaan 5, bisa diubah).
- **Manual:** tombol *Cadangkan sekarang*.
- **Pulihkan:** *Pulihkan dari OneDrive…* lalu pilih cadangan (data saat ini diganti). File `.json.gz` juga bisa dipilih lewat *Pulihkan dari file*.
- **Meter ruang cloud:** di Pengaturan › Sinkron antar perangkat. Pilih paket (Gratis 500 MB / Pro 8 GB). Aktifkan fungsinya dengan menjalankan ulang `sync-setup.sql` terbaru di Supabase.

## Batasan yang perlu diketahui
- **Login Microsoft untuk aplikasi web berlaku 24 jam** (aturan Microsoft). Setelah itu muncul tombol *Masuk OneDrive*; biasanya cukup satu ketukan. Cadangan dan hemat ruang otomatis berjalan hanya saat sesi masih aktif dan aplikasi sedang dibuka.
- **iPhone/iPad:** login Microsoft dari aplikasi layar utama sering bermasalah karena halaman login terbuka di jendela terpisah. Sebaiknya hubungkan OneDrive di **Mac atau Android** (atau Safari biasa). Cukup satu perangkat: foto yang dikecilkan di sana otomatis sampai ke perangkat lain lewat sinkron.
- Hemat ruang berjalan **hanya saat Anda berada di Beranda, Terpadu, atau Pengaturan**, agar tidak mengganggu pekerjaan di dalam modul.
- Angka di dashboard Supabase bisa tidak langsung turun setelah foto dihapus; ruang kosong dipakai ulang untuk data baru.
- Bila database sudah **sepenuhnya penuh** (mode baca-saja oleh Supabase), penghapusan pun bisa ditolak. Karena itu pemicunya diatur sebelum penuh (≥ 85%). Jika sudah terlanjur penuh, naikkan paket Supabase sementara atau lepas mode baca-saja dari dashboard Supabase, lalu jalankan *Hemat ruang sekarang*.
- Dokumen non-gambar (mis. PDF) tidak dikecilkan.
