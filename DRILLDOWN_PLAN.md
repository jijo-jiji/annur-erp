# Dashboard and report drill-down

**Status:** all three steps are built and tested: step 1 (student figures), step 2 (money, vouchers, classes) and
step 3 (Laporan, teachers and permits, attendance, prospect follow-ups). Changes from the first plan, found while building:
- "Subjek mengikut tingkatan" slices open **Pelajar** (the active students of that tingkatan taking the subject), not
  Jadual kelas: the figure counts students, so the student list is the one that adds up to it.
- "Elaun direkod" on Laporan > Bayaran guru opens **Kehadiran guru** (the sessions the teacher was paid for), like
  "Sesi", not Gaji guru. The allowance is the sum of those sessions' pay; Gaji guru holds monthly payments that are
  worked out later and can be adjusted, so it would not add up to the figure.
- The sessions and attendance lists are new views on their screens, opened only from a figure: *Kehadiran guru*
  (`teacher` + `year`/`month`) and *Kedatangan pelajar* (`from` + `to`, and `class_id` for one class). The
  attendance rate opens the classes it is made from, each with its own rate, and a class opens its sessions.
- "Sebab gugur subjek" bars and the month counts open *Laporan sejarah* with the reason and period already set
  (`events`, `from`, `to`, `reason`).
- The "Kadar pengisian" subject bars compare seats: the list is the classes of the subject and the bar shows the seats
  they hold ("terisi"), because the percentage itself is not a total of anything.
- Lists whose rows are not already in the browser (teacher sessions, class attendance, history) come from the same
  endpoint that checks the figure; the others filter what the screen already holds by the ids the server returns.
- Backend tests: `students/tests.py` (steps 1 and 2) and `students/tests_reports.py` (step 3) check that every figure
  equals the length or total of the list it opens; `frontend/e2e/drilldown*.spec.js` click each kind of link.

**The request:** every figure on *Ringkasan* (Ringkas and Terperinci) and *Laporan* opens the list behind it, so a
number can be checked by looking at the records. Clicking "Jumlah pelajar" shows the students.

## How it works

1. **A number and its list use one rule.** Today the dashboard counts on the server and each list filters in the
   browser, so they can drift apart. Each figure gets a name (for example `students.active_monthly`) and the server
   builds both the count and the list from the same definition. A test checks that every figure's count equals the
   length of the list it opens.
2. **Lists take their filters from the address**, for example `#/students?status=ACTIVE&form=F5`. Today the filters
   on Pelajar, Yuran, Baucar and Jadual are remembered only inside the screen, so a link cannot set them.
3. **The list says why it is filtered**: a bar at the top such as "Dari Ringkasan: Pelajar aktif · Tingkatan 5", with
   "Buang penapis" and a back link. The count shown on the dashboard appears beside it, so a match is visible.
4. **Cards, chart slices, bars and table rows become links** (keyboard-reachable, with a pointer cursor and a
   hover state). Cards that are only explanations stay plain.
5. **Figures that are not a list** (a percentage, a growth figure) open the list the percentage is made from, and
   say so in the filter bar.

## What the target screens need

| Screen | Has today | Needs |
|---|---|---|
| **Pelajar** (list) | Status (default Aktif), tingkatan, search; not in the address | Address filters: `status` (Aktif, Ditangguh, Tidak aktif, Berdaftar = those three), `type` (Bulanan/Walk-in), `form`, `school_category`, `joined` (month), `as_at` (date: active on that day), `stay` (length of study), `owing` |
| **Yuran & resit** | Status, month, search; address sets only the tab | Address filters: `status` (incl. "Belum selesai" = unpaid + partial + overdue), `month`, `year`; Resit tab: `from`/`to`, `walk_in`, `form`, `level` |
| **Baucar bayaran** | Tab (Semua / Menunggu) | `status`, `category`, `from`/`to`, "dikira" (verified or approved) |
| **Jadual kelas** | Form, teacher | `capacity` (over / full / near full), `subject` |
| **Kedatangan pelajar** | Class and date | `class` + `year` (history of one class) |
| **Kehadiran guru** | Month | `teacher` + `year` |
| **Laporan sejarah** (Pelajar tab) | Type and dates | `reason` |
| **Pertanyaan & prospek** | "Susulan tertunggak" box (local) | `due=1` in the address |

## Where each figure opens

### Ringkasan, both views (role: all unless stated)

| Figure | Opens | Filter |
|---|---|---|
| Pelajar aktif (Ringkas) | Pelajar | status = Aktif |
| Kutipan bulan ini (Ringkas) | Yuran & resit, Resit tab | this month |
| Hari ini (Ringkas hint) | Resit tab | today |
| Tunggakan (Ringkas hint) | Yuran & resit | status = Belum selesai |
| Kehadiran 30 hari lepas | Kedatangan pelajar, classes below the low-attendance limit | last 30 days |
| "Baharu bulan ini" (Ringkas hint) | Pelajar | joined this month |
| "Ditangguh" (Ringkas hint) | Pelajar | status = Ditangguh |

