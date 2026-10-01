# Pusat Tuisyen An Nur — Requirement vs Implementation

**Source requirement:** `Enquiry Software Requirement.pdf` (j-status.doc, 10 pages)
**Audited against:** the code on `main` (including uncommitted work), 29 Sep 2026, after Phase 2
**Replaces:** the earlier versions of this file. The first marked everything "100% Implemented", which was not accurate.

## Legend

| Mark | Meaning |
|---|---|
| ✅ | Done: stored in the database, served by the API, shown in the UI |
| 🟡 | Partial: exists but missing fields or logic |
| ❌ | Missing: not built |

No screen shows hardcoded sample data any more, so the earlier "sample only" mark is no longer used.

## 1. Summary

Roughly **85% of the requirement works end to end.** Phase 2 added the records the reports depend on: student history, student attendance, registration approval, waiting lists, overpayment credit and master lists. Every screen now reads and saves real data.

### Done in Phase 2

- Registration waits for Supervisor approval. Approval raises the first invoice (registration fee + first month from the fee packages); rejection needs a reason and frees the seats.
- Registration form: two parents with age band and preferred contact, school and lead source from master lists, real remaining seats, waiting list for full classes, walk-in description and subjects.
- Parent QR form submits to the system as a pending registration. The counter screen shows a printable QR code.
- Student history: add/drop with reason, class change, on hold (with end date), resume, terminate with reason, notes. Filterable report (today, week, month, custom) with CSV.
- Student attendance per class per day with notes; rates as % and fraction; dashboard alert below 70%.
- Exam results entry per student, and the 3/6/9-month improvement report.
- Special monthly fee (Supervisor/Management only).
- Billing: payment type (registration, monthly, seminar, outstanding), month, notes, overpayment kept as credit. Receipt and invoice numbers restart each year.
- Vouchers numbered `PVYY-MM01`; category and subcategory from master lists; budget vs actual report.
- Dashboard and Reports: students per month (this year vs last), new vs left, period of stay, drop reasons, per-class attendance.
- Sample data removed from Staff HR, Handouts, Billing and Vouchers.

### Done in Phase 3 so far

- Lead funnel: the 8 stages, campaign, activity log per lead, one-week follow-up reminders, "not interested" with reason, conversion rate per stage, and pie charts by source, stage and campaign.
- Monthly invoicing: a monthly run (preview, then generate; safe to repeat) that bills active monthly students from their fee package or special rate, skips students on hold, applies their recurring discount and uses their credit. It can also be scheduled (`python manage.py generate_monthly_invoices`). The dashboard warns when students have no invoice for the month.
- Discounts: discount types with voucher codes (RM or %), validity dates and usage limits, maintained by Supervisor / Management. Recurring discounts are assigned in the student profile; one-off codes are applied to an invoice.
- Invoices are marked overdue automatically; amounts can no longer be edited directly (only through payments, discounts and credit). "Other" invoices for seminars and similar charges.
- Teacher attendance per class session: the day's classes (weekly timetable plus replacement / extra classes from the cancel-and-replace log), present / absent / replaced / cancelled, reason of leave and replacement teacher, with a monthly attendance report. Admin records it without seeing pay.
- Teacher payroll: calculated from attendance at the rate of whoever taught, +/- adjustment with reason for under / over payment, Supervisor verifies, Management approves or rejects with a reason, payment recorded (date, method, reference, by whom), payslip to print and send by WhatsApp, and payment history per teacher. Attendance is locked once the month's pay is verified.
- Staff HR: full profile (auto staff ID, personal details, emergency contact), job details only Management can change with an automatic history, login account link, clock in / out for your own record with late and early leave worked out from each person's working hours, time corrections with a reason, leave counted in working days against a yearly entitlement (balance checked on approval; nobody approves their own leave except Management), KPI set / review / achievement, a record log, monthly attendance and yearly leave reports, and contract-end (1 month) and birthday alerts.
- File uploads: student and staff photos, parent / student feedback with photos and videos (plus a feedback gallery by form and date), staff supporting documents (IC, resume, offer letter; locked once sent), voucher attachments (locked once the voucher is decided), recipient signature drawn on screen, and handout files. Files are checked by content, stored outside any public address and only served to logged-in users allowed to see them.
- Payment follow-up: the outstanding list shows the week of the month (2 to 5) or arrears, the WhatsApp reminder wording follows it, and each reminder is recorded.

### Done in Phase 4

