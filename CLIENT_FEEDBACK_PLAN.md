# Client feedback, October 2026

**Status:** in progress. Phases are built in the order below; each phase is marked done here, with what changed while
building it, before the next one starts.

| Phase | Work | Status |
|---|---|---|
| A | Quick fixes: voucher subcategory, red highlights, supplier code + type, resubmit rejected registration, subject categories, substitute warning, teacher filters, WhatsApp preview & edit | **Done** 25 Oct 2026 |
| B | Student code `HQ-YY0000` and renumbering | **Done** 25 Oct 2026 |
| C | School exam results: terms per year, grid entry, public results form + review queue, student and class statistics | **Done** 25 Oct 2026 |
| D | Fees: payment proof, receipt correction, unpaid invoice edit; daily counter close; Admin daily checklist | Planned (design notes below) |
| E | Notifications and the week-5 unpaid rule for Supervisor | Planned |
| F | Teacher private links and the public teacher profile form | Planned |
| I | QR self check-in for student attendance | Planned |
| G | Handouts linked to classes, copy count and received list | Planned |
| H | Performance analysis dashboard and two-way reports | Planned |

## What was already built (before this plan)

| Request | Where |
|---|---|
| Admin edits a student's profile | Pelajar → student → Maklumat → **Ubah maklumat**; Kelas → **Tambah subjek** (active, pending, on-hold students) |
| WhatsApp wording editable | Tetapan → **Mesej** (Pengurusan; Supervisor too since Phase A) |
| Supplier invoice and signature on a voucher | Baucar bayaran → voucher → **Lampiran**, **Tandatangan penerima** (after saving) |
| Teacher category filter | Guru → tabs Semua / Tetap / Sambilan |
| Add one exam result | Student → Keputusan → **Tambah keputusan** |
| Today's collection | Ringkasan → "Hari ini RM…" |
| Failing students | Laporan → "Pelajar dengan keputusan terkini D hingga G" |
| Complaints about a teacher | Guru → **Aduan & tindakan** |
| Student code prefix | Tetapan → Had & amaran → "ID pelajar" (letters only) |

## Problems found in the code while planning

- Exam results are grouped by exam name only, so the same exam in two years merges into one.
- The exam-type list (UASA, UPKK, …) does not match the school terms, and *Keputusan ujian* treats results as
  tuition-class tests although they are school exams.
- Issued receipts are locked from editing on purpose (audit rule in `CUSTOMISATION_PLAN.md`); corrections must go
  through cancel and reissue, never an overwrite.
- The voucher subcategory list shows every subcategory until a category is chosen, and vouchers store labels, so
  renaming a category breaks the link.
- The substitute-teacher list shows every active teacher, ignoring subject and timetable clashes.
- There is no notification system and no daily cash check.
- A rejected registration cannot be edited or resubmitted.
- Teachers have no login (only Admin, Supervisor, Management).

## Decisions (answered by the client)

| # | Question | Answer |
|---|---|---|
| 1 | Renumber existing students to the new code? | Yes. Old IDs stay searchable. |
| 2 | "Update a receipt or invoice" means? | All three: attach the parent's proof, correct a wrong receipt (cancel and reissue with Supervisor approval), edit an unpaid invoice. |
| 3 | What is shown in red? | Vouchers of RM500 and above, unpaid and overdue fees, cash differences, arrears with no warning sent. |
| 4 | How does a parent prove identity on the public results form? | Student code + last 4 digits of the IC; staff review before results are saved. |
| 5 | Handout "tally" | Both: copies from the class roster and a per-student received list. |
| 6 | Subject categories | Teras / Sains / Sastera / Elektif, editable. |
| 7 | Student ↔ teacher reports | Entered by staff only for now. |
| 8 | Substitute teacher with a different subject | Warn, do not block; matching teachers listed first. |
| 9 | QR attendance checks | Class code on the whiteboard + IC last 4 digits (first time on a phone). |
| 10 | Teacher private links | Yes; Pengurusan can cancel a link at any time. |
| 11 | Kiosk tablet | Later; teachers mark pupils without phones for now. |
| 12 | QR timing | Late after 10 minutes; open from 15 minutes before to 30 minutes after the start; unchecked students absent at the end of class; all editable. |

## Phase A: quick fixes

1. **Voucher category → subcategory.** Subcategories appear only once a category is chosen and are required when the
   category has any. The voucher stores the category and subcategory codes as well as the labels.
