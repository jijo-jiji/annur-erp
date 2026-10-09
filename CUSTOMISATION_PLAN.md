# What Management can change themselves, and what must stay locked

Goal: after hand-over the centre should never need the developer to add a grade, a fee package, a class slot, a staff login or change a message. This plan sorts every business value in the system into three groups and orders the work.

Based on a read of the code (backend constants, `BusinessSetting`, master-data lists, frontend `lib/` files, the Settings screens) on branch `main`.

## 1. The rule used to decide

A value should be **editable by Management** when all of these are true:
1. The business changes it by choice (price, hours, wording, threshold), not because the law or an audit needs it fixed.
2. A wrong value cannot break data integrity or open a security hole.
3. Changing it does not silently rewrite history (old invoices, old payslips stay as issued).

A value stays **locked in code** when it is a security rule, an approval or audit rule, or the shape of a workflow that other code depends on.

## 2. Already editable today (no change needed)

| Area | Where | Who |
|---|---|---|
| Subjects (add, rename, stream, active) | Tetapan > Subjek | Supervisor, Management |
| Fee packages: groups, packages, per-subject rate, group name; grade → package | Tetapan > Pakej yuran, Data induk | Supervisor, Management |
| Standing discounts | Tetapan > Diskaun | Supervisor, Management |
| Registration fee, due day, months unpaid before termination, notice weeks, class capacity, session minutes | Tetapan > Polisi | Management |
| Teacher base rates (permanent / replacement) | Tetapan > Polisi | Management |
| Grades (name, order, level, next grade, fee package) | Data induk | Admin proposes, approver approves |
| School list, lead sources, parent age bands, exam types, drop reasons, expense categories | Data induk | same |
| Per-staff leave entitlement, job details, KPIs | Staff HR | Management |

## 3. Should become editable (gaps found)

### Priority 1: without these they still have to call you

| # | Item | Today | Plan |
|---|---|---|---|
| 1 | **Login accounts** (create staff login, choose role, disable, reset password) | Only through Django admin. The app can list accounts and link them to staff, nothing more. | New Settings tab "Pengguna". Management only. Cannot demote or disable the last Management account. Passwords set by Management are forced to change at first login. |
| 2 | **Class slots, operating days and hours, classrooms** | Slots and rooms exist in the database, no screen. Days are fixed in `lib/config.js`. | New tab "Jadual": add / edit / retire time slots (day, start, end, label), add / rename / retire classrooms, choose which days the centre opens. Retire instead of delete when a class uses it. |
| 3 | **Centre profile** (name, branch, address, phone, WhatsApp, TIN, bank details for payment) | Hard-coded twice: `frontend/src/lib/config.js` and `backend/core/pdf.py`. The `CENTER_*` settings rows in the database are not used by either. | One source: the existing `BusinessSetting` rows. Receipts, vouchers, payslips, login page and messages read them. Add TIN once the centre confirms it. |
| 4 | **Message wording** (about 12 WhatsApp texts: payment reminders, absence, reschedule, receipt, lead follow-up, registration) | Fixed text in 8 components. | Templates with placeholders such as `{parent}`, `{student}`, `{amount}`, `{due_date}`. Edit in Tetapan > Mesej, with a preview and "reset to default". |
| 5 | **Master-data lists that change nothing** | 12 of the 21 lists are not read by any code (see table below). Management can edit them and nothing happens, which is misleading. | Either connect each to the screen it belongs to, or hide it. See section 5. |
| 6 | **Exam grade bands** (A+ 90, A 80 ...) | Fixed in `students/views.py`. The list "13 Gred & jalur markah" exists but is not used. | Make the list the real source. Used when marks are saved; old results keep the grade they were saved with. |

### Priority 2: operating thresholds and lists

| # | Item | Today | Plan |
|---|---|---|---|
| 7 | **Voucher approval amounts** (Tier 1 under RM500, Tier 2 up to RM3,000, Tier 3 above) | Fixed in `expenses/views.py`. | Make the two amounts editable (Management). Who approves each tier stays locked, see section 4. |
| 8 | **Alert thresholds**: permit warning 60 days, contract end 30 days, birthday 7 days, low attendance 70%, nearly full class 2 seats, lead follow-up 7 days, attendance window 30 days | Fixed in `analytics.py`, `staff.py`, `leads.py`. | One "Amaran" group in Polisi with a range check on each number. |
| 9 | **Payment methods** (cash, DuitNow, FPX, card) | Fixed list in `models.py` and `format.js`. The master list "21 Kaedah pembayaran" is unused. | Drive the receipt method dropdown from the list. Keep the internal codes for existing receipts. |
| 10 | **Leave types and default entitlement** (AL, MC, EL, UL) | Fixed four types; entitlement set per staff. | Keep the four types (payroll and balances depend on them). Add a default entitlement per type applied to new staff. |
| 11 | **Student types, teacher types, teacher grade, teaching subjects** | Lists exist, not read. | See section 9 for the teacher lists (two types only, experience in years instead of a qualification list). Hide student types. |
| 12 | **Expense vendor list** | Separate vendor table with its own add form; list "20 Pembekal" duplicates it. | Remove the duplicate list. |

