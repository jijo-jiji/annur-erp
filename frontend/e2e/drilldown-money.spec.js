import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Money, vouchers and classes: a figure on Ringkasan opens the rows it adds up to (billing/drilldown.py,
// expenses/drilldown.py, academic/drilldown.py), and the list says if its total ever differs from the figure.

const bar = (page) => page.getByRole('region', { name: 'Penapis dari paparan' });

// The list has answered, and it agrees with the figure that opened it (the bar says so when it does not)
async function agrees(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  await expect(bar(page)).not.toContainText('menunjukkan');
}

async function rowsOnScreen(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  return page.locator('table tbody tr').count();
}

async function openDetailed(page, who) {
  await signInAs(page, who);
  await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'detailed'));
  await page.goto('/#/dashboard');
  await expect(page.getByText('Kutipan hari ini', { exact: true }).first()).toBeVisible();
}

let prepared;
// Records that make each of these figures non-zero, made once through the API
function prepareRecords(request) {
  prepared ??= (async () => {
    const students = await api(request, 'ADMIN', 'GET', '/students/students/');
    const [first, second] = students.filter((s) => s.form_level === 'F5' && s.status === 'ACTIVE');

    // invoices and receipts: one unpaid, one part paid, one paid (billed this month, paid today)
    const invoice = (student, amount, description) => api(request, 'ADMIN', 'POST', '/billing/invoices/', { student: student.id, description, monthly_fee: amount });
    const pay = (inv, amount) => api(request, 'ADMIN', 'POST', '/billing/receipts/', { invoice: inv.id, amount_paid: amount, payment_method: 'CASH', payment_type: 'SEMINAR' });
    await invoice(first, 250, unique('Seminar belum bayar'));
    await pay(await invoice(first, 120, unique('Seminar separa')), 50);
    await pay(await invoice(second, 80, unique('Seminar lunas')), 80);

    // vouchers: one verified at the counter, one approved by the Supervisor, one waiting for each level
    const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
    const voucher = (amount) => api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
      vendor: vendor.id, category: 'Utiliti', amount, items_description: unique(`Baucar ${amount}`), payment_method: 'CASH',
    });
    await voucher(120);
    const approved = await voucher(1400);
    await api(request, 'SUPERVISOR', 'POST', `/expenses/vouchers/${approved.id}/approve/`, {});
    await voucher(1600);
    await voucher(5200);

    // classes: one over its seats, one full, one nearly full
    const subjects = await api(request, 'ADMIN', 'GET', '/business-config/subjects/');
    const slots = await api(request, 'ADMIN', 'GET', '/academic/time-slots/');
    const room = (await api(request, 'ADMIN', 'GET', '/academic/classrooms/'))[0];
    const makeClass = (code, seats, section) => api(request, 'MANAGEMENT', 'POST', '/academic/timetable/', {
      slot: slots[0].id, subject: subjects.find((s) => s.code === code).id, form_level: 'F5', section, max_seats: seats, classroom: room.id,
    });
    const classes = { over: await makeClass('GEO_L', 1, 'D'), full: await makeClass('SEJ_L', 1, 'C'), near: await makeClass('BM_L', 3, 'D') };
    const enrol = (student, cls) => api(request, 'SUPERVISOR', 'POST', `/students/students/${student.id}/enroll/`, { class_id: cls.id, allow_over_capacity: true });
    await enrol(first, classes.over);
    await enrol(second, classes.over);
    await enrol(first, classes.full);
    await enrol(first, classes.near);
    await enrol(second, classes.near);
    return classes;
  })();
  return prepared;
}

