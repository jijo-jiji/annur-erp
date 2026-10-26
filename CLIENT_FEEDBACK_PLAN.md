# Client feedback, October 2026

**Status:** in progress. Phases are built in the order below; each phase is marked done here, with what changed while
building it, before the next one starts.

| Phase | Work | Status |
|---|---|---|
| A | Quick fixes: voucher subcategory, red highlights, supplier code + type, resubmit rejected registration, subject categories, substitute warning, teacher filters, WhatsApp preview & edit | **Done** 25 Oct 2026 |
| B | Student code `HQ-YY0000` and renumbering | **Done** 25 Oct 2026 |
| C | School exam results: terms per year, grid entry, public results form + review queue, student and class statistics | **Done** 25 Oct 2026 |
| D | Fees: payment proof, receipt correction, unpaid invoice edit; daily counter close; Admin daily checklist | **Done** 26 Oct 2026 |
| E | Notifications and the week-5 unpaid rule for Supervisor | **Done** 26 Oct 2026 |
| F | Teacher private links and the public teacher profile form | **Done** 26 Oct 2026 |
| I | QR self check-in for student attendance | **Done** 26 Oct 2026 |
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

### Phase D: what was built

| Where | What |
|---|---|
| Yuran & resit → **Rekod bayaran** | New box *Bukti bayaran (pilihan)*: the parent's slip or screenshot (image or PDF) goes on the receipt once it is issued. More can be added later from the receipt. |
| Receipt → **Bukti bayaran**, **Betulkan resit**, **Batalkan resit** | A receipt is never edited or deleted (the delete call was removed). *Betulkan* asks for the corrected date, amount, method, reference, type, month or note; *Batalkan* only cancels. A reason is always required. Admin's requests wait for Supervisor or Management; theirs apply at once. On approval the old receipt is cancelled (its amount comes off the invoice again, its overpayment off the student's credit) and, for a correction, a new receipt with a new number replaces it. Refused when the overpayment credit has already been used on another invoice. |
| Resit list, receipt, PDF | Cancelled receipts stay in the list struck through with *Dibatalkan · diganti REC-…*; the new one says *Menggantikan REC-…*. The receipt and its PDF show *DIBATALKAN*, who, when and why. The proof of the original receipt shows on the new one. WhatsApp is not offered for a cancelled receipt. CSV has a Status column. |
| Invois → **Ubah** (unpaid invoices only) | Fee, registration fee or description, with a reason, through the same approval as receipts. Refused once anything is paid or credited. A discount from a code follows the new fee (a percentage is worked out again). |
| Yuran & resit → **Pembetulan** tab | Receipt corrections and invoice changes waiting for a decision, and the decisions (the invoice change history). The requester can revise or withdraw until it is decided. Ringkasan links each waiting request here. |
| **Kaunter harian** (new menu item, all staff) → *Tutup kaunter* | The day's valid receipts by method, cash expected (opening float + cash receipts), cash counted, the difference in red with a required explanation. Admin closes (and may close again until it is verified); Supervisor or Management verifies it or returns it for a recount with a note. Nobody verifies a close they made, except Management. A receipt added or cancelled for that day afterwards shows *Berubah* with the old and new totals. Month history, any past date. |
| Kaunter harian → *Senarai semak* | The day's checklist from Data induk → **Senarai semak harian** (5 default items). Staff tick items (who and when is kept); the cash, attendance and reminder items show what the system sees beside them. Supervisor or Management checks the day once (a note is required if anything is not ticked); the list and ticks are then locked as they were. |
| Ringkasan | *Kaunter … belum ditutup* (days in the last week with takings and no close), closes returned for a recount, and closes waiting for the person's check. |

Changes from the design notes, found while building:
- The invoice edit uses the change-request engine (kind `INVOICE`) instead of a separate `InvoiceEdit` model, so it gets the
  same approval, reason, before / after and history as receipt corrections without a second mechanism. Admin can no longer
  change an invoice on their own; Supervisor and Management's changes apply at once.
- `replaces` uses `SET_NULL`, not `PROTECT`: receipts are only ever deleted together with their student or invoice, and
  `PROTECT` would have blocked deleting a student whose receipts were corrected.
- Cancelled receipts are left out of every money figure: Ringkasan, Laporan, the drill-down lists (`receipts_matching`),
  the invoice's latest receipt and *Kutipan hari ini*. Their numbers stay in use, so a number is never given out twice.
- Change requests can now ask for a reason even from an approver (`note_required`), name their actions per kind
  (*Betulkan* / *Batalkan* instead of *Ubah* / *Padam*), and be listed for several kinds or one record (`kind=RECEIPT,INVOICE`, `target=`).

