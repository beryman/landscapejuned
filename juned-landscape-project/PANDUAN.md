# Juned Landscape Project — Panduan

Satu aplikasi yang menyatukan empat aplikasi Anda:

| Tab | Asal | Fungsi |
|---|---|---|
| **Proyek** | Taman Kerja | Papan tugas, jadwal, RAB, opname, tagihan, absen, laporan foto, SOP |
| **Survei** | LANDSPACE | Survei foto lapangan per proyek → area → bidang, anotasi & ukuran di foto, sketsa bidang tidak beraturan, kalkulasi volume & material, RAB survei, export PDF/Excel |
| **Tanaman** | PlantBase V1.8.4 | Katalog tanaman, material, kalkulator, RAB katalog |
| **Keuangan** | Sepran Personal V4.6.1 | Wallet, transaksi, utang/piutang, budget, nota (OCR), laporan |
| **Beranda** | baru | Ringkasan gabungan + hal yang perlu perhatian |
| **Terpadu** | baru | Laba-rugi per proyek, sinkron pembayaran ke Keuangan, katalog → RAB |
| **Pengaturan** | baru | Pasang aplikasi, cadangan gabungan, penyimpanan, pembaruan |

## Survei (LANDSPACE)
- Data Survei tersimpan di perangkat seperti modul lain (IndexedDB) dan **ikut sinkron** lewat login Supabase yang sama (koleksi `ls:p` proyek, `ls:photo` foto, `ls:cfg` pengaturan). Tidak ada tabel atau kunci terpisah.
- Di HP, menu Survei ada di bagian atas modul (Daftar, Foto, Kalkulasi, RAB, Export) karena bilah bawah dipakai menu utama.
- Foto Survei dikompres (JPEG 85%, maks. 2.560 px) sebelum disimpan. Menghapus proyek Survei ikut menghapus fotonya yang tidak dipakai proyek lain. Menghapus satu foto dari proyek belum membersihkan file fotonya (menyisakan ruang terpakai).
- Survei pertama kali dibuka butuh internet (bundelnya ±10 MB, lalu tersimpan untuk offline).
- Sumber Flutter: `landspace-flutter-source.zip` (bukan bagian dari folder ini). Build ulang: `flutter build web --release --pwa-strategy=none`, lalu salin isi `build/web` ke `apps/survei/`.
- Belum terhubung otomatis: RAB Survei belum masuk ke RAB Proyek, dan Survei belum memakai harga katalog Tanaman.

## Yang terhubung antar modul
1. **Katalog → RAB proyek.** Di Proyek › RAB klik **+ Dari katalog Tanaman** (atau Beranda › Katalog ke RAB). Pilih tanaman/material dan jumlah, atau impor seluruh RAB dari katalog. Harga satuan sudah termasuk waste; upah tukang katalog menjadi tarif tukang per satuan.
2. **Proyek → Keuangan.** Di Proyek › Opname klik **Catat ke Keuangan**. Tagihan berstatus *Dibayar* menjadi transaksi (owner = pemasukan, tukang = pengeluaran) berkategori **Proyek**. Aman diulang: tidak membuat duplikat, dan ikut berubah/terhapus bila tagihan diubah.
3. **Keuangan → Proyek.** Form transaksi punya kolom **Proyek (opsional)**. Terpadu menghitung kas masuk, kas keluar, dan laba kas per proyek.
4. **PIN Keuangan** tetap berlaku: angka keuangan di Beranda/Terpadu disembunyikan sampai PIN dibuka.

## Cara menayangkan (wajib https agar bisa dipasang)
Pilih salah satu (semua gratis). Unggah **isi folder ini** (bukan zip-nya):
- **GitHub Pages**: buat repository, unggah semua file, Settings › Pages › Deploy from branch › `main` / root. Alamat: `https://username.github.io/nama-repo/`.
- **Netlify**: buka app.netlify.com/drop lalu seret folder ini.
- **Cloudflare Pages**: Create project › Direct Upload › unggah folder.