### Priority 3: nice to have

| # | Item | Plan |
|---|---|---|
| 13 | Invoice / receipt / voucher number prefix (`INV-2026-0001`) | Prefix editable, numbering sequence untouched. |
| 14 | Upload size limits (photo 5 MB, video 50 MB, handout 25 MB) | Editable inside a safe maximum set in code. |
| 15 | Lead stage names | Allow renaming the label only. The 8 stages and their order stay locked. |
| 16 | Dashboard targets (for example target monthly students) | Add only if the centre asks for targets. |

## 4. Must NOT be editable (and why)

| Item | Why it stays locked |
|---|---|
| **Roles and the permission matrix** (what Admin, Supervisor, Management may do) | A mistake could give everyone approval rights or hide records. Changing it is a code change with review. |
| **Who approves what** (Tier 2 = Supervisor or Management, Tier 3 = Management only; Supervisor timetable changes need Management) | This is the control the client asked for. It must not be editable by the people it controls. |
| **Status workflows** (voucher, invoice, payroll, registration, reschedule, leave) | Other code and reports depend on the exact states. |
| **Issued documents**: invoice amounts, receipts, payslips, approved vouchers | They are financial records. Corrections go through adjustment or reversal with a reason, never an overwrite. |
| **Audit logs and number sequences** | Evidence. Never editable or deletable from the app. |
| **Uploaded-file type allow-list** (no scripts, no executables) | Security. Only the size limits may move (item 14). |
| **Server settings** (allowed hosts, debug, secret key, CORS, tunnel) | Security and deployment, owned by whoever hosts it. |
| **Calculation formulas** (pro-rating, arrears, payroll total, per-subject beyond a package) | Only their inputs (rates, days, limits) are editable. A formula change needs a developer and tests. |
| **Deleting master values or packages that are in use** | Retire (hide from new entries) instead, so history still reads correctly. |
| **Management accounts**: removing the last one | Would lock the centre out. |

## 5. The 12 master-data lists that currently change nothing

No code reads these by category key (checked by searching backend and frontend). Decide per list: connect it, or hide it from Data induk so nobody edits something with no effect.

| List | Recommendation |
|---|---|
| 2 Subjek diminati | Connect to the interest choices on the parent QR form and the lead form (they now use the subject list). Or hide. |
| 4 Jenis pelajar | Hide. Student types (monthly / walk-in) drive billing and must stay fixed. |
| 5 Gred | Hide. Replaced by list 1 (grades). |
| 8 / 9 Subjek kelas bulanan / walk-in | Hide. Subjects are managed in Tetapan > Subjek. |
| 11 / 12 Gred / subjek akademik | Hide, or connect when an academic report needs them. |
| 13 Jalur markah | Connect (item 6). |
| 15 / 16 / 17 Kategori, subjek, gred guru | See section 9: keep 15 with two types (remove Specialist), hide 16 and 17. |
| 20 Pembekal | Hide. Vendors have their own form. |
| 21 Kaedah pembayaran | Connect (item 9). |

(The original requirement lists all 21, so hiding is a decision for the client, not only for us.)

## 6. Rules for everything that becomes editable

1. **Who:** Management edits money, thresholds, accounts and centre profile. Supervisor edits operational lists (subjects, packages, slots). Admin may only propose.
2. **Check the value:** every number has a minimum and maximum (a due day of 1 to 28, a percentage 0 to 100). Reject values outside the range with a clear message.
3. **Not retroactive:** a new fee or rate applies to invoices raised after the change. Issued invoices, receipts and payslips keep their amounts.
4. **Audit:** record who changed what, old value, new value, when. Shown in a "Sejarah perubahan" list under Tetapan.
5. **Safe delete:** anything used by existing records can be retired, not deleted.
6. **Reset:** every template and threshold shows its default and has a reset button.
7. **Tell the user the effect** before saving (for example "applies to 3 grades and 41 students from the next invoice run").

## 7. Build order