### Ringkasan, Terperinci

| Figure | Opens | Filter |
|---|---|---|
| Jumlah pelajar | Pelajar | status = Berdaftar (active + on hold + inactive; pending and rejected are not students yet) |
| Aktif bulanan | Pelajar | Aktif + Bulanan |
| Walk-in aktif | Pelajar | Aktif + Walk-in |
| Ditangguh | Pelajar | status = Ditangguh |
| Tidak aktif | Pelajar | status = Tidak aktif |
| Kutipan hari ini | Resit tab | today |
| Kutipan bulan ini | Resit tab | this month |
| Tunggakan yuran | Yuran & resit | status = Belum selesai |
| Pelajar aktif mengikut tingkatan: each slice | Pelajar | Aktif + that tingkatan |
| Kapasiti kelas: each class card | Jadual kelas | that class (over / full / near full) |
| Perlu tindakan: each row | Already links; each will open with the exact filter (for example "5 pelajar aktif belum ada invois" lists those 5 students) | per row |
| **Supervisor and Management** | | |
| Pelajar baharu bulan ini | Pelajar | joined this month |
| Guru aktif | Guru & elaun | Aktif |
| Permit hampir / telah luput | Guru & elaun | permits within the warning days |
| Perkara perlu tindakan | scrolls to the list above | none |
| Jumlah pelajar mengikut bulan: each bar (2 years x 12 months) | Pelajar | `as_at` = last day of that month |
| Tempoh belajar: each bar | Pelajar | status = Berdaftar + that length of study (students who left count too, measured to the day they left) |
| Pelajar baharu: each bar | Pelajar | joined that month |
| Berhenti: each bar | Pelajar | left that month |
| Status pelajar: each slice | Pelajar | that status |
| Kategori sekolah: each slice | Pelajar | Aktif + that school category |
| Subjek mengikut tingkatan: each slice | Jadual kelas | that tingkatan + subject (shows the classes and their students) |
| **Management only** | | |
| Status kutipan invois: each slice | Yuran & resit | that status |
| Kutipan bulan ini / bulan lepas | Resit tab | that month |
| Perbelanjaan bulan ini | Baucar bayaran | counted vouchers of this month |
| Pertumbuhan jualan | Resit tab | this month beside last month |
| Baucar menunggu: each row | Baucar bayaran | opens that voucher |

### Laporan

| Tab | Figure | Opens | Filter |
|---|---|---|---|
| Jualan & perbelanjaan | Jumlah dibilkan | Yuran & resit | year |
| | Jumlah dikutip | Resit tab | year |
| | Tunggakan semasa | Yuran & resit | Belum selesai |
| | Kutipan walk-in | Resit tab | year + walk-in |
| | Monthly chart bar and table row (billed, collected, walk-in, expenses, surplus) | Yuran (billed), Resit (collected, walk-in), Baucar (expenses) | that month |
| | Hasil mengikut tingkatan / peringkat: each bar | Resit tab | year + that tingkatan / level |
| | Perbelanjaan mengikut kategori: each row | Baucar bayaran | year + that category |
| | Bajet berbanding sebenar: each row's "Sebenar" | Baucar bayaran | year + that category |
| Bayaran guru | Each teacher row: Sesi | Kehadiran guru | teacher + year |
| | Elaun direkod | Gaji guru | teacher + year |
| Akademik & status pelajar | At-risk rows | Already open the student's results | no change |
| | Pelajar ditangguh / tidak aktif (heading count) | Pelajar | that status |
| | Sebab gugur subjek: each bar and the month counts | Laporan sejarah | reason / month + year |
| | Peningkatan keputusan: each row | Already opens the student | no change |
| Kehadiran & kapasiti | Each class row | Kedatangan pelajar | that class + year |
| | Kadar pengisian: each subject bar | Jadual kelas | that subject |

## Figures that stay as they are
- The explanatory sentences, legends and totals that repeat a figure already linked above (for example the "Jumlah" row).
- Percentages such as "Kadar penukaran" open the list they are calculated from, with the percentage shown in the filter bar.

## Decisions needed before building
1. **Month-end bars ("Jumlah pelajar mengikut bulan")**: open Pelajar with an "active on that date" filter. This
   needs one new filter, but gives the exact students behind each bar. OK?
2. **Who sees what**: a drill-down only opens a screen the role may already open. For Admin a figure that leads
   to a screen they cannot open (Laporan, Gaji guru) stays a plain number. OK?
3. **Order**: I suggest (a) the shared filter bar and the Pelajar filters, then Ringkasan; (b) Yuran, Baucar and
   Jadual filters; (c) Laporan. Each step is tested end to end before the next.
4. **Check that numbers match**: add a test that fails if any dashboard figure differs from the length of its list.
   I recommend this, because the two have been calculated separately until now.
