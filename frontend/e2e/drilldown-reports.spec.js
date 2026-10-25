import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Step 3 of the drill-down: the figures on Laporan, and the teacher, permit, attendance and follow-up figures on
// Ringkasan, open the rows they add up to. Each list says if it ever differs from the figure that opened it.

const bar = (page) => page.getByRole('region', { name: 'Penapis dari paparan' });
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

// The list has answered, and it agrees with the figure that opened it (the bar says so when it does not)
async function agrees(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  await expect(bar(page)).not.toContainText('menunjukkan');
}

async function rowsOnScreen(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  return page.locator('table tbody tr').count();
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d); };

async function openDashboard(page, who, view) {
  await signInAs(page, who);
  await page.addInitScript((v) => localStorage.setItem('annur-dashboard-view', v), view);
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: 'Perlu tindakan' })).toBeVisible();
}

const numberIn = (text, pattern) => Number(text.match(pattern)[1]);

let prepared;
// Records that make each of these figures non-zero, made once through the API
function prepareRecords(request) {
  prepared ??= (async () => {
    const students = await api(request, 'ADMIN', 'GET', '/students/students/');
    const [first, second] = students.filter((s) => s.form_level === 'F5' && s.status === 'ACTIVE');

    // collected and billed this year, and a voucher counted as spending and one still waiting
    const invoice = await api(request, 'ADMIN', 'POST', '/billing/invoices/', { student: first.id, description: unique('Seminar laporan'), monthly_fee: 200 });
    await api(request, 'ADMIN', 'POST', '/billing/receipts/', { invoice: invoice.id, amount_paid: 200, payment_method: 'CASH', payment_type: 'SEMINAR' });
    await api(request, 'ADMIN', 'POST', '/billing/invoices/', { student: second.id, description: unique('Seminar belum bayar'), monthly_fee: 90 }); // still owed
    const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
    const voucher = (amount) => api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
      vendor: vendor.id, category: 'Utiliti', amount, items_description: unique(`Baucar ${amount}`), payment_method: 'CASH',
    });
    await voucher(150);
    await voucher(1700);

    // one permit running out, one already out (Management's own changes apply at once)
    const teachers = await api(request, 'ADMIN', 'GET', '/teachers/teachers/');
    const setPermit = (code, expiry) => api(request, 'MANAGEMENT', 'POST', '/change-requests/', {
      kind: 'TEACHER', action: 'UPDATE', target_id: teachers.find((t) => t.teacher_code === code).id, payload: { teaching_permit_expiry: expiry }, note: 'Ujian E2E',
    });
    await setPermit('NAK', day(10));
    await setPermit('AZ', day(-5));

    // sessions teachers were paid for: the first two classes with a teacher on the most recent day that has any
    for (let back = 1; back <= 14; back += 1) {
      const roster = await api(request, 'ADMIN', 'GET', `/teachers/attendance/roster/?date=${day(-back)}`);
      const taught = roster.classes.filter((c) => c.teacher_id && !c.locked).slice(0, 2);
      if (taught.length) {
        await api(request, 'ADMIN', 'POST', '/teachers/attendance/roster/', {
          date: day(-back), marks: taught.map((c) => ({ class_id: c.class_id, teacher_id: c.teacher_id, status: 'PRESENT' })),
        });
        break;
      }
    }

    // student attendance in the last 30 days: one class with an absentee, one nobody came to
    const classes = (await api(request, 'ADMIN', 'GET', '/academic/timetable/')).filter((c) => c.current_enrolled > 0);
    const take = async (cls, date, absent) => {
      const r = await api(request, 'ADMIN', 'GET', `/attendance/roster/?class_id=${cls.id}&date=${date}`);
      const everyone = r.students.length;
      await api(request, 'ADMIN', 'POST', '/attendance/roster/', {
        class_id: cls.id, date, note: '', marks: r.students.map((s, i) => ({ student: s.student, present: i >= (absent === 'all' ? everyone : absent), late: false })),
      });
    };
    await take(classes[0], day(-1), 1);
    await take(classes[0], day(-2), 0);
    await take(classes[1], day(-3), 'all');

    // a subject dropped, with a reason: a new class for the second student, then dropped again
    const subjects = await api(request, 'ADMIN', 'GET', '/business-config/subjects/');
    const slots = await api(request, 'ADMIN', 'GET', '/academic/time-slots/');
    const room = (await api(request, 'ADMIN', 'GET', '/academic/classrooms/'))[0];
    const extra = await api(request, 'MANAGEMENT', 'POST', '/academic/timetable/', {
      slot: slots[0].id, subject: subjects.find((s) => s.code === 'SEJ_L').id, form_level: 'F5', section: 'D', max_seats: 5, classroom: room.id,
    });
    await api(request, 'SUPERVISOR', 'POST', `/students/students/${second.id}/enroll/`, { class_id: extra.id, allow_over_capacity: true });
    await api(request, 'SUPERVISOR', 'POST', `/students/students/${second.id}/drop/`, { class_id: extra.id, reason_code: 'PINDAH', reason_text: 'Ujian E2E' });
  })();
  return prepared;
}

