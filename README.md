# 🤖 Moodle WhatsApp Bot

Bot WhatsApp yang terintegrasi dengan Moodle untuk memberikan informasi perkuliahan secara real-time. Bot ini dibuat menggunakan Node.js, Puppeteer untuk scraping, dan [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) untuk koneksi WhatsApp.

## ✨ Fitur

Bot ini memiliki beberapa perintah yang dapat digunakan langsung dari WhatsApp:

-   `.kulon <keyword_matkul>`
    Mencari informasi lengkap untuk mata kuliah di minggu yang sedang berjalan, termasuk:
    -   Tanggal perkuliahan
    -   Link Section
    -   Link Quiz
    -   Link Forum
    -   Link Gmeet
    -   Link Module
    -   Link Tugas (Assignment)

-   `.jadwal`
    Menampilkan jadwal kuliah statis untuk satu minggu penuh.

-   `.today`
    Menampilkan jadwal kuliah khusus untuk hari ini.

-   `.all <pesan>`
    Mention/tag semua anggota grup. **(Hanya bisa digunakan oleh Admin Grup)**

-   `.help`
    Menampilkan pesan bantuan yang berisi daftar semua perintah yang tersedia.

## 🛠️ Requirements

Sebelum memulai, pastikan Anda sudah menginstal:
-   [Node.js](https://nodejs.org/) (disarankan v18.x atau lebih baru)
-   Akun WhatsApp yang akan digunakan untuk bot.

## ⚙️ Instalasi & Konfigurasi

Ikuti langkah-langkah berikut untuk menjalankan bot di komputer Anda.

### 1. Clone Repository
Buka terminal Anda dan clone repository ini:
```bash
git clone https://github.com/ghoway/moodle.git
```
### 2. Masuk ke Direktori Proyek
```
cd moodle
```
### 3.  Install Dependensi
```
npm install
```

### 4. Konfigurasi Environment
Bot ini membutuhkan kredensial Moodle Anda untuk bisa login.

Salin atau ubah nama file `example-env` menjadi `.env`.
- Di Windows: `rename example-env .env`
- Di Linux/macOS: `cp example-env .env`

Buka file `.env` yang baru dibuat dan isi dengan username dan password Moodle Anda.
```
MOODLE_USERNAME="USERNAME"
MOODLE_PASSWORD="PASSWORD"
```

## 🚀 Menjalankan Bot

### 1. Jalankan bot dengan perintah:

```
node bot.js
```

### 2. Untuk Penggunaan Pertama Kali:

- Sebuah QR code akan muncul di terminal Anda.
- Buka aplikasi WhatsApp di HP Anda.
- Masuk ke Setelan > Perangkat Tertaut > Tautkan Perangkat.
- Scan QR code tersebut.

### 3. Selesai!
Bot akan terhubung dan siap menerima perintah di WhatsApp. Session Anda akan tersimpan di folder `auth_info_baileys`, sehingga Anda tidak perlu scan QR lagi setiap kali menjalankan bot.