test.describe('Money, vouchers and classes open the rows they add up to', () => {
  test.beforeEach(async ({ request }) => { await prepareRecords(request); });

  const cardLabel = async (page, label) => page.getByRole('link', { name: new RegExp(`^${label}: `) }).first().getAttribute('aria-label');

  test('collections open the receipts that add up to them', async ({ page }) => {
    await openDetailed(page, 'MANAGEMENT');
    for (const label of ['Kutipan hari ini', 'Kutipan bulan ini']) {
      await page.goto('/#/dashboard');
      const text = await cardLabel(page, label);
      await page.getByRole('link', { name: text }).first().click();
      await expect(page).toHaveURL(/#\/billing\?tab=receipts/);
      await expect(bar(page)).toContainText('Dari Ringkasan');
      await expect(bar(page)).toContainText('Dibayar');
      await agrees(page); // the receipts add up to the figure
      expect(await rowsOnScreen(page)).toBeGreaterThan(0);
    }
  });

  test('arrears open the invoices still owed, and a status slice opens the invoices with that status', async ({ page }) => {
    await openDetailed(page, 'MANAGEMENT');
    await page.getByRole('link', { name: /^Tunggakan yuran: / }).click();
    await expect(page).toHaveURL(/#\/billing\?tab=invoices/);
    await expect(bar(page)).toContainText('Belum selesai');
    await expect(bar(page)).toContainText('baki');
    await agrees(page);
    const owed = await rowsOnScreen(page);
    expect(owed).toBeGreaterThan(0);
    await expect(bar(page)).toContainText(`${owed} invois`);

    await page.goBack();
    await page.locator('li a', { hasText: /^Selesai bayar/ }).first().click();
    await expect(bar(page)).toContainText('Selesai bayar');
    await agrees(page);
    const paid = Number((await bar(page).textContent()).match(/(\d+) invois/)[1]);
    expect(await rowsOnScreen(page)).toBe(paid);
  });

  test('in the short view the two small figures open receipts and arrears', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'simple'));
    await page.goto('/#/dashboard');
    await page.getByRole('link', { name: /^Hari ini RM/ }).click();
    await expect(bar(page)).toContainText('Dibayar');
    await agrees(page);
    await page.goBack();
    await page.getByRole('link', { name: /^tunggakan RM/ }).click();
    await expect(bar(page)).toContainText('Belum selesai');
    await agrees(page);
  });

  test('spending this month opens the counted vouchers, and a waiting voucher opens on its own', async ({ page }) => {
    await openDetailed(page, 'MANAGEMENT');
    await page.locator('dl > div', { hasText: 'Perbelanjaan (baucar disahkan / diluluskan)' }).getByRole('link').click();
    await expect(bar(page)).toContainText('Dikira sebagai perbelanjaan');
    await agrees(page);
    expect(await rowsOnScreen(page)).toBeGreaterThanOrEqual(2); // the counter-verified one and the Supervisor-approved one

    await page.goto('/#/dashboard');
    const waiting = page.locator('li a', { hasText: /PV\d{2}-\d+/ }).first();
    const number = (await waiting.textContent()).match(/PV\d{2}-\d+/)[0];
    await waiting.click();
    await expect(page.getByRole('dialog', { name: `Baucar ${number}` })).toBeVisible();
  });

  test('vouchers waiting for Management open that list', async ({ page }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/dashboard');
    const notice = page.getByRole('link', { name: /baucar melebihi .* menunggu kelulusan anda/ });
    const count = Number((await notice.textContent()).match(/(\d+) baucar/)[1]);
    await notice.click();
    await expect(bar(page)).toContainText('Menunggu pengurusan');
    await expect(bar(page)).toContainText(`${count} baucar`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(count);
  });

  test('class seats: the warning and a class card open the classes they are about', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/dashboard');
    const over = page.getByRole('link', { name: /kelas melebihi had kerusi/ });
    const n = Number((await over.textContent()).match(/(\d+) kelas melebihi/)[1]);
    await over.click();
    await expect(page).toHaveURL(/#\/timetable\?/);
    await expect(bar(page)).toContainText('Melebihi had kerusi');
    await expect(bar(page)).toContainText(`${n} kelas`);
    await agrees(page);

    await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'detailed'));
    await page.goto('/#/dashboard');
    await page.reload();
    await page.locator('ul a', { hasText: /Penuh/ }).first().click();
    await expect(bar(page)).toContainText('Satu kelas');
    await expect(bar(page)).toContainText('1 kelas');
  });

  test('a subject slice opens the active students taking it', async ({ page }) => {
    await openDetailed(page, 'SUPERVISOR');
    const slice = page.locator('li a', { hasText: /^Matematik\s/ }).first();
    const count = Number(await slice.locator('span').nth(2).textContent());
    await slice.click();
    await expect(bar(page)).toContainText('Aktif');
    await expect(bar(page)).toContainText(`${count} pelajar`);
    await agrees(page);
    expect(await rowsOnScreen(page)).toBe(count);
  });
});