2. **Red for problems.** Voucher amounts of RM500 and above, unpaid / overdue fees, arrears with no warning sent.
3. **Suppliers.** "No. SSM / ID pembekal" becomes **Kod syarikat** (generated when left empty). New **Jenis bekalan**
   list (Alat tulis, Paip / plumbing, Elektrik, Percetakan, Penyelenggaraan, Lain-lain) that Pengurusan edits; the
   supplier's type suggests the voucher category.
4. **Rejected registration → Ubah & hantar semula.** Admin edits the saved form and resubmits; the student goes back to
   *Menunggu kelulusan* and the rejection stays in the history.
5. **Subject categories** on the registration form: Teras, Sains, Sastera / Akaun, Elektif, from a new *Kategori*
   field on each subject (editable list).
6. **Substitute teacher.** Teachers qualified for the subject and free at that time first; others behind "show all"
   with a warning.
7. **Teacher list filters.** Kategori, tingkatan and subjek dropdowns.
8. **WhatsApp.** Every message opens in a preview where staff can edit the text before WhatsApp opens. Supervisor may
   also edit the templates.

### Phase A: what was built

| # | Where to find it | Notes |
|---|---|---|
| 1 | Baucar bayaran → **Baucar baharu** | Subkategori is disabled until a category is chosen, lists only that category's subcategories and is required when there are any. Vouchers keep `category_code` / `subcategory_code`; a migration linked existing vouchers by label. Budget and the drill-down follow the code, so renaming a category in Data induk keeps old vouchers in it. Old free-text categories still save. |
| 2 | Baucar list, Yuran → invois & tunggakan | Red: voucher amounts from the tier-1 limit (RM500, Tetapan → Had & amaran), the approval-tier box above tier 1, unpaid invoice balances, "Belum diberi amaran" on arrears. Cash differences come with Phase D. |
| 3 | Baucar bayaran → **Pembekal** | "Kod syarikat" replaces SSM; left empty it becomes the next `VND-` number. TIN is optional. **Jenis bekalan** list (Data induk → Jenis bekalan) suggests the voucher category when that supplier is picked. |
| 4 | Pelajar → rejected student → **Ubah maklumat**, **Hantar semula** | Red banner with who rejected and why. The classes chosen before the rejection are offered again; a note on what was fixed is required. The student keeps the same ID and goes back to the Kelulusan queue; the history shows *Dihantar semula*. Filter "Ditolak" on the student list. |
| 5 | Tetapan → Subjek (**Kategori** column and field); Data induk → **Kategori subjek** | A subject without a category goes in its stream's group. The staff registration form and the public parent form (`#/daftar`) group subjects under the category headings. The public form now loads the centre's real subjects for the chosen grade from `GET /api/v1/public/subjects/?form=` (only subjects with a class for that grade) instead of a fixed list. |
| 6 | Kehadiran guru → status *Diganti* → Guru ganti | Built as two groups in the dropdown instead of a "show all" toggle: **Sesuai** (qualified for the subject and no overlapping class that day) first, then **Guru lain** labelled *subjek lain* / *ada kelas*. Choosing one of those shows an amber warning; saving is not blocked. |
| 7 | Guru → Direktori | Three dropdowns replace the tabs: Kategori (tetap / sambilan), Tingkatan (from the classes they teach), Subjek (qualified for it or teaching it). |
| 8 | Every WhatsApp button with a prepared message | Opens **Semak mesej WhatsApp**: edit, copy, or open WhatsApp. Absence notice, arrears warning, invoice reminder, receipt, prospect follow-up, student profile and list, teacher payslip. A reminder or warning is recorded only when WhatsApp is actually opened. Plain chat buttons with no prepared message, and the parent's own "Hubungi kaunter" button, open WhatsApp directly. Supervisor can now edit the templates in Tetapan → **Mesej** (Admin cannot). |

Tests: `core/tests_client_feedback.py` → `PhaseAQuickFixTests` (8 tests); full backend suite 230 tests OK.

## Phase B: student code `HQ-YY0000`

`HQ` is the prefix (editable), `YY` the registration year, `0000` one running number across all years that never
resets or repeats. Existing students are renumbered in registration order; the old ID is kept and searchable.

### Phase B: what was built

- New students get `PREFIX-YY` + the next running number, e.g. `HQ-260007`. The number is the highest one used by any
  student in any year or under any prefix, plus one, so changing the year or the prefix never repeats it. After 9999
  it simply grows to five digits.
- Migration `students/0014` renumbered every student in registration order (join date, then the time the record was
  made), with `YY` from the year they joined. The dev data went from `AN-2026-001`… to `HQ-260001`… .
  The old code is stored in the new read-only field `previous_student_id`.
