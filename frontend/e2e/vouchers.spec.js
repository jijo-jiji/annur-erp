import { expect, test } from '@playwright/test';
import { api, signInAs, tryApi, unique } from './support/auth';

// Payment vouchers: the amount decides who must approve (default RM500 / RM3,000), and nobody approves
// a tier above their role, however they ask.

const row = (page, text) => page.getByRole('row').filter({ hasText: text });

async function createThroughTheForm(page, { amount, description }) {
  await page.getByRole('button', { name: 'Baucar baharu' }).click();
  const form = page.getByRole('dialog', { name: 'Baucar bayaran baharu' });
  await form.getByLabel('Penerima bayaran').selectOption({ index: 1 });
  await form.getByLabel(/^Kategori/).selectOption({ index: 1 });
  const sub = form.getByLabel(/^Subkategori/);
  if (await sub.locator('option').count() > 1) await sub.selectOption({ index: 1 });
  await form.getByLabel('Amaun (RM)').fill(String(amount));
  await form.getByLabel('Perkara / tujuan bayaran').fill(description);
  await form.getByRole('button', { name: 'Simpan baucar' }).click();
  await expect(form).toBeHidden();
  // Saving opens the new voucher so attachments can be added; close it to carry on
  const saved = page.getByRole('dialog', { name: /^Baucar [A-Z]{1,6}\d{2}-/ });
  await saved.locator('button', { hasText: 'Tutup' }).click();
  await expect(saved).toBeHidden();
}

// A voucher made by Admin through the API, for tests that are about what happens next
async function voucherWaiting(request, amount) {
  const description = unique(`E2E baucar RM${amount}`);
  const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
  await api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
    vendor: vendor.id, category: 'Utiliti', amount, items_description: description, payment_method: 'CASH',
  });
  return description;
}

test.describe('Payment voucher approval', () => {
  test('the amount decides who has to approve, and Admin approves nothing above the counter limit', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/vouchers');
    const small = unique('E2E kecil');
    const middle = unique('E2E sederhana');
    const large = unique('E2E besar');

    await createThroughTheForm(page, { amount: 120, description: small });
    await createThroughTheForm(page, { amount: 1500, description: middle });
    await createThroughTheForm(page, { amount: 5000, description: large });

    await expect(row(page, small)).toContainText('Disahkan kaunter');
    await expect(row(page, middle)).toContainText('Menunggu supervisor');
    await expect(row(page, large)).toContainText('Menunggu pengurusan');
    // Admin prepares vouchers; deciding is for the next level up
    await expect(page.getByRole('button', { name: 'Lulus' })).toHaveCount(0);
  });

  test('the form tells the person which level will approve before they save', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/vouchers');
    await page.getByRole('button', { name: 'Baucar baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Baucar bayaran baharu' });
    await form.getByLabel('Amaun (RM)').fill('250');
    await expect(form).toContainText('disahkan oleh admin kaunter');
    await form.getByLabel('Amaun (RM)').fill('4000');
    await expect(form).toContainText('perlu kelulusan pengurusan');
  });

  test('Supervisor approves the middle tier but is not offered the top tier', async ({ page, request }) => {
    const middle = await voucherWaiting(request, 1800);
    const large = await voucherWaiting(request, 6000);
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/vouchers');

    await expect(row(page, large).getByRole('button', { name: 'Lulus' })).toHaveCount(0);
    await row(page, middle).getByRole('button', { name: 'Lulus' }).click();
    await expect(row(page, middle)).toContainText('Diluluskan supervisor');
    await expect(row(page, large)).toContainText('Menunggu pengurusan');
  });

  test('the server refuses a Supervisor who tries to approve the top tier directly', async ({ request }) => {
    const description = await voucherWaiting(request, 7000);
    const vouchers = await api(request, 'SUPERVISOR', 'GET', '/expenses/vouchers/');
    const target = vouchers.find((v) => v.items_description === description);
    const res = await tryApi(request, 'SUPERVISOR', 'POST', `/expenses/vouchers/${target.id}/approve/`, {});
    expect(res.status).toBe(403);
  });

  test('Management approves the top tier', async ({ page, request }) => {
    const large = await voucherWaiting(request, 8000);
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/vouchers');
    await row(page, large).getByRole('button', { name: 'Lulus' }).click();
    await expect(row(page, large)).toContainText('Diluluskan pengurusan');
  });

  test('a rejection must say why, and the reason stays on the voucher', async ({ page, request }) => {
    const description = await voucherWaiting(request, 2200);
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/vouchers');
    await row(page, description).getByRole('button', { name: 'Tolak' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tolak' }).click(); // no reason typed: the form does not submit
    await expect(dialog).toBeVisible();
    await expect(row(page, description)).toContainText('Menunggu supervisor');

    await dialog.getByLabel(/Sebab/).fill('Tiada sebut harga');
    await dialog.getByRole('button', { name: 'Tolak' }).click();
    await expect(row(page, description)).toContainText('Ditolak');
    await expect(row(page, description)).toContainText('Tiada sebut harga');
  });
});