Data: `PaymentReceipt.status`, `cancel_reason`, `cancelled_by`, `cancelled_at`, `replaces`; new `DailyCashClose` (billing) and
`DailyChecklist` (core); attachment kind `PAYMENT_PROOF`; Data induk list `27_daily_checklist` (`meta_info.order`, `meta_info.auto`).
APIs: `/billing/cash-close/` (GET, POST), `/billing/cash-close/history/`, `/billing/cash-close/verify/`, `/billing/cash-close/return/`,
`/checklist/`, `/checklist/tick/`, `/checklist/check/`; change requests of kind `RECEIPT` and `INVOICE`.

Tests: `PhaseDFeesAndCounterTests` (9 tests); full backend suite 264 tests OK; browser `e2e/counter.spec.js` (5 tests).

Before Phase D the branch took in `main`'s phone number work (one stored form, one display). The public results form from
Phase C now keeps the sender's number in that form, and the tests from Phases A to C were brought up to date with the phone
rule and the new student codes (see the merge commit).

## Phase E: notifications and the week-5 rule

A notification bell per user. A monthly invoice still unpaid through weeks 3–4 of its month gives Supervisor a task in
week 5 (from day 29) to contact the parent, with WhatsApp / call buttons and an outcome. Fits between the existing
reminders and the 2-month arrears rule.

### Phase E: what was built

| Where | What |
|---|---|
| **Bell** beside the centre's name (desktop) and in the top bar (phone) | Each person's own notices, newest first, with the unread count. Opening one marks it read and goes to the page that deals with it; *Tandakan semua dibaca* clears the rest. Checked every minute, when the window regains focus and on every page change. |
| Who is told about what (`backend/core/notify.py`) | A change request (subjects, vendors, categories, teachers, fees, discounts, slots, rooms, closed days, receipt corrections, invoice changes) reaches whoever may decide that kind; the decision reaches the person who asked. A registration (counter, parent's QR form, sent again) reaches Supervisor and Management; the decision reaches Admin. A voucher reaches the approvers of its tier (none below the counter limit); the decision reaches the person who prepared it. Leave reaches the approvers (an approver's own leave goes to Management only); the decision reaches the applicant. Extra / cancelled classes reach Supervisor, then Management to verify. Master timetable changes, rate increases and teacher pay to approve reach Management; verified, approved or rejected pay reaches the next person. The counter close reaches the checkers (not the closer); their decision reaches the closer. Results from the parents' form reach Admin and Supervisor. Week-5 tasks reach Supervisor (Management when there is none), once a day. |
| Yuran & resit → Tunggakan & susulan → **Minggu 5: hubungi ibu bapa** | Monthly invoices still unpaid in week 5 (from day 29, or the last day of a shorter month such as February) whose due date was before week 5. Supervisor or Management uses WhatsApp (new editable message *Susulan yuran minggu 5* in Tetapan → Mesej) or the phone button and records how they reached the parent and the outcome (will pay this week, promised date, already paid, hardship, stopping, no answer, other); it can be updated while the invoice is unpaid. A paid invoice closes the task. Admin sees the list and outcomes without the buttons. The month before is caught up if nobody opened the system in its week 5; older months belong to the arrears rule. |
| Ringkasan | *n yuran perlu dihubungi (minggu 5)* for Supervisor and Management. |

Changes from the plan, found while building:
- Vouchers now keep the login that prepared them (`prepared_by_user`), so a decision can reach that person. Vouchers made
  before this have none and their decisions reach nobody's bell (they still show on the voucher).
- A notice is saved in the same transaction as the action that caused it, inside its own savepoint: an action that fails
  leaves no notice, and a notice that cannot be saved never stops the action (it is logged). Under `manage.py test` a
  notice that cannot be saved fails the test instead (`NOTIFY_STRICT`), so a mistake in `notify.py` cannot hide. This
  found a wrong field name in the leave notice while building.
- The staff leave page and the extra / cancel class page now read their tab from the address, so a notice opens the
  right tab (`#/staff?tab=leave`, `#/reschedules?tab=pending`).
- Tasks are made when Ringkasan or the follow-up list is opened; `manage.py week5_followups` does the same for a daily
  schedule (deploy/DEPLOYMENT.md, *Scheduled jobs*).

Data: `core.Notification` (user, title, body, link, key, read), `billing.PaymentFollowUp` (one per invoice: outcome, channel,
promised date, note, who and when), `PaymentVoucher.prepared_by_user`. APIs: `/notifications/`, `/notifications/read/`,
`/billing/follow-ups/`, `/billing/follow-ups/<id>/record/`; dashboard `approvals.fee_followups_open`.