- The prefix setting (Tetapan → Had & amaran → *ID pelajar*) now defaults to `HQ`. A centre still on the old default
  `AN` was moved to `HQ`; a prefix the centre had chosen itself is kept.
- Old codes still work: search on the student list and in Cari (Ctrl+K) finds them, an old link
  `#/students/AN-2026-003` opens the student, and the profile header shows "HQ-260003 (dahulu AN-2026-003)".
- Seed data, the sample WhatsApp placeholder and two tests that expected the old format were updated.

Tests: `PhaseBStudentCodeTests` (3 tests); full backend suite 233 tests OK.

## Phase C: school exam results

1. Six fixed terms per year: Penggal 1, Pertengahan Tahun, Penggal 2, Akhir Tahun for everyone; Percubaan SPM and SPM
   for Tingkatan 5. Results are keyed by student, year, term and subject; existing rows are moved into this shape.
2. Entry by student and term in one grid (marks, or grade only for SPM), and by class.
3. Public form `#/keputusan`: student code + IC last 4 digits, the grid, an optional photo of the report slip.
   Submissions wait in a review queue until staff approve them.
4. Statistics: a *Prestasi* tab on the student (trend per subject, average per term, grade counts, against the class
   average) and per tuition class.

### Phase C: what was built

| Where | What |
|---|---|
| Keputusan peperiksaan (menu, renamed from *Keputusan ujian*) | Year + term tabs (Penggal 1, Pertengahan Tahun, Penggal 2, Percubaan SPM (T5), Akhir Tahun, SPM (T5)); stats; each tuition class with its average, pass rate and A count. A class opens a roster to enter marks (SPM: grade dropdown), the change from the previous exam, the class average across the year, and the grade spread. |
| Keputusan → **Semakan borang** | Results sent on the public form, with the photo of the slip, what is already saved (differences in amber), **Semak & luluskan** (staff can correct marks first) or **Tolak** with a reason. |
| Keputusan → **Borang ibu bapa** | Link and QR code of the public form, to print or copy. |
| Student → **Keputusan** tab | Year grid: subjects × terms, failing marks in red, average row; **Isi keputusan** enters a whole term in one screen and can add school subjects not taken at the centre. **Prestasi**: latest average and change, against the class average, subjects passed, A count, a trend chart against the class (dashed), latest grade spread, and a trend card per subject with its tuition teacher. |
| `#/keputusan` (public, phone-first) | Student code (old codes work too) + last 4 IC digits → choose year and exam (defaults to the latest one already sat) → marks per subject → optional slip photo / PDF → sender's name, relation, phone. Five wrong IC tries lock that code for an hour; 30 sends an hour per device. Sending again for the same exam replaces a submission not yet reviewed. |

Data: `StudentExamResult` now has `year`, `term`, `source` (staff / parent form) and `recorded_by`, one row per student, year, term
and subject (migration `students/0015` mapped old rows by exam name, else by month). New `ResultSubmission` model and
`RESULT_SLIP` attachment. APIs: `/students/results/grid/`, `/students/results/bulk/` (year + term), `/students/result-submissions/`
(approve / reject), `/public/results/check/`, `/public/results/`. The Data induk list *Jenis peperiksaan* is no longer used and is
hidden. Sample 2026 results were added to the seed data.

Tests: `PhaseCSchoolResultsTests` (8 tests); full backend suite 240 tests OK.

## Phase D: fees and daily cash

1. Payment proof attached when recording a payment. A wrong receipt is cancelled and reissued with a reason and
   Supervisor approval. An unpaid invoice can be edited (amount, description) with a reason.
2. **Tutup kaunter harian:** today's receipts split into cash and QR / transfer / card; Admin enters the cash counted,
   differences in red; Supervisor verifies and signs off; every day is kept.
3. **Admin daily checklist** (cash closed, attendance taken, reminders sent, handouts ready; editable items) that
   Supervisor ticks off each day.

### Phase D: design notes (worked out before handing over; no code yet)

What the existing code does today, and how Phase D was going to fit it:

- `billing/views.py` `PaymentReceiptViewSet` allows DELETE for Supervisor / Management, and the default `destroy` removes the
  receipt **without** taking its amount off the invoice or the student's credit. Replace delete with cancel.
- `PaymentReceipt` gets `status` (VALID / CANCELLED), `cancel_reason`, `cancelled_by`, `cancelled_at` and
  `replaces` (OneToOne to the cancelled receipt it replaces). Cancelling takes `amount_paid - overpaid_amount` off
  `invoice.total_paid`, takes `overpaid_amount` off `student.credit_balance` (refuse if that credit is already spent),
  then `settle_status`. Move the payment logic in `perform_create` into a service used by both "record" and "reissue".
