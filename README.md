# Learn Syriac — Tutor AI Server (gratis)

Server kecil untuk fitur Tutor AI di aplikasi Learn Syriac (AramSyriac).
Dijalankan gratis di Render (paket Free) + kunci Gemini gratis dari Google AI Studio.

## Cara pasang (gratis, tanpa kartu kredit)

### 1. Buat repo GitHub `learn-syriac-tutor`
- Buka https://github.com/new — nama repo: `learn-syriac-tutor`, Public.
- Setelah dibuat, pilih repo ini di instalasi Muse GitHub App supaya saya bisa mengunggah file-file ini.

### 2. Buat kunci Gemini gratis
- Buka https://aistudio.google.com/apikey — klik **Create API key**.
- Kunci ini GRATIS (paket free Google AI Studio, ada batas pemakaian harian tapi cukup untuk kelas).
- ⚠️ JANGAN kirim kunci ini lewat chat dan JANGAN taruh di file. Kunci hanya ditempel di dashboard Render pada langkah 3.

### 3. Deploy gratis di Render
- Daftar gratis di https://dashboard.render.com (bisa login pakai GitHub).
- **New → Web Service** → pilih repo `learn-syriac-tutor`.
- Render membaca `render.yaml` di repo ini: paket **Free**, build `npm ci`, start `node server.js`.
- Di halaman service, buka **Environment** → tambah variabel:
  - `GEMINI_API_KEY` = (tempel kunci dari langkah 2)
- Klik **Deploy**. Setelah selesai, salin alamat service-nya, contoh:
  `https://learn-syriac-tutor.onrender.com`

### 4. Sambungkan aplikasi ke server ini
- Di repo AramSyriac, ubah `src/components/AIAssistant.tsx` baris 47:
  dari `fetch("/api/tutor", ...)` menjadi
  `fetch("https://learn-syriac-tutor.onrender.com/api/tutor", ...)`
  (pakai alamat service dari langkah 3).
- Simpan → GitHub Actions membangun ulang situs otomatis.

### 5. Tes
- Buka https://learn-syriac-tutor.onrender.com/ — harus muncul
  `{"ok":true,"service":"Learn Syriac Tutor AI","aiReady":true}`.
- Buka aplikasi Learn Syriac → tab Tutor → kirim satu pertanyaan.

## Catatan paket gratis
- Render Free "tidur" kalau 15 menit tidak dipakai. Pertanyaan pertama setelah tidur
  butuh sekitar 30–60 detik untuk membangunkan server, pertanyaan berikutnya normal.
- Kalau nanti pemakaian besar, baru pertimbangkan paket berbayar — untuk sekarang gratis sudah cukup.

## File-file
- `server.js` — server Express, endpoint `POST /api/tutor` + health check `GET /`.
  Hanya menerima panggilan dari `https://rudolf-web.github.io` (dan localhost saat tes).
- `package.json` / `package-lock.json` — dependensi.
- `render.yaml` — konfigurasi deploy Render (paket free).
