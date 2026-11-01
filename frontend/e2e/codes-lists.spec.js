import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Beyond the dashboards: the lists and the dropdowns in forms read a Data induk value as its code too (F5, FZ, UTILITI, TIKTOK).
// Names stay in Data induk, in Excel exports and in everything sent to parents.

const CLASS_REF = /[FS]\d [A-Z][A-Z0-9_]* \([A-D]\)/; // F5 FZ (A)

test.describe('Jadual kelas', () => {
  test('a class reads as its code and the tingkatan filter lists codes', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/timetable');
    await page.getByRole('button', { name: 'Senarai' }).click();
    await expect(page.locator('table tbody tr').first()).toContainText(CLASS_REF);
    await expect(page.locator('table tbody tr').first()).not.toContainText('Tingkatan');
    const filter = page.getByLabel('Tapis tingkatan');
    await expect(filter.locator('option')).toContainText(['Semua tingkatan', 'F5']);
    await expect(filter.locator('option', { hasText: 'Tingkatan 5' })).toHaveCount(0);
  });

  test('the class form lists subjects and tingkatan by code', async ({ page }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/timetable');
    await page.getByRole('button', { name: /Kelas baharu|Tambah kelas/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Subjek').locator('option', { hasText: 'FZ' })).toHaveCount(1);
    await expect(dialog.getByLabel('Subjek').locator('option', { hasText: 'Fizik' })).toHaveCount(0);
    await expect(dialog.getByLabel(/^Tingkatan/).locator('option').first()).toHaveText(/^[FS]\d$/);
  });
});

test.describe('Guru', () => {
  test('a teacher\'s subjects and the filter read as codes', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/teachers');
    const row = page.getByRole('row').filter({ hasText: 'NAK' });
    await expect(row).toContainText('FZ');
    await expect(row).not.toContainText('Fizik');
    await expect(page.getByLabel(/^Tingkatan/).first().locator('option', { hasText: /^Tingkatan \d/ })).toHaveCount(0); // "Semua tingkatan" is not a Data induk value
  });
});

test.describe('Baucar', () => {
  test('a voucher shows its category and subcategory as codes, and the form lists codes', async ({ page, request }) => {
    const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
    const description = unique('Bil kod');
    await api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
      vendor: vendor.id, category_code: 'UTILITI', subcategory_code: 'SUB_TNB', amount: 90, items_description: description, payment_method: 'CASH',
    });
    await signInAs(page, 'ADMIN');
    await page.goto('/#/vouchers');
    const row = page.getByRole('row').filter({ hasText: description });
    await expect(row).toContainText('UTILITI · SUB_TNB');
    await expect(row).not.toContainText('Bil Utiliti TNB');

    await page.getByRole('button', { name: 'Baucar baharu' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Kategori').locator('option', { hasText: 'SEWA' })).toHaveCount(1);
    await expect(dialog.getByLabel('Kategori').locator('option', { hasText: 'Sewa Premis' })).toHaveCount(0);
  });
});

test.describe('Pertanyaan & prospek', () => {
  test('the prospect form lists sources, schools and subjects as codes', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/leads');
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Prospek baharu' });
    await expect(form.getByLabel(/^Sumber/).locator('option', { hasText: 'TIKTOK' })).toHaveCount(1);
    await expect(form.getByLabel(/^Sumber/).locator('option', { hasText: 'TikTok Ads' })).toHaveCount(0);
    await expect(form.getByLabel(/^Sekolah/).locator('option', { hasText: 'SMK_TELIPOT' })).toHaveCount(1);
    await form.getByLabel(/^Tingkatan/).selectOption('F5');
    await expect(form.getByRole('button', { name: 'FZ', exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Fizik', exact: true })).toHaveCount(0);
  });
});

test.describe('Subjek', () => {
  test('the Guru and Nota & modul filters list subjects by code', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/teachers');
    const guru = page.getByLabel('Subjek', { exact: true });
    await expect(guru.locator('option', { hasText: 'FZ' })).toHaveCount(1);
    await expect(guru.locator('option', { hasText: 'Fizik' })).toHaveCount(0);

    await page.goto('/#/handouts');
    const notes = page.getByLabel('Tapis subjek');
    await expect(notes.locator('option').nth(1)).toHaveText(/^[A-Z][A-Z0-9_]*$/);
  });

  test('a prospect card and the results tab of a pupil read subjects as codes', async ({ page, request }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/leads');
    const card = page.locator('div.space-y-2 > div').filter({ hasText: 'Nurul Izzati' });
    await expect(card).toContainText('BIO, KIM');
    await expect(card).not.toContainText('Biologi');

    const students = await api(request, 'ADMIN', 'GET', '/students/students/');
    const enrolled = students.find((s) => s.status === 'ACTIVE' && (s.enrolled_classes || []).length > 0);
    await page.goto(`/#/students/${enrolled.student_id}?tab=results`);
    await expect(page.getByRole('heading', { name: enrolled.full_name })).toBeVisible();
    await expect(page.getByText('Kelas tuisyen').first()).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/Fizik|Kimia|Biologi|Matematik/);
  });
});

test.describe('Profil pelajar', () => {
  test('dropping a subject lists the reasons as codes, and the profile reads the source as a code', async ({ page, request }) => {
    const students = await api(request, 'ADMIN', 'GET', '/students/students/');
    const enrolled = students.find((s) => s.status === 'ACTIVE' && (s.enrolled_classes || []).length > 0);
    await signInAs(page, 'ADMIN');
    await page.goto(`/#/students/${enrolled.student_id}`);
    await expect(page.getByRole('heading', { name: enrolled.full_name })).toBeVisible();
    await page.getByRole('tab', { name: /^Kelas/ }).click();
    await page.getByRole('button', { name: 'Gugur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Gugur subjek' });
    await expect(dialog.getByLabel('Sebab gugur').locator('option', { hasText: 'PINDAH' })).toHaveCount(1);
    await expect(dialog.getByLabel('Sebab gugur').locator('option', { hasText: 'Pindah Sekolah' })).toHaveCount(0);
  });
});