- Correction goes through the existing change-request engine (`core/change_requests.py`): a `ReceiptHandler` with kind
  `RECEIPT`; action UPDATE = cancel and reissue with the corrected fields (date, amount, method, reference, type, month,
  notes); action DELETE = cancel only. Proposers: all roles; approvers: Supervisor and Management (their own corrections
  apply at once and are recorded). The reason (`note`) must be required even for approvers: add a `note_required` flag
  to the handler and check it in `submit`. The frontend reuses `ChangeRequestsPanel` (kind `RECEIPT`) for the queue.
- Cancelled receipts must stop counting: filter `status='VALID'` in `core/analytics.py` (line ~133),
  `billing/drilldown.py` (`receipts_matching`), `InvoiceSerializer.get_latest_receipt`, and on the frontend
  `BillingView` "Kutipan hari ini". Receipt numbers: `numbering.next_number` must still see cancelled numbers so they
  are never reused. Show cancelled receipts struck through with the reason and the replacement number; mark the PDF.
- Payment proof: new attachment kind `PAYMENT_PROOF` on `PaymentReceipt` (images + PDF, `upload_document_mb`), uploaded
  from the payment form after the receipt is created; `AttachmentList` on the receipt modal.
- Unpaid invoice edit: `POST /billing/invoices/{id}/edit/` with `monthly_fee`, `registration_fee`, `description`,
  `reason`; only when `total_paid == 0` and `credit_applied == 0`; recompute
  `total_payable = registration_fee + monthly_fee - discount_amount` (cap the discount at the fee) and the balance; log each
  edit in a new `InvoiceEdit` model (changes as `{field: [before, after]}`, reason, who, when) shown on the invoice.
- Tutup kaunter harian: new `DailyCashClose` model, one per date: `opening_float`, `cash_expected` (float + cash
  receipts), `cash_counted`, `difference`, `by_method` JSON (count and amount per method), `receipts_total`,
  `receipt_count`, `note`, `status` (CLOSED / RETURNED / VERIFIED), who closed and when, who verified and when, verify
  note. Admin closes (can redo while not verified); Supervisor verifies or returns it for a recount. Differences in red.
  Show "changed after closing" when the live total of that day differs from the snapshot.
- Admin daily checklist: items in a new Data induk list `27_daily_checklist` (defaults: tutup kaunter & kira tunai;
  kedatangan semua kelas diambil; peringatan yuran dihantar; nota / modul kelas esok disediakan; mesej ibu bapa dibalas),
  a `DailyChecklist` record per date (items ticked with who and when, Supervisor's check). The cash and attendance items
  can show what the system sees (close done; classes with attendance against `teachers.payroll.roster(date)`).
- Both pages under a new menu item (e.g. *Kaunter harian*), visible to all staff; Supervisor sees the verify buttons.

## Phase E: notifications and the week-5 rule

A notification bell per user. A monthly invoice still unpaid through weeks 3–4 of its month gives Supervisor a task in
week 5 (from day 29) to contact the parent, with WhatsApp / call buttons and an outcome. Fits between the existing
reminders and the 2-month arrears rule.

## Phase F: teacher private links and profile form

Pengurusan sends a teacher a private link (or a general link for applicants). The teacher fills in their details,
bank account, subjects, teaching experience, permit, photo and IC; it arrives as a teacher change request for approval.
Links can be cancelled.

## Phase I: QR self check-in

Printed QR per classroom → the class running there now → 4-digit class code from the whiteboard → the class list
(short names) → tap own name → IC last 4 digits the first time on a phone → Hadir / Lewat. The teacher's private link
page shows the code, the live list, marks pupils without phones and confirms; staff can do the same on Kedatangan.
One student per phone per class (second name flagged), wrong-IC lockout, rate limits, auto-absent at the end of class,
and each mark records its source (QR, teacher, staff) and time.

## Phase G: handouts

A handout belongs to a real class; copies needed come from the class's students; a received list per student, from
the last class's attendance, shows who still needs a copy.

## Phase H: performance analysis and two-way reports

A *Prestasi pelajar* dashboard of failing and falling students with subject, teacher, attendance in that class, mark
trend, notes and likely reasons, grouped by teacher and class. Teacher-about-student reports on the student profile;
student / parent-about-teacher reports join *Aduan*; each with details, comments, status and action (staff enter both).