- Pie charts on the dashboard (students by form, student status, school category, subjects per form, collection status) and a results graph per student.
- PDF receipts and teacher payslips generated by the server.
- Configurable grade list (master data: code, name, level, order, next grade, description) used by every form field, with a year-end "naik tingkatan" promotion (preview, then apply; logged in each student's history).
- Master timetable: Supervisor changes wait for Management approval or rejection. Extra / cancel classes: Supervisor approves or rejects with a reason; Management verifies.

### Main gaps

1. **WhatsApp is manual**: buttons open WhatsApp with a message; nothing is sent automatically.

## 2. Cross-cutting requirements

| Requirement | Status | Notes |
|---|---|---|
| Users: Admin 1, Admin 2, Supervisor, Management | ✅ | Token login; role from user group; `seed_users` creates the four accounts |
| Approve/reject with comment | ✅ | Registrations, vouchers, leave, master data, rate increments, teacher pay, master timetable, extra / cancel classes |
| Approval status notified | 🟡 | Dashboard notification centre lists pending items; no stored notifications |
| PIC edits until approved; then only approver | 🟡 | Enforced for registrations, vouchers and master data |
| `**` fields as configurable drop-downs | ✅ | School, lead source, parent age, exam type, drop reason, expense category/subcategory, grade (form) |
| Computer / tablet / phone friendly | 🟡 | Responsive layout; parent QR form checked at phone width; not tested on real devices |
| Parent QR self-registration | ✅ | Public form at `#/daftar`, throttled; arrives as pending. Needs the public (Cloudflare) address to work from parents' phones |

## 3. Dashboard (page 1)

| # | Requirement | Role | Status | Notes |
|---|---|---|---|---|
| 1 | Total students | Admin | ✅ | |
| 2 | Active monthly by grade | Admin | ✅ | By form |
| 3 | Total walk-in | Admin | ✅ | |
| 4 | Total by event | Admin | ❌ | No event model |
| 5 | Total inactive | Admin | ✅ | Plus on-hold |
| 6 | Student details by grade, export to Excel | Admin | ✅ | CSV export on the student list (opens in Excel) |
| 7 | Notification centre (work to do, approval status) | Admin | ✅ | Includes pending registrations and waiting list |
| 8 | Student growth % vs previous month | Sup | ✅ | |
| 9 | Pie: distribution by form | Sup | ✅ | |
| 10 | Pie: subjects per form | Sup | ✅ | |
| 11 | Line: students per month, line per year | Sup | ✅ | This year vs last |
| 12 | Line: new vs new-inactive | Sup | ✅ | |
| 13 | Pie: active / on hold / inactive | Sup | ✅ | |
| 14 | Pie: school category | Sup | ✅ | |
| 15 | Bar: period of stay | Sup | ✅ | |
| 16 | Notification centre (work, approve/reject, alert) | Sup | ✅ | |
| M1 | Staff birthday | Mgt | ✅ | Office staff; also contract-end alerts |
| M1 | Nearly full / full class | Mgt | ✅ | From real enrolments |
| M1 | Attendance < 70% | Mgt | ✅ | Last 30 days, per class |
| M2 | Sales growth | Mgt | ✅ | This month's collection vs last month |
| M3 | Pie: collection status | Mgt | ✅ | |

## 4. Lead Funnel (page 2)

| Requirement | Status | Notes |
|---|---|---|
| Date, name, phone, form, interested subject | ✅ | |
| Lead source (FB, TT, Walk-in, Friend, School, Teacher, Referral, Booth, Google, Website) | ✅ | Master list |
| Campaign | ✅ | Free text with suggestions from earlier campaigns |
| 8 conversion stages | ✅ | Enquiry → Contacted → Content 1 → Content 2 → Free Trial → Waiting Payment → Registered → Active, plus "not interested" with reason |
| Activity log per stage (date, action, remark, PIC, status) | ✅ | Stage moves are logged automatically |
| Reminder one week after each action | ✅ | Staff can set another date; overdue follow-ups show on the dashboard |
| Listing by stages | ✅ | 8-column board, filters, CSV |
| Pie: lead source; pie: conversion stage | ✅ | Plus campaign and reasons for not joining |
| Conversion rate per stage | ✅ | |
| Convert lead to student | ✅ | Pending registration; approval moves the lead to Active, rejection sends it back to Waiting Payment |

## 5. Student Registration (pages 2–4)

| Requirement | Status | Notes |
|---|---|---|
| Picture | ✅ | |
| Name, ID (auto), IC, type, phone, email, address | ✅ | ID `AN-YYYY-001` |
| WhatsApp / call / email buttons | ✅ | |
| Grade `**` (code, name, next grade, description) | ✅ | Master data; year-end promotion uses the next grade |
| School `**` (category, code, name) | ✅ | Master list |
| Join date, lead source | ✅ | |
| Two parents + preferred contact | ✅ | |
| Parent age | ✅ | Age band from master list |
| Subjects with class type and remaining seats | ✅ | Real seat counts |
| Waiting list if full | ✅ | Supervisor can enrol over capacity (seats go negative, e.g. −1) |
| Walk-in description and subjects | ✅ | Walk-in students get no monthly invoice |
| Results (exam type, grade, subject, gred) | ✅ | Entered from the student profile |
| Monthly payment automation | ✅ | Monthly run with preview; can be scheduled for the 1st of each month |
| Discount (type, voucher code, RM) | ✅ | RM or %, recurring or one-off, validity and usage limit |
| Over/underpayment | ✅ | Partial payment leaves a balance; overpayment becomes credit |
| Payment record with receipt | ✅ | PDF receipt |
| Special case: rate / non-minimum subject | ✅ | Special fee; below-minimum uses the per-subject rate |
| History: add/drop + reason, class change, on-hold, terminate, notes | ✅ | |
| Feedback with picture/video | ✅ | Recorded in the student profile; also appears in the history report |
| Supervisor approve/reject registration | ✅ | Reason required to reject |
| Add to WhatsApp group; auto greeting; payment follow-up w2–w5 | 🟡 | Follow-up week shown with matching WhatsApp message and a record of reminders sent (semi-automatic); group and greeting ❌ |
| Listing: active by grade; inactive; on hold | ✅ | With CSV |
| Listing: attendance by class | ✅ | |
| Reports daily/weekly/monthly/custom (registered, add/drop, on hold, terminate, D–F results, attendance, feedback) | ✅ | |
| Charts: drop reason, result improvement 3/6/9 months | ✅ | |
| Per-student result graph | ✅ | |
| Gallery: feedback | ✅ | Filter by form and date |

## 6. Teachers (pages 4–6)

| Requirement | Role | Status | Notes |
|---|---|---|---|
| List by form/subject, without rate; inactive list | Admin | ✅ | |
| List with rate | Sup/Mgt | ✅ | |
| Attendance (date, grade, subject, present/absent, reason, replacement) | Admin | ✅ | Per class session; daily screen |
| Handout upload (date, class) | Admin | ✅ | PDF, Word, PowerPoint or image |
| Auto teacher ID | Sup | ❌ | Entered by hand |
| Grade, school, recommendation, expertise, other-centre experience | Sup | ❌ | |
| Permit date + expiry alert | Sup/Mgt | ✅ | 60-day warning |
| Teaching availability (yearly) | Sup | ❌ | Assigned classes are shown instead |
| Assigned class | Sup | ✅ | From timetable |
| History: joined, yearly increments, classes, status | Sup | 🟡 | Status history ❌ |
| Performance: description, student/teacher/staff feedback | Sup | ❌ | |
| Complaint / action | Sup/Mgt | ✅ | |
| Set increment rate; approve increments | Mgt | ✅ | Approved rate applies immediately, not on the effective date |
| Approve new teacher; approve active/inactive change | Mgt | ❌ | |
| Payment: auto from attendance, verify, approve, payslip by WhatsApp | Sup/Mgt | ✅ | Payslip WhatsApp is a prepared message (semi-automatic) |
| Report: monthly attendance, monthly performance | Mgt | 🟡 | Monthly attendance ✅ (with CSV); performance ❌ (no performance records yet) |

## 7. Student Attendance (page 6)

| Requirement | Status | Notes |
|---|---|---|
| Student list per class (export to Excel) | ✅ | CSV |
| Daily attendance + notes | ✅ | Per class per day, notes per student |
| Attendance rate (% and fraction) | ✅ | Per class and overall |

## 8. Class / Timetable (page 6)

| Requirement | Role | Status | Notes |
|---|---|---|---|
| Master and form timetable | All | ✅ | Filter by form |
| Record extra / cancel class | Admin | ✅ | |
| Set master timetable + max seats | Sup | ✅ | Management can also edit |
| Set fee and teacher-pay calculation | Sup | ✅ | Fee packages; teacher pay per session from the teacher's rate |
| Approve/reject extra/cancel | Sup | ✅ | Reason required to reject |
| Class occupancy (coloured, %) | Sup | ✅ | |
| Approve master timetable | Mgt | ✅ | Supervisor changes wait for Management |
| Verify extra/cancel | Mgt | ✅ | |
| Seats linked to registration (e.g. F5 Math A: −2) | Remark | ✅ | |

## 9. Billing (page 7)

| Requirement | Status | Notes |
|---|---|---|
| Date (auto), amount, method | ✅ | |
| To be paid / extra / short | ✅ | Overpayment becomes student credit |
| Payment type (reg fee, Jan–Dec, seminar, outstanding) | ✅ | |
| Notes for payee | ✅ | |
| WhatsApp receipt, auto serial number | 🟡 | `REC-YYYY-0001` ✅; WhatsApp is a manual link |
| Outstanding follow-up (week 3, semi-auto) | ✅ | Semi-automatic: prepared WhatsApp message per week, reminders recorded |
| Outstanding list | ✅ | |
| Daily sales report | 🟡 | Today's collection on dashboard; no daily report page |
| Student credit used on next invoice | ✅ | Applied by the monthly run, or by hand on any invoice |

## 10. Expenses (pages 7–8)

| Requirement | Role | Status | Notes |
|---|---|---|---|
| PV number PVYY-MM01 | Admin | ✅ | e.g. `PV26-0901` |
| Category / subcategory `**` | Admin | ✅ | Master lists |
| Vendor, method, ref, amount, items, remark | Admin | ✅ | |
| Multiple attachments | Admin | ✅ | Locked once approved or rejected |
| Recipient signature | Admin | ✅ | Drawn on screen (finger or mouse) |
| 3-tier approval (<500 / 500–3,000 / >3,000) | All | ✅ | |
| Vendor database | Sup | ✅ | |
| Vendor approval; category approval | Mgt | 🟡 | Category approval through master data; vendor approval ❌ |
| Categories with monthly budget | Sup | ✅ | Budget stored on the category master list |
| Reports: daily/monthly/yearly, search | Sup | 🟡 | Monthly and by-category totals ✅; search ❌ |
| Monthly comparison; budget vs actual | Mgt | ✅ | Older seeded vouchers with other category names show as "no budget" |

## 11. Reports (Management, page 8)

| Requirement | Status | Notes |
|---|---|---|
| Sales by month (yearly graph): monthly, walk-in, collection, outstanding | ✅ | With CSV |
| Sales: drop subject & reasons | ✅ | |
| Teacher payments by month (permanent/replacement, by teacher, PDF payslip) | ✅ | Gaji Guru screen with CSV; payslip prints to PDF from the browser |
| Drop subject / inactive students (monthly) | ✅ | |
| Revenue contribution by form | ✅ | |
| Revenue by subject (upper, lower, primary) | 🟡 | By level; invoices are not split per subject |
| Student attendance by class | ✅ | |

## 12. Staff Management (pages 8–10)

| Requirement | Status | Notes |
|---|---|---|
| Staff ID (auto), name, IC, DOB, marital status, dependants, address, email, phone, skills | ✅ | |
| Picture | ✅ | |
| Emergency contact (name, phone, address, email, relation) | ✅ | |
| Job details by Management: position, department, join date, employment type, period, history | ✅ | Changes are logged automatically; Management can add history entries |
| Supporting documents (locked once sent) | ✅ | Visible only to the staff member, Supervisor and Management |
| Clock in / out | ✅ | Own record only (account linked to staff); Supervisor / Management can correct with a reason |
| Leave application + approval | ✅ | Counted in working days; reason required to reject; own leave goes to Management |
| Number of leave available / auto-calculated | ✅ | Yearly entitlement minus approved leave; approval checks the balance |
| Alerts: 1 month before contract ends; staff birthday | ✅ | Dashboard notification centre and HR reports |
| Report: monthly attendance (late, early leave), attendance % | ✅ | With CSV; approved leave is not counted as absence |
| Report: yearly used and balance MC, EL, AL, UL | ✅ | With CSV |
| KPI: set, review, achievement report | ✅ | Weighted score per year |
| Record (date, description, remark) | ✅ | |
| Payroll (staff) | ❌ | The requirement gives no details; teacher payroll is built |

## 13. Next steps

**Phase 3: missing modules**
1. ~~Lead funnel~~ (done).
2. ~~Monthly invoice run, discounts and voucher codes~~ (done).
3. ~~Teacher payroll~~ (done).
4. ~~Staff HR~~ (done, except picture and documents).
5. ~~File uploads~~ (done).

**Phase 4** (done except WhatsApp)
6. Chart library for the pie charts; per-student result graph; PDF receipts and payslips.
7. Configurable grade list; master-timetable approval; reject for extra/cancel classes.
8. WhatsApp: decide with the client between a paid WhatsApp Business API (true auto-send) or keeping semi-automatic links.
