# Juned Landscape Project: Panduan

Aplikasi untuk memantau proyek lanskap dari **Survei, Penawaran, RAB, Opname, sampai Selesai**.

| Tab | Asal | Fungsi |
|---|---|---|
| **Beranda** | baru | Jumlah proyek per tahap, daftar perlu tindakan, kartu proyek berjalan |
| **Proyek** | Taman Kerja + LANDSPACE | Tahap proyek, lembar survei (foto, ukuran, volume, RAB survei, export PDF/Excel), penawaran, RAB, opname, tagihan, papan tugas, jadwal, absen, laporan foto, SOP |
| **Katalog** | PlantBase V1.8.4 | Katalog tanaman, material, kalkulator, RAB katalog |
| **Pengaturan** | baru | Nama perangkat, pasang aplikasi, cadangan, penyimpanan, pembaruan, sinkron |

## Alur kerja
1. **Proyek baru:** buat proyek. Aplikasi langsung membuka tab Survei.
2. **Survei:** tekan *Buat survei untuk proyek ini*, lalu ukur lokasi dan isi harga. Tombol *Kembali ke proyek* ada di bagian atas.
3. **Penawaran:** nilai diambil dari survei. Ubah bila ada negosiasi, kirim lewat WhatsApp, lalu tandai terkirim.
4. **RAB:** tekan *Disetujui klien, lanjut RAB*. Item survei menjadi RAB, dan selisih overhead, profit, diskon, serta pajak menjadi satu baris penyesuaian sehingga total RAB sama dengan nilai penawaran.
5. **Opname:** catat volume atau persen, lalu tagih owner dan bayar tukang sesuai progres.

Tahap proyek dihitung otomatis dari data ini. Saran pengembangan ada di **SARAN-PENGEMBANGAN.md**.

**Keuangan sudah dilepas sejak versi 1.4.0.** Data keuangan lama tidak dihapus: tetap ada di perangkat, ikut file cadangan, dan tetap ada di Supabase.

## Survei (LANDSPACE)
- Data Survei tersimpan di perangkat seperti modul lain (IndexedDB) dan **ikut sinkron** lewat login Supabase yang sama (koleksi `ls:p` proyek, `ls:photo` foto, `ls:cfg` pengaturan). Tidak ada tabel atau kunci terpisah.
- Survei dibuka dari **Proyek › tab Survei**, tidak lagi ada di menu utama, dan langsung menampilkan lembar milik proyek itu.
- Menu lembar survei ada di bagian atas (Ringkasan, Foto, Kalkulasi, RAB, Ekspor) karena menu utama sudah ada di samping atau bawah.
- Foto Survei dikompres (JPEG 85%, maks. 2.560 px) sebelum disimpan. Menghapus proyek Survei ikut menghapus fotonya yang tidak dipakai proyek lain. Menghapus satu foto dari proyek belum membersihkan file fotonya (menyisakan ruang terpakai).
- Survei pertama kali dibuka butuh internet (bundelnya ±10 MB, lalu tersimpan untuk offline).
- Sumber Flutter: `landspace-flutter-source.zip` (bukan bagian dari folder ini). Build ulang: `flutter build web --release --pwa-strategy=none`, lalu salin isi `build/web` ke `apps/survei/` dan naikkan `SURVEI` di `sw.js`. Di Windows tanpa Developer Mode, bangun dari salinan yang folder `windows`, `macos`, `ios`, dan `android`-nya dihapus.
- Rumus volume dan RAB Survei disalin ke `lib/survei-calc.js`. Bila Survei dibangun ulang dengan rumus baru, perbarui file itu dan jalankan `node test/survei-calc.test.js`.
- Belum terhubung: Survei belum memakai harga Katalog.

## Yang terhubung antar modul
1. **Survei → Penawaran → RAB.** Lihat Alur kerja di atas.
2. **Katalog → RAB proyek.** Di Proyek › RAB klik **+ Dari katalog Tanaman**. Pilih tanaman/material dan jumlah, atau impor seluruh RAB dari katalog. Harga satuan sudah termasuk waste; upah tukang katalog menjadi tarif tukang per satuan.

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
- Taman Kerja versi aslinya punya sinkron tim di dalam Claude; di sini sinkron antar perangkat dilakukan lewat Supabase (satu akun yang sama di semua perangkat). PlantBase tetap punya opsi cloud (Supabase) di pengaturannya bila Anda memakainya.
- Pembaruan: naikkan `VERSION` di `sw.js` dan `APP_VERSION` di `shell-core.js` setiap mengubah file, lalu unggah ulang. Pengguna melihat tombol *Perbarui*.

## Struktur
```
index.html  shell-core.js  shell-pages.js  shell-bridge.js  shell-sync.js  shell.css
sync-setup.sql  SINKRON.md  ONEDRIVE.md
shell-onedrive.js  shell-space.js
manifest.webmanifest  sw.js  icons/  lib/ (kv.js, common.js, survei-calc.js, sync-merge.js, embed.css, xlsx)
apps/ proyek.html  tanaman.html  survei/ (aplikasi Flutter web)
test/ survei-calc.test.js  sync-merge.test.js  sync-two-devices.js (uji browser, hanya localhost)
```

- **Cadangan OneDrive** dan hemat ruang otomatis: lihat **ONEDRIVE.md**.
