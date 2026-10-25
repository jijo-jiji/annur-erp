import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Phase E: the bell tells each person what waits for them and how their requests were decided; monthly fees still
// unpaid in week 5 become tasks for Supervisor, who records what the parent said.

const toast = (page) => page.getByRole('status');
const bell = (page) => page.locator('aside').getByRole('button', { name: /^Notifikasi/ });

test('a request reaches the approver\'s bell, opens its page and is marked read', async ({ page }) => {
  const name = unique('Subjek loceng');
  await api(page.request, 'ADMIN', 'POST', '/change-requests/', {
    kind: 'SUBJECT', action: 'CREATE', note: 'Untuk ujian loceng',
    payload: { code: `B${Date.now().toString(36).slice(-4).toUpperCase()}`, name, level_category: 'UPPER_SEC', stream: 'TERAS', category: 'TERAS' },
  });
  await signInAs(page, 'SUPERVISOR');
  await page.goto('/#/dashboard');
  await expect(bell(page)).toHaveAccessibleName(/belum dibaca/);
  await bell(page).click();
  const panel = page.getByRole('dialog', { name: 'Notifikasi' });
  await panel.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByText(name).first()).toBeVisible(); // the request waits on the page it opened
  // opening it marked that notice read (other notices, such as the day's week-5 tasks, may still be unread)
  await expect.poll(async () => {
    const mine = await api(page.request, 'SUPERVISOR', 'GET', '/notifications/');
    return mine.items.find((n) => n.title.includes(name))?.read;
  }).toBe(true);
});

test('a fee unpaid in week 5 is a Supervisor task; Admin only sees it', async ({ page, browser }) => {
  await signInAs(page, 'SUPERVISOR');
  await page.goto('/#/billing?tab=arrears');
  const week5 = page.getByRole('region', { name: 'Minggu 5: hubungi ibu bapa' });
  const row = week5.getByRole('row').filter({ hasText: 'INV-E2E-' });
  await expect(row).toContainText('Belum dihubungi');
  await row.getByRole('button', { name: 'Rekod hasil' }).click();
  const form = page.getByRole('dialog', { name: /^Hasil susulan/ });
  await form.getByLabel('Hasil').selectOption('PROMISED');
  await form.getByLabel('Tarikh dijanjikan').fill('2099-01-05');
  await form.getByLabel('Catatan').fill('Selepas gaji');
  await form.getByRole('button', { name: 'Simpan hasil' }).click();
  await expect(toast(page).filter({ hasText: 'Hasil susulan direkodkan' })).toBeVisible();
  await week5.getByRole('button', { name: 'Selesai', exact: true }).click();
  await expect(week5.getByRole('row').filter({ hasText: 'INV-E2E-' })).toContainText('Berjanji bayar pada tarikh');

  const admin = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adminPage = await admin.newPage();
  await signInAs(adminPage, 'ADMIN');
  await adminPage.goto('/#/billing?tab=arrears');
  const adminWeek5 = adminPage.getByRole('region', { name: 'Minggu 5: hubungi ibu bapa' });
  await adminWeek5.getByRole('button', { name: 'Selesai', exact: true }).click();
  await expect(adminWeek5.getByRole('row').filter({ hasText: 'INV-E2E-' })).toContainText('Berjanji bayar');
  await expect(adminWeek5.getByRole('button', { name: 'Rekod hasil' })).toHaveCount(0);
  await admin.close();
});