Tests: `PhaseENotificationsAndWeek5Tests` (9 tests); full backend suite 273 tests OK; browser `e2e/notifications.spec.js` (2 tests).

## Phase F: teacher private links and profile form

Pengurusan sends a teacher a private link (or a general link for applicants). The teacher fills in their details,
bank account, subjects, teaching experience, permit, photo and IC; it arrives as a teacher change request for approval.
Links can be cancelled.

### Phase F: what was built

| Where | What |
|---|---|
| Guru → **Pautan guru** (Pengurusan only) and *Pautan* on a teacher's row | *Pautan untuk guru* makes a personal link (a new one stops the teacher's old link); *Pautan pemohon* makes one general link for applicants, with a name and an optional end date. The full link is shown once, with Copy, a QR code and *Hantar melalui WhatsApp* (new editable message *Pautan peribadi guru*). The list shows who made each link, when it was last used, how many forms came through it and whether one waits; *Batalkan* stops a link at once. |
| `#/guru/<link>` (public, phone-first, no login) | A teacher sees their current details and changes their name, phone, e-mail, bank and account number, subjects (grouped by level), start of teaching and permit expiry, and attaches a photo, an IC copy and a permit copy. An applicant fills in the same plus their experience. Sending again before a decision replaces the waiting form (and any file sent again). A cancelled, replaced or expired link, or the link of a teacher who is no longer active, says so. |
| Guru → **Permohonan** | The form arrives as a teacher change request (*Oleh … (pautan guru)* / *(borang pemohon)*) with *Dokumen: Gambar, Salinan IC* and the files to open. Approving a teacher's form applies it; the photo becomes the teacher's photo and the copies join their documents. An applicant has no code or rate yet: *Luluskan* asks for the code, category, starting rate and joining date. Rejecting deletes the files sent with it. The tab reloads each time it is opened, since forms arrive at any time. Management is told in the bell. |
| Guru → teacher row → **Dokumen** | The teacher's photo and documents (IC, permit, other), for Supervisor and Management only. |

Changes from the plan, found while building:
- Only a SHA-256 fingerprint of each link is stored, so a lost link cannot be shown again; making a new one replaces it.
- The rate limits on all three public pages never worked: DRF's `ScopedRateThrottle` takes its scope from the view, and
  these function views have none, so the parents' QR form (from before this plan) and the results form (Phase C) had no
  limit. They now share `core/throttles.py`, which limits each visitor's address; a test checks that the 21st QR
  registration in an hour is refused. The teacher link allows 60 an hour.
- The change-request engine gained two small hooks: values the decider fills in when approving (`decider_fields`, used for
  an applicant's code and rate) and a tidy-up after rejection (`on_reject`, used to delete a rejected person's IC copy).
- A notice in the bell that points to the page already open now reopens that page, so it lands on the right tab; the fee
  corrections tab also reloads when opened.

Data: `teachers.TeacherLink` (kind, teacher, fingerprint, last characters, name, end date, who made / cancelled it, last use,
forms sent, latest request); attachment kinds `TEACHER_PHOTO`, `TEACHER_DOC`, `TEACHER_FORM`; document types `PERMIT`, `PHOTO`.
APIs: `/teachers/links/` (Management: list, create, `revoke`), `/public/teacher-link/<link>/` (GET, POST); change request
approve takes `changes`.

Tests: `PhaseFTeacherLinkTests` (5 tests); full backend suite 278 tests OK; browser `e2e/teacher-links.spec.js` (2 tests).

## Phase I: QR self check-in

Printed QR per classroom → the class running there now → 4-digit class code from the whiteboard → the class list
(short names) → tap own name → IC last 4 digits the first time on a phone → Hadir / Lewat. The teacher's private link
page shows the code, the live list, marks pupils without phones and confirms; staff can do the same on Kedatangan.
One student per phone per class (second name flagged), wrong-IC lockout, rate limits, auto-absent at the end of class,
and each mark records its source (QR, teacher, staff) and time.

### Phase I: what was built

