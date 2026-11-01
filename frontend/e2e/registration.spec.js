import { expect, test } from '@playwright/test';
import { api, openAs, signInAs, unique } from './support/auth';

// The main business flow, in the order the centre lives it:
// the counter registers a student -> the Supervisor approves -> an invoice exists -> the counter takes payment.

const toast = (page) => page.getByRole('status');

// A new ID number each time, in the usual yymmdd-pb-xxxx shape
const newIc = () => `0${Math.floor(1 + Math.random() * 8)}0${Math.floor(1 + Math.random() * 8)}1${Math.floor(Math.random() * 9)}-03-${String(Math.floor(1000 + Math.random() * 8999))}`;

async function registerAtTheCounter(page, { name, ic, form = 'F4', dob = '' }) {
  await page.goto('/#/students?new');
  await expect(page.getByRole('heading', { name: 'Pendaftaran pelajar baharu' })).toBeVisible();
  // The form starts over while the classes and the school list arrive, so wait for them before typing
  await expect(page.getByLabel(/^Sekolah/).locator('option')).not.toHaveCount(1);
  await expect(page.locator('#pilihan-kelas .divide-y > div').first()).toBeVisible();
  await page.getByLabel('Nama penuh').fill(name);
  await page.getByLabel(/^No\. kad pengenalan/).fill(ic);
  await page.getByLabel(/^Tingkatan \/ darjah/).selectOption(form);
  await page.getByLabel(/^Sekolah/).selectOption({ index: 1 });
  await page.getByLabel(/^Nama( \*)?$/).first().fill('Encik Ujian Penjaga');
  await page.getByLabel(/^No\. telefon \(WhatsApp\)/).first().fill('012-3456789');
  if (dob) await page.getByLabel('Tarikh lahir').first().fill(dob);

  // One class for each of the first four subjects offered for that form
  const subjects = page.locator('#pilihan-kelas .divide-y > div');
  await expect(subjects.first()).toBeVisible();
  await expect(page.getByLabel('Nama penuh')).toHaveValue(name); // nothing was wiped while the lists loaded
  const count = Math.min(await subjects.count(), 4);
  expect(count).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < count; i += 1) {
    await subjects.nth(i).locator('button[aria-pressed]').first().click();
  }
  await page.getByRole('button', { name: 'Daftar pelajar' }).click();
}

