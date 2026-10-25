import { expect, test } from '@playwright/test';
import { api, openAs, signInAs, unique } from './support/auth';

// Phase D: a receipt is corrected by request and never edited in place; the counter is closed with the cash counted
// and checked by someone else; the office checklist is ticked through the day and checked once.

const toast = (page) => page.getByRole('status');
// A 1 x 1 PNG, standing in for the parent's transfer slip
const SLIP = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function otherInvoice(request, amount) {
  const students = await api(request, 'ADMIN', 'GET', '/students/students/');
  const student = students.find((s) => s.status === 'ACTIVE');
  return api(request, 'ADMIN', 'POST', '/billing/invoices/', { student: student.id, description: unique('E2E seminar'), monthly_fee: amount });
}

test.describe.serial('A wrong receipt is corrected by request', () => {
  let receiptNo;

  test('the counter records a payment with the slip and asks to correct the amount', async ({ page }) => {
    const invoice = await otherInvoice(page.request, 80);
    await signInAs(page, 'ADMIN');
    await page.goto('/#/billing');
    await page.getByPlaceholder('Cari no. invois / resit atau pelajar').fill(invoice.invoice_number);
    await page.getByRole('row').filter({ hasText: invoice.invoice_number }).getByRole('button', { name: 'Rekod bayaran' }).click();
    const form = page.getByRole('dialog', { name: 'Rekod bayaran' });
    await form.getByLabel('Amaun diterima (RM)').fill('70');
    await form.getByLabel('Kaedah bayaran').selectOption('CASH');
    await form.getByLabel(/^Bukti bayaran/).setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: SLIP });
    await form.getByRole('button', { name: 'Simpan & keluarkan resit' }).click();

    const receipt = page.getByRole('dialog', { name: /^Resit / });
    await expect(receipt.getByText('slip.png')).toBeVisible(); // the slip went on the receipt
    receiptNo = (await receipt.getAttribute('aria-label')).replace('Resit ', '');
    await receipt.getByRole('button', { name: 'Betulkan resit' }).click();
    const fix = page.getByRole('dialog', { name: `Betulkan resit ${receiptNo}` });
    await fix.getByLabel('Amaun diterima (RM)').fill('80');
    await fix.getByLabel('Sebab pembetulan').fill('Ibu bapa bayar penuh, amaun salah ditaip');
    await fix.getByRole('button', { name: 'Hantar permohonan' }).click();
    await expect(toast(page).filter({ hasText: 'Permohonan dihantar' })).toBeVisible();

    // Nothing changes until it is approved: the receipt is still valid and marked as waiting
    await page.goto('/#/billing?tab=receipts');
    await page.getByLabel('Bulan').selectOption('ALL');
    await page.getByPlaceholder('Cari no. invois / resit atau pelajar').fill(receiptNo);
    const row = page.getByRole('row').filter({ hasText: receiptNo });
    await expect(row).toContainText('Pembetulan menunggu');
    await expect(row).not.toContainText('Dibatalkan');
  });

  test('the Supervisor approves; the old receipt stays struck through and a new one replaces it', async ({ browser }) => {
    const supervisor = await openAs(browser, 'SUPERVISOR');
    const { page } = supervisor;
    await page.goto('/#/billing?tab=corrections');
    const request = page.getByRole('listitem').filter({ hasText: receiptNo });
    await expect(request).toContainText('Betulkan resit');
    await expect(request).toContainText('RM 70.00');
    await request.getByRole('button', { name: 'Luluskan' }).click();
    await expect(toast(page).filter({ hasText: 'Permohonan diluluskan' })).toBeVisible();

    await page.goto('/#/billing?tab=receipts');
    await page.getByLabel('Bulan').selectOption('ALL');
    const old = page.getByRole('row').filter({ hasText: receiptNo }).filter({ hasNotText: 'Menggantikan' });
    await expect(old).toContainText('Dibatalkan');
    const replacement = page.getByRole('row').filter({ hasText: `Menggantikan ${receiptNo}` });
    await expect(replacement).toContainText('RM 80.00');
    await supervisor.close();
  });
});