| Phase | Work | Size | Done when |
|---|---|---|---|
| A | Settings audit log and a typed, range-checked settings table (foundation for all below) | Small | Every setting change appears in the history with who and when. |
| A2 | Change-request mechanism (propose, approve with comment, notify) for subjects, vendors, categories, new teacher, fee packages, discounts. | Medium | An Admin proposes a subject, a Supervisor approves it, and it becomes usable only then. **Built for subjects, vendors, expense categories / subcategories / monthly budget, teachers (add, change details, active / inactive), fee packages and discounts (2026-10-05 and 2026-10-06). Every item listed for this phase is now done.** |
| B | Login accounts screen (item 1) | Medium | Management creates a Supervisor, that person logs in and sees only Supervisor screens; last Management account cannot be removed. **Built (2026-10-06): Settings > Pengguna.** |
| C | Slots, days, classrooms (item 2) | Medium | A new Saturday 20:30 slot and a new room can be used in the timetable form with no developer. **Built (2026-10-06): Settings > Slot & bilik, with closed dates.** Not done: a centre-wide default working time and days for new staff (still set per staff member). |
| D | Centre profile in one place (item 3) | Small | Changing the phone number updates the login page, receipt PDF and voucher PDF. **Built (2026-10-09): Settings > Pusat**, with a change history. |
| E | Message templates (item 4) | Medium | Editing the payment reminder changes the WhatsApp text on the next click. |
| F | Master-data clean-up, mark bands, payment methods, and the teacher changes in section 9 (Part-time label, per-session pay entry, years of experience, drop the unused increment %) | Medium | No list in Data induk is editable without effect; a permanent teacher can be recorded as part-time for one session at a typed amount; the teacher profile shows years of experience. |
| G | Thresholds and voucher amounts (items 7, 8, 10) | Small | Changing the voucher Tier 1 limit moves a RM600 voucher to the right approver. |
| H | Priority 3 items if requested | Small each | As agreed. |

Every phase ships with backend tests (permission, range check, not-retroactive) and a browser check of the screen, as done for the fee packages.

## 8. Decisions (answered by the user on 2026-10-04)

| Question | Answer | What it means for the build |
|---|---|---|
| Working days and hours | Kelantan's weekend is Friday and Saturday. | There are two separate things, and both must be editable. (1) **Class days and times** come from the slots in item 2. The system already has Friday and Saturday classes and no Sunday, so nothing is assumed: the centre defines its own days and slots. (2) **Office staff hours** (08:30 to 17:30, Monday to Saturday) are only the default for new staff and are already editable per person. Phase C adds a centre-wide default for new staff, and a list of closed dates (public holidays, Kelantan state holidays) so attendance and payroll do not count them. |
| WhatsApp | Staff presses send (as today). | No WhatsApp Business API. Phase E only makes the wording editable. |
| Centre TIN and bank details | Centre will set up later. | Phase D adds the fields, empty by default. They print on receipts and vouchers only once filled in. |
| Who creates logins | Management only. | Phase B is Management only. |
| Voucher limits RM500 / RM3,000 | Keep as default, but editable. | Phase G: defaults stay 500 and 3,000, Management can change them. |
| Teacher category, subject and grade lists | Only Permanent and Part-time. Qualification is by years of teaching. The centre decides pay itself and records it. | Section 9 rewritten to match. |

## 9. Teachers: types, experience and pay (revised after the centre's answer)

The centre's rules, as given on 2026-10-04:
- Qualification is judged by **how long the person has been teaching**, not by degrees.
- The system **does not decide what a teacher is paid**. The centre decides and records it.
- There are only **two kinds of teacher: Permanent and Part-time**. Outside help for an event is recorded as Part-time. A permanent teacher can sometimes work as a part-time (replacement) teacher.

What this changes in the system:

| Topic | Today | Change |
|---|---|---|
| Teacher types | Permanent and "Replacement" (shown as "Guru ganti", "Cikgu Ganti Aktif"). Master list 15 also has a "Specialist" entry that nothing uses. | Keep the two types. Rename the label "Replacement / Guru ganti" to **"Sambilan (Part-time)"** everywhere. The stored code stays `REPLACEMENT` so no data changes. Remove "Specialist" from list 15. |
| Permanent teacher working as replacement | Already possible: any teacher can be chosen as the replacement for a class and the session is counted under "as replacement". | Keep. Add a visible "Sambilan" tag on that session in the roster and on the payslip, so it is clear which sessions were done in that role. |
| Pay rate | Each teacher has their own RM per session, and a session is paid at the rate of the teacher who taught it. The payslip can be adjusted by hand. A rate rise goes through Supervisor and Management approval and is recorded. | Keep all of this, because it already records the centre's decision. Add one thing: the **pay for a single session can be typed in** on the teacher attendance screen (pre-filled with the teacher's rate), for cases such as a permanent teacher covering at a different amount or a one-off event. |
| "Base rate by type" and "annual increment %" in Tetapan > Polisi | Shown, but **no calculation uses them**. They suggest the system decides pay. | Remove the annual increment %. Keep the base rate only as the **starting value that pre-fills the rate when a new teacher is added** (still editable per teacher). Rename it "Kadar permulaan guru baharu". |
| Qualification (lists 16 and 17) | Lists exist, nothing reads them. | Hide both lists. The teacher already has subject ticks (replaces list 16). Add a **"Mula mengajar" date** on the teacher profile (can be before joining the centre); the screen shows **"X tahun pengalaman"** from it. Informational only, never used in pay. |

Nothing in this section changes who may approve a pay rate, or the payroll approval steps. Those stay locked (section 4).
