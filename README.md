# Pusat Tuisyen An Nur (Telipot) - Operational ERP & Registration System

Sistem Pengurusan Operasi & Pendaftaran ERP bagi Pusat Tuisyen An Nur (Tingkat 1 & 2, PT 105 Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan).

Dibina berdasarkan dokumen operasi rasmi:
1. **Figma UI Prototype (`Registration-System`)**
2. **`Enquiry Software Requirement.doc`**
3. **`BORANG PENDAFTARAN TELIPOT (2).pdf`**
4. **`PACKANGE HARGA (1).pdf`**
5. **`JADUAL MASTER 2026 Feb26 (2).pdf`**
6. **`ELAUN GURU 2026 (2).pdf`**
7. **`WhatsApp Image (Catatan Pembatalan dan Gantian Kelas)`**

---

## Seni Bina Teknikal

* **Backend:** **Django 6 + Django REST Framework (DRF)** dengan sokongan CORS dan pangkalan data SQLite (bersedia untuk PostgreSQL).
* **Frontend:** **React 19 + Vite + Tailwind CSS + Lucide Icons** mengikut reka bentuk Figma rasmi (Indigo `#4F46E5`, crisp white cards `#FFFFFF`, dan slate background `#F8FAFC`).

---

## Ciri-Ciri Utama Sistem

1. **Hab Konfigurasi Perniagaan Pengurusan (No-Code Self-Service Engine):**
   * Pihak Pengarah & Pengurusan Kewangan boleh menambah/mengedit subjek, mengubah kadar yuran bulanan, pakej yuran Darjah 5 & 6, kadar elaun guru per sesi, dan had kapasiti kerusi secara langsung tanpa perlu pengaturcara.
2. **Pendaftaran Pelajar & 5-Poin Kegunaan Pejabat:**
   * Borang pendaftaran rasmi, tangkapan 2 penjaga dengan penunjuk *Preferred Contact*, persetujuan semakan keputusan di `sapsnkra.moe`, dan pengesahan 5 kod pejabat:
     * `[L]` Ledger
     * `[TEL]` WhatsApp Broadcast
     * `[SP]` Senarai Pelajar
     * `[AT]` Kedatangan
     * `[SY]` Sistem Pembayaran
3. **Jadual Waktu Master 2026 & Pemantauan Kapasiti Langsung:**
   * Jadual sesi 1 jam 30 minit (Jumaat, Sabtu & malam Isnin–Khamis).
   * Pemantauan lebihan kerusi secara langsung (contoh amaran merah: `-2 kerusi`).
4. **Catatan Pembatalan & Gantian Kelas:**
   * Rekod rasmi tarikh batal, tarikh ganti, kelas tambahan (extra class), sebab cuti umum (PH) atau guru menanda kertas SPM, serta notifikasi automatik ke WhatsApp pelajar.
5. **Pengebilan, DuitNow QR & Resit WhatsApp:**
   * Kalkulator automatik mengikut pakej yuran (4 subjek = RM240, 5 subjek = RM275, 6 subjek = RM330, dll. + pendaftaran RM30).
   * Penjanaan nombor resit bersiri dan cetakan PDF.
   * Butang 1-klik pautan WhatsApp rasmi untuk menghantar resit kepada penjaga.
6. **Portal Pendaftaran Ibu Bapa (Imbasan QR Telefon Bimbit):**
   * Antaramuka mesra telefon pintar untuk ibu bapa membuat pendaftaran kendiri.

---

## Panduan Menjalankan Sistem Secara Tempatan

### 1. Menjalankan Backend (Django)
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install django djangorestframework django-cors-headers
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```
Pelayan API Backend akan beroperasi di: `http://127.0.0.1:8000/api/v1/`

### 2. Menjalankan Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Aplikasi Frontend akan beroperasi di: `http://localhost:5173/`

### 3. Ujian Automatik
```bash
cd backend
python manage.py test billing
```

# annur-erp