test.describe('Ringkasan: teachers, permits, attendance and follow-ups open the rows they count', () => {
  test.beforeEach(async ({ request }) => { await prepareRecords(request); });

  test('Guru aktif opens the active teachers', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'detailed');
    const link = page.getByRole('link', { name: /^Guru aktif: / });
    const count = numberIn(await link.getAttribute('aria-label'), /(\d+)$/);
    await link.click();
    await expect(page).toHaveURL(/#\/teachers\?/);
    await expect(bar(page)).toContainText('Dari Ringkasan');
    await expect(bar(page)).toContainText('Aktif');
    await expect(bar(page)).toContainText(`${count} guru`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(count);
  });

  test('Permit hampir / telah luput opens those teachers, and the missing dates open theirs', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'detailed');
    const link = page.getByRole('link', { name: /^Permit hampir \/ telah luput: / });
    const count = numberIn(await link.getAttribute('aria-label'), /(\d+)$/);
    expect(count).toBeGreaterThanOrEqual(2); // the one running out and the one already out
    await link.click();
    await expect(bar(page)).toContainText('Permit hampir / telah luput');
    await expect(bar(page)).toContainText(`${count} guru`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(count);

    await page.goBack();
    const hint = page.getByRole('link', { name: /guru tiada tarikh permit/ });
    const missing = numberIn(await hint.textContent(), /^(\d+)/);
    await hint.click();
    await expect(bar(page)).toContainText('Tiada tarikh permit');
    await expect(bar(page)).toContainText(`${missing} guru`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(missing);
  });

  test('a permit warning opens that one teacher', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'simple');
    await page.getByRole('link', { name: /^Permit mengajar .* telah luput/ }).first().click();
    await expect(bar(page)).toContainText('Cikgu');
    await expect(bar(page)).toContainText('1 guru');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(1);
  });

  test('"Perkara perlu tindakan" scrolls to the list instead of leaving the page', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'detailed');
    await page.getByRole('link', { name: /^Perkara perlu tindakan: / }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.locator('#perlu-tindakan')).toBeInViewport();
  });

  test('the 30-day attendance rate opens class-by-class attendance, and a class opens its sessions', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'simple');
    await page.getByRole('link', { name: /^Kehadiran 30 hari lepas: / }).click();
    await expect(page).toHaveURL(/#\/attendance\?/);
    await expect(bar(page)).toContainText('Dari Ringkasan');
    await expect(bar(page)).toContainText('kadar');
    await agrees(page);
    const classes = await rowsOnScreen(page);
    expect(classes).toBeGreaterThanOrEqual(2);
    await expect(bar(page)).toContainText(`${classes} kelas`);

    // the class with the lowest rate is first; its sessions are the days it was recorded
    await page.locator('table tbody tr a').first().click();
    await expect(bar(page)).toContainText('sesi');
    await agrees(page);
    const sessions = await rowsOnScreen(page);
    expect(sessions).toBeGreaterThan(0);
    await expect(bar(page)).toContainText(`${sessions} sesi`);

    // and a session opens that day's roster
    await page.getByRole('link', { name: 'Buka' }).first().click();
    await expect(page).toHaveURL(/#\/attendance\?class=\d+&date=/);
    await expect(page.getByRole('radiogroup').first()).toBeVisible();
  });

  test('a low-attendance warning opens that class\'s sessions', async ({ page }) => {
    await openDashboard(page, 'SUPERVISOR', 'simple');
    await page.getByRole('link', { name: /^Kehadiran .* dalam 30 hari lepas/ }).first().click();
    await expect(bar(page)).toContainText('sesi');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);
  });

  test('prospects to follow up open the board with only those prospects', async ({ page, request }) => {
    const phone = () => `011-${Math.floor(10000000 + Math.random() * 89999999)}`;
    const due = await api(request, 'ADMIN', 'POST', '/students/leads/', { phone: phone(), lead_source: 'TIKTOK', student_name: unique('Susulan E2E') });
    await api(request, 'ADMIN', 'POST', `/students/leads/${due.id}/activities/`, { action: 'WhatsApp', remark: 'Ujian', outcome: 'WAITING_REPLY', next_follow_up: day(-1) });
    const later = await api(request, 'ADMIN', 'POST', '/students/leads/', { phone: phone(), lead_source: 'TIKTOK', student_name: unique('Belum tiba E2E') });

    await openDashboard(page, 'SUPERVISOR', 'simple');
    const notice = page.getByRole('link', { name: /prospek perlu susulan/ });
    const count = numberIn(await notice.textContent(), /(\d+) prospek/);
    await notice.click();
    await expect(page).toHaveURL(/#\/leads\?/);
    await expect(bar(page)).toContainText('Susulan tertunggak');
    await expect(bar(page)).toContainText(`${count} prospek`);
    await agrees(page);
    await expect(page.getByRole('button', { name: due.student_name })).toBeVisible();
    await expect(page.getByRole('button', { name: later.student_name })).toHaveCount(0);
  });
});

