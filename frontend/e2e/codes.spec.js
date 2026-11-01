import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Every Data induk entry has a short code, and the dashboards read each value as its code (F5, MATH, SEWA, TIKTOK) instead of
// its long name. Full names stay in Data induk, in exports, and in everything sent to parents.

async function openDetailed(page, who) {
  await signInAs(page, who);
  await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'detailed'));
  await page.goto('/#/dashboard');
  await expect(page.getByText('Kutipan hari ini', { exact: true }).first()).toBeVisible();
}

test.describe('Codes on the dashboards', () => {
  test('Ringkasan reads each tingkatan and each subject as its code', async ({ page }) => {
    await openDetailed(page, 'SUPERVISOR');
    // students by tingkatan
    const byForm = page.locator('section').filter({ hasText: 'Pelajar aktif mengikut tingkatan' });
    await expect(byForm.locator('li a', { hasText: /^F5/ }).first()).toBeVisible();
    await expect(byForm).not.toContainText('Tingkatan 5');
    // subjects of one tingkatan: the choice of tingkatan and the slices
    const bySubject = page.locator('section').filter({ hasText: 'Subjek mengikut tingkatan' });
    await expect(bySubject.getByLabel('Tingkatan', { exact: true }).locator('option').first()).toHaveText(/^[FS]\d$/);
    const slices = await bySubject.locator('li a').allTextContents();
    expect(slices.length).toBeGreaterThan(0);
    for (const text of slices) expect(text).toMatch(/^[A-Z][A-Z_]/); // a code in capitals (FZ, ADDMT, MATH_L), not a name (Fizik, Matematik)
  });

  test('Laporan reads an expense category as its code', async ({ page, request }) => {
    const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
    await api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
      vendor: vendor.id, category_code: 'SEWA', amount: 120, items_description: unique('Sewa kod'), payment_method: 'CASH',
    });
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/reports');
    await expect(page.locator('li a', { hasText: 'SEWA' }).first()).toBeVisible(); // spending by category
    await expect(page.getByRole('row').filter({ hasText: 'SEWA' }).first()).toBeVisible(); // the budget table
    await expect(page.getByText('Sewa Premis Bangunan')).toHaveCount(0);

    // the list it opens says the same
    await page.locator('li a', { hasText: 'SEWA' }).first().click();
    await expect(page.getByRole('region', { name: 'Penapis dari paparan' })).toContainText('SEWA');
  });

  test('the prospect board and its analysis read a source as its code', async ({ page, request }) => {
    const phone = `011-${Math.floor(10000000 + Math.random() * 89999999)}`;
    const name = unique('Prospek Kod');
    await api(request, 'ADMIN', 'POST', '/students/leads/', { phone, lead_source: 'TIKTOK', student_name: name, form_level: 'F5' });
    await signInAs(page, 'ADMIN');
    await page.goto('/#/leads');
    const card = page.locator('section[aria-label="Enquiry"] div.space-y-2 > div').filter({ hasText: name });
    await expect(card).toContainText('F5 · TIKTOK');
    await expect(card).not.toContainText('TikTok Ads');

    await page.getByRole('button', { name: /^Analisis/ }).click();
    await expect(page.getByText('TIKTOK', { exact: true }).first()).toBeVisible();
  });
});