| Where | What |
|---|---|
| Tetapan → **Slot & bilik** → *QR kehadiran* on a room (Supervisor, Management) | A poster with the centre's name, the room and its QR, to print and put up in the room. *Buat QR baharu* replaces it; the old poster then says it is no longer used and to ask the teacher for the code. |
| `#/hadir/<room>` (public, phone-first, no login) | Shows the class running in that room now (or when scanning opens for the next one). The student types the 4-digit code from the whiteboard, taps their name in a list of short names (*Ahmad D.*), and the first time on that phone types the last 4 digits of their IC. They see a large **Hadir** or **Lewat** with the time; *Pelajar lain* lets a friend without a phone use the same phone. `#/hadir` without a room works with the code alone. |
| `#/guru/<link>` → **Kelas hari ini** (the teacher's private link from Phase F now opens here) | Each of the teacher's classes today: times, when scanning opens and closes, the code for the whiteboard once scanning is open, the live list (refreshed every 15 seconds) with how each student was marked and when, any shared-phone flag, buttons to mark a pupil Hadir / Lewat / Tidak hadir, and *Sahkan senarai*: students still not marked become absent and the list is locked. *Maklumat saya* is the Phase F form. |
| Kedatangan pelajar → today's class → **Kedatangan QR** | Staff can open the code (*Buka kod kelas*), see how many have scanned, reload, and confirm the list. Each student's row shows how they were marked (*Imbasan QR · 08:50*, *Guru*, *Senarai ditutup*), any flag, and *Belum direkod* while not yet marked. Staff can still change any mark and save as before; a mark staff leave as it was keeps who made it. |
| Tetapan → Had & amaran → **Kedatangan QR** | Scanning opens 15 minutes before the start and closes 30 minutes after; a student is late after 10 minutes (client decision 12). All three are settings; late cannot be after closing. |

Rules and safeguards (backend `students/checkin.py`):
- A new 4-digit code for each class each day, unique among the day's classes; it only works while scanning is open and
  until the list is confirmed, and from a room's QR only for a class in that room.
- The phone keeps a random number of its own; the server stores only a fingerprint of it per student, so a student is
  asked for the IC digits once per phone. A second name checked in from the same phone in the same class is recorded
  with a flag for the teacher (*Telefon yang sama dengan Ahmad D.*); the teacher or staff marking that student clears it.
- Five wrong IC tries lock that student's check-in for an hour (the teacher can still mark them). The public check-in
  calls are rate limited per address at 600 an hour, since a whole class on the centre's wifi shares one address.
- A QR scan never changes a student already marked present; it can turn an absent mark into present (they came late).
- At the end of class an open list closes by itself (whenever the day's attendance is looked at, and nightly by
  `manage.py close_checkins`): students not checked in become absent, source *Senarai ditutup*.
- Every mark records its source (Staf, Guru, Imbasan QR, Senarai ditutup) and time. Absences from QR count everywhere
  attendance already counts: the class and student attendance figures, the low-attendance warnings, and *Maklumkan ibu
  bapa*.

Changes from the plan, found while building:
- The code is made only once scanning is open. At first the teacher's page made codes for every class as soon as the
  link was opened, so a teacher looking at it in the morning would have started check-in for classes that took
  attendance on paper, and those classes would then have been marked absent at the end. A list nobody used (no scans,
  no marks) now closes without marking anyone absent and says so.
- The rate limit tests of the older public forms could fail depending on test order, because the limits (working since
  Phase F) counted posts across tests. The test bases now reset them before each test. The Phase F browser test could
  also pick the file row inside a teacher's request instead of the request itself; it now picks the request.

Data: `students.ClassCheckIn` (class, date, code, opened, confirmed at / by), `students.StudentDevice` (student, phone
fingerprint, first and last use); `StudentAttendance` gains source, marked at, phone fingerprint and flag (existing marks
become *Staf*); `Classroom.checkin_key`; settings `CHECKIN_OPEN_BEFORE`, `CHECKIN_OPEN_AFTER`, `CHECKIN_LATE_MINUTES`.
APIs: `/public/checkin/room/<key>/` (GET), `/public/checkin/code/` and `/public/checkin/mark/` (POST),
`/public/teacher-link/<link>/classes/` (GET) and `.../classes/<id>/` (POST mark / confirm), `/attendance/checkin/` (GET,
POST open / confirm), `/academic/classrooms/<id>/checkin_key/` (POST, Supervisor and Management); the roster API returns
each mark's source, time and flag. Cron: `close_checkins` nightly (deploy/DEPLOYMENT.md).

Tests: `PhaseIQRCheckInTests` (6 tests); full backend suite 284 tests OK; browser `e2e/checkin.spec.js` (1 test, which
makes its own class that started a few minutes ago, with `e2e/support/checkin_class.py`, and removes it afterwards).

## Phase G: handouts

A handout belongs to a real class; copies needed come from the class's students; a received list per student, from
the last class's attendance, shows who still needs a copy.

## Phase H: performance analysis and two-way reports

A *Prestasi pelajar* dashboard of failing and falling students with subject, teacher, attendance in that class, mark
trend, notes and likely reasons, grouped by teacher and class. Teacher-about-student reports on the student profile;
student / parent-about-teacher reports join *Aduan*; each with details, comments, status and action (staff enter both).