test.describe.serial('Registration to payment', () => {
  const student = { name: unique('Ujian E2E Pelajar'), ic: newIc() };
  let invoiceNumber;

  test('the counter registers a student, who then waits for the Supervisor', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await registerAtTheCounter(page, student);

    // The new student's profile opens, still waiting for approval
    await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
    await expect(page.getByText('Menunggu', { exact: false }).first()).toBeVisible();

    // The counter can see the waiting list but is not offered the approve button
    await page.goto('/#/students?tab=approvals');
    const waiting = page.getByRole('row').filter({ hasText: student.name });
    await expect(waiting).toContainText('Menunggu Supervisor');
    await expect(waiting.getByRole('button', { name: 'Luluskan' })).toHaveCount(0);
  });

  test('the Supervisor approves; the student becomes active and an invoice is created', async ({ page, request }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/students?tab=approvals');
    const waiting = page.getByRole('row').filter({ hasText: student.name });
    await waiting.getByRole('button', { name: 'Luluskan' }).click();

    const message = toast(page).filter({ hasText: 'diluluskan' });
    await expect(message).toContainText('Invois');
    invoiceNumber = /INV-\d{4}-\d+/.exec(await message.textContent())?.[0];
    expect(invoiceNumber).toBeTruthy();

    const students = await api(request, 'SUPERVISOR', 'GET', '/students/students/');
    const saved = students.find((s) => s.full_name === student.name);
    expect(saved.status).toBe('ACTIVE');
    expect(saved.student_id).toMatch(/^HQ-\d{2}\d{4,}$/); // prefix, year, running number
  });

  test('the counter takes the first payment and a numbered receipt is issued', async ({ page, request }) => {
    const invoices = await api(request, 'ADMIN', 'GET', '/billing/invoices/');
    const invoice = invoices.find((i) => i.invoice_number === invoiceNumber);
    expect(invoice.status).toBe('UNPAID');
    const due = Number(invoice.balance_due);

    await signInAs(page, 'ADMIN');
    await page.goto('/#/billing');
    const line = page.getByRole('row').filter({ hasText: invoiceNumber });
    await expect(line).toBeVisible();
    await line.getByRole('button', { name: 'Rekod bayaran' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rekod bayaran' });
    await expect(dialog).toContainText(invoiceNumber);
    await dialog.getByLabel(/^Amaun diterima/).fill(String(due));
    await dialog.getByLabel('Kaedah bayaran').selectOption({ label: 'Tunai' });
    await dialog.getByRole('button', { name: 'Simpan & keluarkan resit' }).click();

    // The receipt is shown straight away, numbered, and the invoice is settled
    await expect(page.getByRole('dialog', { name: /REC-\d{4}-\d{4}/ })).toBeVisible();
    const after = (await api(request, 'ADMIN', 'GET', '/billing/invoices/')).find((i) => i.invoice_number === invoiceNumber);
    expect(after.status).toBe('PAID');
    expect(Number(after.balance_due)).toBe(0);
    const receipts = await api(request, 'ADMIN', 'GET', '/billing/receipts/');
    const receipt = receipts.find((r) => r.invoice === invoice.id);
    expect(receipt.receipt_number).toMatch(/^REC-\d{4}-\d{4}$/);
    expect(Number(receipt.amount_paid)).toBe(due);
  });
});

test.describe('The counter registration form', () => {
  test('starts with the mother as the main contact, asks the date of birth, reads codes and has no declaration', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/students?new');
    await expect(page.getByRole('heading', { name: 'Pendaftaran pelajar baharu' })).toBeVisible();
    await expect(page.getByLabel(/^Sekolah/).locator('option', { hasText: 'SMK_TELIPOT' })).toHaveCount(1); // the school list has arrived

    // guardian 1 is the mother and is the main contact; guardian 2 is the father
    await expect(page.getByLabel('Hubungan', { exact: true }).first()).toHaveValue('Ibu');
    await expect(page.getByLabel('Hubungan', { exact: true }).nth(1)).toHaveValue('Bapa');
    await expect(page.getByLabel('Hubungan utama').first()).toBeChecked();

    // the age is worked out from the date of birth, not chosen from a group
    await expect(page.getByLabel('Umur', { exact: true })).toHaveCount(0);
    await page.getByLabel('Tarikh lahir').first().fill('1984-03-12');
    await expect(page.getByText(/^Umur \d+ tahun$/)).toBeVisible();

    // the school and the tingkatan read as their codes
    const schools = await page.getByLabel(/^Sekolah/).locator('option').allTextContents();
    expect(schools).toContain('SMK_TELIPOT');
    expect(schools).not.toContain('SMK Telipot');
    const forms = await page.getByLabel(/^Tingkatan \/ darjah/).locator('option').allTextContents();
    expect(forms).toEqual(expect.arrayContaining(['F5', 'F4']));
    expect(forms).not.toContain('Tingkatan 5');

    // nothing to tick at the bottom
    await expect(page.getByRole('navigation', { name: 'Bahagian borang' }).getByRole('button')).toHaveText([/Pelajar/, /Penjaga/, /Kelas/]);
    await expect(page.getByText('Perakuan')).toHaveCount(0);
    await expect(page.getByLabel(/^Syarat pembayaran/)).toHaveCount(0);
    await expect(page.getByLabel(/^Kebenaran semakan SAPS/)).toHaveCount(0);
  });

  test('the date of birth is kept, the profile shows the age and the edit window can change it', async ({ page, request }) => {
    const student = { name: unique('Ujian E2E Lahir'), ic: newIc(), dob: '1984-03-12' };
    const today = new Date();
    const years = today.getFullYear() - 1984 - (today < new Date(today.getFullYear(), 2, 12) ? 1 : 0);
    await signInAs(page, 'ADMIN');
    await registerAtTheCounter(page, student);
    await expect(page.getByRole('heading', { name: student.name })).toBeVisible();
    await expect(page.getByText(`${years} tahun`, { exact: true })).toBeVisible();

    const saved = () => api(request, 'ADMIN', 'GET', '/students/students/').then((all) => all.find((s) => s.full_name === student.name));
    expect(await saved()).toMatchObject({ parent1_dob: '1984-03-12', parent1_age: '', parent1_relation: 'Ibu', preferred_contact: 'PARENT_1', saps_consent: false });

    await page.getByRole('button', { name: 'Ubah maklumat' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Ubah maklumat pelajar' });
    await dialog.getByLabel('Tarikh lahir penjaga 2').fill('1982-07-30');
    await expect(dialog.getByText(/^Umur \d+ tahun$/)).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await saved()).toMatchObject({ parent1_dob: '1984-03-12', parent2_dob: '1982-07-30' });
  });
});

test.describe('Parents register from the QR code', () => {
  test('a parent registers a child without logging in, and the Supervisor finds the form waiting', async ({ page, browser }) => {
    const child = unique('Ujian E2E Anak');
    await page.goto('/#/daftar');
    // No login is asked for, and no staff menu is shown
    await expect(page.getByRole('heading', { name: 'Borang pendaftaran pelajar' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Menu utama' })).toHaveCount(0);
    // One scroll in sections, with a header naming them; no consent or terms to tick
    await expect(page.getByRole('navigation', { name: 'Bahagian borang' }).getByRole('button')).toHaveText([/Pelajar/, /Penjaga/, /Subjek/]);
    await expect(page.getByLabel(/^Saya bersetuju/)).toHaveCount(0);

    await page.getByLabel('Nama penuh pelajar').fill(child);
    await page.getByLabel(/^No\. kad pengenalan/).fill(newIc());
    await page.getByLabel(/^Tingkatan \/ darjah/).selectOption({ label: 'Tingkatan 3' });
    await page.getByLabel(/^Sekolah/).fill('SMK Telipot');
    // the child has no phone of their own: that field is optional
    await page.getByLabel(/^Nama ibu bapa/).fill('Puan Ujian');
    await page.getByLabel(/^No\. telefon \(WhatsApp\)/).fill('013-9876543');
    await page.locator('button[aria-pressed]').first().click();
    await page.getByRole('button', { name: 'Hantar pendaftaran' }).click();

    await expect(page.getByRole('heading', { name: 'Pendaftaran diterima' })).toBeVisible();
    await expect(page.getByText(/HQ-\d{6,}/).first()).toBeVisible();
    const saved = (await api(page.request, 'SUPERVISOR', 'GET', '/students/students/')).find((x) => x.full_name === child);
    expect(saved.phone_number).toBe('');
    expect(saved.saps_consent).toBe(false); // not asked on the form, so not recorded as given

    // At the counter the form is waiting for approval, marked as coming from the QR code
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/students?tab=approvals');
    const waiting = supervisor.page.getByRole('row').filter({ hasText: child });
    await expect(waiting).toContainText('Borang QR');
    await expect(waiting.getByRole('button', { name: 'Luluskan' })).toBeVisible();
    await supervisor.close();
  });

  test('the public form is not sent while the student or guardian details are missing', async ({ page }) => {
    await page.goto('/#/daftar');
    await page.getByLabel('Nama penuh pelajar').fill('Tidak Lengkap');
    await page.getByRole('button', { name: 'Hantar pendaftaran' }).click();
    // The browser stops the submit: nothing is sent and the form is still on screen
    await expect(page.getByRole('heading', { name: 'Pendaftaran diterima' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Borang pendaftaran pelajar' })).toBeVisible();
  });
});

test.describe('When the server refuses a form', () => {
  const longIc = '9'.repeat(30);

  test('the counter is told which field is wrong, in Malay', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await registerAtTheCounter(page, { name: unique('Ujian E2E Salah'), ic: longIc });

    const message = page.getByRole('status').filter({ hasText: 'No. kad pengenalan' });
    await expect(message).toContainText('terlalu panjang (paling banyak 20 aksara)');
    await expect(message).not.toContainText('This field');
    await expect(page).toHaveURL(/\?new/); // still on the form, nothing was saved
  });

  test('a parent is told which field is wrong on the public form', async ({ page }) => {
    await page.goto('/#/daftar');
    await page.getByLabel('Nama penuh pelajar').fill(unique('Ujian E2E Ibu Bapa'));
    await page.getByLabel(/^No\. kad pengenalan/).fill(longIc);
    await page.getByLabel(/^Tingkatan \/ darjah/).selectOption({ label: 'Tingkatan 3' });
    await page.getByLabel(/^Sekolah/).fill('SMK Telipot');
    await page.getByLabel(/^Nama ibu bapa/).fill('Puan Ujian');
    await page.getByLabel(/^No\. telefon \(WhatsApp\)/).fill('013-9876543');
    await page.getByRole('button', { name: 'Hantar pendaftaran' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('No. kad pengenalan');
    await expect(alert).toContainText('paling banyak 20 aksara');
    await expect(page.getByRole('heading', { name: 'Pendaftaran diterima' })).toHaveCount(0);
  });
});