test.describe('Laporan opens the records behind its figures', () => {
  test.beforeEach(async ({ request }) => { await prepareRecords(request); });

  const openReport = async (page, tab) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/reports');
    if (tab) await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { selected: true })).toBeVisible();
  };

  test('billed, collected and arrears open the invoices and receipts that add up to them', async ({ page }) => {
    for (const [label, route, chip] of [
      [/^Jumlah dibilkan \d{4}: /, /#\/billing\?tab=invoices/, 'Dibilkan tahun'],
      [/^Jumlah dikutip: /, /#\/billing\?tab=receipts/, 'Dibayar tahun'],
      [/^Tunggakan semasa: /, /#\/billing\?tab=invoices/, 'Belum selesai'],
    ]) {
      await openReport(page);
      await page.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(route);
      await expect(bar(page)).toContainText('Dari Laporan');
      await expect(bar(page)).toContainText(chip);
      await agrees(page);
      expect(await rowsOnScreen(page)).toBeGreaterThan(0);
    }
  });

  test('a month in the table and a bar in the chart open that month\'s records', async ({ page }) => {
    const month = MONTHS[new Date().getMonth()];
    await openReport(page);
    const row = page.getByRole('row').filter({ hasText: new RegExp(`^${month} ${new Date().getFullYear()}`) });
    await row.getByRole('link').nth(1).click(); // billed, then collected
    await expect(page).toHaveURL(/#\/billing\?tab=receipts/);
    await expect(bar(page)).toContainText('Dibayar');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);

    await openReport(page);
    await page.getByRole('link', { name: new RegExp(`^${month} Dibilkan: `) }).click();
    await expect(page).toHaveURL(/#\/billing\?tab=invoices/);
    await expect(bar(page)).toContainText('Dibilkan');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);
  });

  test('each tingkatan and each peringkat open the receipts they add up to', async ({ page }) => {
    await openReport(page);
    await page.locator('li a', { hasText: 'Tingkatan 5' }).first().click();
    await expect(bar(page)).toContainText('Tingkatan 5');
    await expect(bar(page)).toContainText('Dibayar tahun');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);

    await openReport(page);
    await page.locator('li a', { hasText: 'Menengah atas' }).first().click();
    await expect(bar(page)).toContainText('Menengah atas');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);
  });

  test('spending by category, its total, the budget table and what is waiting open the vouchers', async ({ page }) => {
    await openReport(page);
    await page.locator('li a', { hasText: 'Utiliti' }).first().click();
    await expect(page).toHaveURL(/#\/vouchers\?/);
    await expect(bar(page)).toContainText('Dikira sebagai perbelanjaan');
    await expect(bar(page)).toContainText('Utiliti');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);

    await openReport(page);
    await page.locator('li a', { hasText: /^Jumlah/ }).click();
    await expect(bar(page)).toContainText('Dikira sebagai perbelanjaan');
    await agrees(page);

    await openReport(page);
    await page.getByRole('row').filter({ hasText: 'Utiliti' }).getByRole('link').click(); // "Sebenar" in the budget table
    await expect(bar(page)).toContainText('Utiliti');
    await agrees(page);

    await openReport(page);
    await page.getByRole('link', { name: 'menunggu kelulusan' }).click();
    await expect(bar(page)).toContainText('Menunggu kelulusan');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);
  });

  test('a teacher\'s sessions and allowance open the sessions they were paid for', async ({ page }) => {
    await openReport(page, 'Bayaran guru');
    const first = page.locator('table tbody tr').first();
    const sessions = numberIn(await first.getByRole('link').nth(0).textContent(), /^(\d+)/);
    await first.getByRole('link').nth(0).click();
    await expect(page).toHaveURL(/#\/teacher-attendance\?/);
    await expect(bar(page)).toContainText('Dari Laporan');
    await expect(bar(page)).toContainText(`${sessions} sesi`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(sessions);

    await page.goBack();
    await page.getByRole('tab', { name: 'Bayaran guru' }).click();
    await page.locator('table tbody tr').first().getByRole('link').nth(1).click();
    await expect(bar(page)).toContainText('elaun RM');
    await agrees(page);
  });

  test('a drop reason and a month count open the history rows they count', async ({ page }) => {
    await openReport(page, 'Akademik & status pelajar');
    await page.getByRole('link', { name: /Pindah Sekolah/ }).click();
    await expect(page).toHaveURL(/#\/students\?.*tab=history/);
    await expect(bar(page)).toContainText('Dari Laporan');
    await expect(bar(page)).toContainText('Gugur subjek');
    await agrees(page);
    const rows = await rowsOnScreen(page);
    expect(rows).toBeGreaterThan(0);
    await expect(bar(page)).toContainText(`${rows} rekod`);

    await openReport(page, 'Akademik & status pelajar');
    await page.locator('div.grid-cols-12 a').first().click();
    await expect(page).toHaveURL(/#\/students\?.*tab=history/);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);
  });

  test('a class row and a subject bar open that class\'s attendance and the classes whose seats it adds up', async ({ page }) => {
    await openReport(page, 'Kehadiran & kapasiti');
    await page.locator('table tbody tr').first().getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/attendance\?/);
    await expect(bar(page)).toContainText('Dari Laporan');
    await expect(bar(page)).toContainText('kadar');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThan(0);

    await openReport(page, 'Kehadiran & kapasiti');
    await page.locator('li[title*="kerusi"] a').first().click(); // a subject bar; its seats are in the tooltip
    await expect(page).toHaveURL(/#\/timetable\?/);
    await expect(bar(page)).toContainText('terisi');
    await agrees(page);
    await expect(bar(page)).toContainText(/[1-9]\d* kelas/);
  });
});