Uji lokal di komputer: klik dua kali `jalankan-lokal.command` (Mac) atau jalankan `python3 -m http.server 8080` di folder ini, lalu buka http://localhost:8080.

## Memasang di perangkat
- **iPhone / iPad (Safari):** Bagikan › *Tambahkan ke Layar Utama*.
- **Android (Chrome):** menu ⋮ › *Instal aplikasi*.
- **Mac:** Safari 17+ › Berkas › *Tambahkan ke Dock*; Chrome/Edge › ikon pasang di bilah alamat.
- **Website:** cukup buka alamatnya di browser mana pun.

## Data & cadangan — penting
- Data tersimpan **di perangkat** (IndexedDB) sehingga bisa dipakai offline. Agar Mac, Android, iPhone, dan iPad saling terhubung, aktifkan **Sinkron antar perangkat** (Supabase gratis): lihat **SINKRON.md** dan `sync-setup.sql`.
- Tanpa sinkron, pindah perangkat lewat **Pengaturan › Unduh cadangan** lalu **Pulihkan dari file**.
- Buat cadangan rutin (Beranda mengingatkan setelah 14 hari). Di iPhone/iPad, pasang ke layar utama agar Safari tidak membersihkan data.
- **Memindahkan data aplikasi lama:** Pengaturan › *Pulihkan dari file* mengenali cadangan lama otomatis:
  - Taman Kerja: Pengaturan › Cadangan data › *Buat cadangan*, simpan teksnya ke file `.json`/`.txt`.
  - PlantBase: Ekspor Backup JSON.
  - Sepran: Data & Backup › Backup.
  Memulihkan satu cadangan lama hanya mengganti modul terkait.
- Bila aplikasi lama pernah dibuka di domain yang sama (mis. sama-sama `username.github.io`), data tanaman/proyek lama terbaca otomatis saat pertama dibuka.

## Catatan
- Foto & dokumen kini disimpan di IndexedDB (bukan localStorage 5 MB), jadi jauh lebih lega. Dokumen proyek maks 4 MB per file.
- **Baca nota memakai Gemini (Google AI).** Di Keuangan › Foto Nota buka *Pengaturan Gemini*, isi kunci API (gratis dari aistudio.google.com/apikey), lalu foto nota. Toko, tanggal, item, kategori, dan total terisi otomatis dan wajib Anda periksa. Model bawaan `gemini-3.5-flash`; bila gagal, aplikasi otomatis mencoba `gemini-3.5-flash-lite` lalu `gemini-3.1-flash-lite`, dan bagian *Detail teknis* menampilkan pesan error asli dari Google; nama model bisa diganti di pengaturan yang sama. Foto nota dikirim ke Google, jadi butuh internet; periksa ketentuan penggunaan data Google untuk jenis kunci yang Anda pakai. Kunci hanya tersimpan di perangkat dan tidak ikut file cadangan. Batasi kunci ke alamat aplikasi Anda di Google agar aman.
- Taman Kerja versi aslinya punya sinkron tim di dalam Claude; di sini sinkron antar perangkat dilakukan lewat Supabase (satu akun yang sama di semua perangkat). PlantBase tetap punya opsi cloud (Supabase) di pengaturannya bila Anda memakainya.
- Pembaruan: naikkan `VERSION` di `sw.js` dan `APP_VERSION` di `shell-core.js` setiap mengubah file, lalu unggah ulang. Pengguna melihat tombol *Perbarui*.

## Struktur
```
index.html  shell-core.js  shell-pages.js  shell-bridge.js  shell-sync.js  shell.css
sync-setup.sql  SINKRON.md  ONEDRIVE.md
shell-onedrive.js  shell-space.js
manifest.webmanifest  sw.js  icons/  lib/ (kv.js, common.js, embed.css, xlsx)
apps/ proyek.html  tanaman.html  keuangan.html  survei/ (aplikasi Flutter web)
```

- **Cadangan OneDrive** dan hemat ruang otomatis: lihat **ONEDRIVE.md**.