test.describe.serial('Closing the counter', () => {
  test('Admin counts the cash; a difference has to be explained and shows in red', async ({ page }) => {
    const invoice = await otherInvoice(page.request, 50);
    await api(page.request, 'ADMIN', 'POST', '/billing/receipts/', { invoice: invoice.id, amount_paid: 50, payment_method: 'CASH', payment_type: 'SEMINAR' });
    const day = await api(page.request, 'ADMIN', 'GET', '/billing/cash-close/');
    const cash = Number(day.live.cash_receipts);

    await signInAs(page, 'ADMIN');
    await page.goto('/#/counter');
    await page.getByLabel('Duit tukar awal (RM)').fill('0');
    await page.getByLabel('Tunai dikira (RM)').fill(String(cash - 5));
    await expect(page.getByText('Beza −RM 5.00')).toBeVisible();
    await page.getByLabel(/^Catatan/).fill('Kurang RM5, akan disemak esok');
    await page.getByRole('button', { name: 'Tutup kaunter' }).click();
    await expect(toast(page).filter({ hasText: 'ditutup' })).toBeVisible();
    await expect(page.getByText('Ditutup, menunggu semakan').first()).toBeVisible();
    // Admin is not offered the check
    await expect(page.getByRole('button', { name: 'Sahkan tutup kaunter' })).toHaveCount(0);
  });

  test('the Supervisor returns it for a recount, Admin closes again, the Supervisor verifies', async ({ page, browser }) => {
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/counter');
    await supervisor.page.getByRole('button', { name: 'Kembalikan untuk kira semula' }).click();
    const back = supervisor.page.getByRole('dialog', { name: /^Kembalikan tutup kaunter/ });
    await back.getByLabel(/^Apa yang perlu disemak/).fill('Kira semula syiling');
    await back.getByRole('button', { name: 'Kembalikan' }).click();
    await expect(supervisor.page.getByText('Dikembalikan untuk dikira semula').first()).toBeVisible();

    const day = await api(page.request, 'ADMIN', 'GET', '/billing/cash-close/');
    await signInAs(page, 'ADMIN');
    await page.goto('/#/counter');
    await expect(page.getByText('Kira semula syiling')).toBeVisible();
    await page.getByLabel('Tunai dikira (RM)').fill(String(Number(day.live.cash_receipts)));
    await page.getByRole('button', { name: 'Tutup semula' }).click();
    await expect(page.getByText('Tepat').first()).toBeVisible();

    await supervisor.page.reload();
    await supervisor.page.getByRole('button', { name: 'Sahkan tutup kaunter' }).click();
    await supervisor.page.getByRole('dialog', { name: /^Sahkan tutup kaunter/ }).getByRole('button', { name: 'Sahkan' }).click();
    await expect(supervisor.page.getByText('Disahkan').first()).toBeVisible();
    await expect(supervisor.page.getByRole('button', { name: 'Tutup semula' })).toHaveCount(0); // a verified day is final
    await supervisor.close();
  });

  test('the checklist is ticked by Admin and checked once by the Supervisor', async ({ page, browser }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/counter?tab=checklist');
    await expect(page.getByText('Ditutup oleh Admin 1, disahkan')).toBeVisible(); // what the system sees for the cash item
    await page.getByLabel('Tutup kaunter & kira tunai').click(); // ticked once the server has saved it
    await expect(page.getByLabel('Tutup kaunter & kira tunai')).toBeChecked();

    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/counter?tab=checklist');
    await supervisor.page.getByRole('button', { name: 'Semak senarai' }).click();
    const check = supervisor.page.getByRole('dialog', { name: /^Semak senarai/ });
    await check.getByLabel(/^Catatan/).fill('Nota esok belum siap');
    await check.getByRole('button', { name: 'Semak' }).click();
    await expect(supervisor.page.getByText('Disemak oleh')).toBeVisible();
    await supervisor.close();

    await page.reload();
    await expect(page.getByLabel('Mesej ibu bapa dibalas')).toBeDisabled(); // the day is locked once checked
  });
});
